// 한 판(경기·튜토리얼·메뉴 배경 데모·온라인)을 실행: 로직 + 입력 + 화면 연결
// 선수 자리(slot)마다 조종 주체: 'local'(이 기기) | 'ai' | 'remote'(온라인 참가자)
//
// 온라인(P2P):
//   방장(net.role='host')  : 경기를 계산하고, 참가자 입력을 받아 반영, 상태를 30회/초 전송
//   참가자(net.role='client'): 경기 계산 없이 방장 상태를 받아 그림. 내 선수 이동만 먼저 움직여 반응 지연을 줄임
import { Match } from '../core/match.js';
import { Player } from '../core/player.js';
import { AIController } from '../core/ai.js';
import { stepShuttle } from '../core/physics.js';
import { GAMEPLAY } from '../config/gameplay.js';
import { RULE_PRESETS, SPEED_PRESETS } from '../config/rules.js';
import { AI_LEVELS } from '../config/ai.js';
import { NETWORK } from '../config/network.js';
import { DEFAULT_CHARACTER, effectiveStats } from '../config/progression.js';
import { FEEDS } from '../tutorial/lessons.js';
import { makeSnapshot, applySnapshot, smoothRemotePlayers } from '../net/snapshot.js';
import { t } from '../i18n/index.js';

const OVERHEAD_FEEDBACK = new Set(['clear', 'smash', 'drop', 'backhand_clear', 'backhand_smash', 'backhand_drop', 'drive']);
const COLORS = [0x2f6fde, 0x6fb0ff, 0xd9433b, 0xf08a3c];
const FORWARD_EVENTS = ['shot', 'point', 'whiff', 'chord', 'dash', 'dashFail', 'serveSetup', 'serveReady', 'matchEnd', 'drillLanding'];

// 화면 기준 입력(x 오른쪽+, y 위+) → 선수 입력. 위 코트 선수는 화면이 반대로 돌아 있으므로 side를 곱함
export function applyScreenInput(p, x, y, fpServe) {
  p.input.moveX = x * p.side;
  p.input.moveZ = -y * p.side;
  p.input.aimLat = x;
  p.input.aimDepth = fpServe ? 0 : y;
  p.input.heightAdj = fpServe ? y : 0;
}

export function defaultSlots(format, kind) {
  if (format === 'doubles') {
    return [
      { type: kind === 'demo' ? 'ai' : 'local', name: t('player.me') },
      { type: 'ai', name: t('player.mate') },
      { type: 'ai', name: t('player.opp1') },
      { type: 'ai', name: t('player.opp2') },
    ];
  }
  return [{ type: kind === 'demo' ? 'ai' : 'local', name: t('player.me') }, { type: 'ai', name: t('player.ai') }];
}

export class GameSession {
  // kind: 'match' | 'tutorial' | 'demo'
  constructor({ kind, format = 'singles', rulesId, settings, renderer, hud, keyboard, touch, drill, onEnd, slots, net }) {
    this.kind = kind;
    this.format = format;
    this.settings = settings;
    this.renderer = renderer;
    this.hud = hud;
    this.keyboard = keyboard;
    this.touch = touch;
    this.onEnd = onEnd;
    this.net = net || null;
    this.isClient = this.net?.role === 'client';
    this.speed = SPEED_PRESETS[settings.speed] ?? 0.82;
    this.acc = 0;
    this.running = false;
    this.paused = false;
    this.ais = [];
    this.slots = slots || defaultSlots(format, kind);
    this.humanIdx = this.slots.findIndex((s) => s.type === 'local');
    this.remoteInput = {}; // idx → {x, y}

    // 1~2단계: 모두 같은 기본 캐릭터(수업 모드 = 능력치 평준화)
    const stats = effectiveStats(DEFAULT_CHARACTER, { classMode: true });
    const perTeam = format === 'doubles' ? 2 : 1;
    // 색: 우리 팀은 파랑 계열, 상대 팀은 빨강 계열 (온라인 참가자 화면에서도 내가 파랑)
    const myTeamIdx = this.humanIdx >= 0 && this.humanIdx >= perTeam ? 1 : 0;
    const colorOf = (i, team) => {
      const k = perTeam === 2 ? i % 2 : 0;
      return team === myTeamIdx ? (i === this.humanIdx || k === 0 ? COLORS[0] : COLORS[1]) : COLORS[2 + k];
    };
    const players = this.slots.map((s, i) => {
      const team = i < perTeam ? 0 : 1;
      return new Player({ idx: i, team, name: s.name, stats: { ...stats }, color: colorOf(i, team), isAI: s.type === 'ai' });
    });
    if (perTeam === 2 && this.humanIdx >= 0) {
      const mate = players.find((q) => q.team === myTeamIdx && q.idx !== this.humanIdx);
      players[this.humanIdx].color = COLORS[0];
      if (mate) mate.color = COLORS[1];
    }

    const rules = RULE_PRESETS[rulesId ?? (kind === 'demo' ? 'official' : settings.rules)];
    this.match = new Match({
      rules, players, format,
      mode: kind === 'tutorial' && drill ? 'drill' : 'match',
      drill: drill ? { ...drill, feedSpecs: FEEDS } : null,
      seed: Math.floor(Math.random() * 1e9),
    });
    this.aiLevel = AI_LEVELS[settings.ai] ?? AI_LEVELS.easy;
    if (this.match.mode === 'match' && !this.isClient) {
      for (const p of players) if (p.isAI) this.addAI(p.idx);
    }
    renderer.setPlayers(players);
    if (kind !== 'demo') this.bindFeedback();
    if (this.net?.role === 'host') this.setupHost();
    if (this.isClient) this.setupClient();
  }

  addAI(idx) {
    const p = this.match.players[idx];
    const me = this.match.players[this.humanIdx];
    // 내 파트너 AI는 한 단계 높은 실력(보통), 상대 AI는 설정 난이도
    const lv = this.kind === 'demo' ? AI_LEVELS.normal : me && p.team === me.team ? AI_LEVELS.normal : this.aiLevel;
    p.isAI = true;
    this.ais.push(new AIController(this.match, idx, lv, Math.floor(Math.random() * 1e6)));
  }

  name(idx) { return this.match.players[idx].name; }
  get myTeam() { return this.match.players[this.humanIdx]?.team ?? 0; }

  // ── 온라인: 방장 ───────────────────────────────────
  setupHost() {
    const { room } = this.net;
    this.peerSlot = {};
    this.slots.forEach((s, i) => { if (s.type === 'remote') this.peerSlot[s.peer] = i; });
    this.lastSeen = {};
    for (const peer of Object.keys(this.peerSlot)) this.lastSeen[peer] = performance.now();
    room.onMessage = (peer, msg) => {
      const idx = this.peerSlot[peer];
      this.lastSeen[peer] = performance.now();
      if (msg.t === 'hello') { this.net.onOther?.(peer, msg); return; } // 경기 중에 새로 들어온 사람 → 대기 명단
      if (idx == null) return;
      if (msg.t === 'in') this.remoteInput[idx] = { x: msg.x, y: msg.y };
      else if (msg.t === 'btn') this.match.press(idx, msg.b);
      else if (msg.t === 'dash') { this.applyRemote(idx); this.match.dash(idx); }
    };
    room.onLeave = (peer) => this.dropPeer(peer);
    this.match.events.on('*', (type, payload) => {
      if (FORWARD_EVENTS.includes(type)) room.broadcast({ t: 'ev', type, p: payload });
    });
    this.lastSnap = 0;
  }

  // 참가자가 나감(연결 끊김 또는 4초 이상 입력 없음) → 그 자리는 AI가 이어서
  dropPeer(peer) {
    const idx = this.peerSlot[peer];
    if (idx == null) return;
    delete this.peerSlot[peer];
    delete this.remoteInput[idx];
    this.hud.toast(t('online.left', { name: this.name(idx) }), 'hint', 2.5);
    this.addAI(idx);
    this.net.room.kick(peer);
  }

  applyRemote(idx) {
    const inp = this.remoteInput[idx];
    if (!inp) return;
    const m = this.match;
    const p = m.players[idx];
    const fp = m.state === 'serve' && m.serveReady && m.serverIdx === idx;
    applyScreenInput(p, inp.x, inp.y, fp);
  }

  // ── 온라인: 참가자 ─────────────────────────────────
  setupClient() {
    const { room } = this.net;
    this.match.state = 'idle'; // 첫 상태를 받기 전까지
    room.onMessage = (msg) => {
      if (msg.t === 's') {
        applySnapshot(this.match, msg, this.humanIdx);
        this.gotSnapshot = true;
      } else if (msg.t === 'ev') {
        this.match.events.emit(msg.type, msg.p);
      } else {
        this.net.onOther?.(msg); // 대기실 복귀, 새 경기 시작, 방 닫힘
      }
    };
    this.lastInputSent = 0;
  }

  // ── 화면 안내 ──────────────────────────────────────
  bindFeedback() {
    const m = this.match, hud = this.hud;
    const me = () => this.humanIdx;
    m.on('shot', (e) => {
      const name = t(`shot.${e.type}`);
      if (e.idx !== me()) { hud.toast(`${this.name(e.idx)}: ${name}`, 'ai', 1.0); return; }
      if (e.isServe) {
        hud.toast(name, 'me');
        if (e.heightFault) hud.toast(t('reason.serveHeight'), 'bad', 2.4);
        return;
      }
      const timing = OVERHEAD_FEEDBACK.has(e.type) ? ` · ${t(`timing.${e.timing}`)}` : '';
      hud.toast(`${name}${timing}`, e.timing === 'good' && e.position === 'good' ? 'good' : 'me');
      if (e.position !== 'good') hud.toast(t(`position.${e.position}`), 'hint', 2.2);
      if (e.wrongSide) hud.toast(t('hint.wrongSide'), 'hint', 2.2);
      if (e.noStamina) hud.toast(t('hint.noStamina'), 'hint', 2.2);
    });
    m.on('chord', (e) => { if (e.idx === me()) hud.toast(t('hint.smashReady'), 'good', 0.6); });
    m.on('whiff', (e) => { if (e.idx === me()) hud.toast(t('hint.whiff'), 'bad', 1.0); });
    m.on('dashFail', (e) => {
      if (e.idx === me() && (e.reason === 'still' || e.reason === 'stamina')) hud.toast(t(`dash.${e.reason}`), 'hint', 1.4);
    });
    m.on('point', (e) => {
      const ours = e.winner === this.myTeam;
      hud.toast(`${t(`reason.${e.reason}`)}  ${ours ? t('point.us') : t('point.them')}`, ours ? 'good' : 'bad', 1.8);
      if (e.status) hud.toast(t(`status.${e.status}`), 'hint', 2.0);
    });
    m.on('drillLanding', (e) => {
      if (e.hitterIdx === me()) hud.toast(t(`reason.${e.reason}`), e.reason === 'in' ? 'good' : 'bad', 1.2);
    });
    m.on('matchEnd', (e) => {
      if (!this.isClient) this.stop();
      else this.running = false;
      this.onEnd?.({ won: e.winner === this.myTeam, score: e.score, stats: e.stats[this.humanIdx], format: this.format, myTeam: this.myTeam });
    });
  }

  // 서브 차례 안내: 카운트다운, 내 역할과 가야 할 칸, 복식 로테이션 이유
  serveBanner() {
    const m = this.match;
    if (this.isClient && !this.gotSnapshot) { this.hud.banner(`<b>${t('online.connecting')}</b>`); return; }
    const info = m.getServeInfo();
    if (!info) { this.hud.hideBanner(); return; }
    const court = t(`court.${m.serveCourtLR}`);
    const me = this.humanIdx;
    const role = info.serverIdx === me ? 'server' : info.receiverIdx === me ? 'receiver' : 'none';
    let main;
    if (info.ready) {
      main = info.serverIdx === me ? t('serve.fp') : t('serve.wait', { name: this.name(info.serverIdx) });
    } else if (info.countdown > 0) {
      main = `<span class="countdown">${Math.ceil(info.countdown)}</span>${t(`role.${role}`, { court })}`;
    } else if (role !== 'none' && !(role === 'server' ? info.serverInPlace : info.receiverInPlace)) {
      main = t(`role.${role}.move`, { court });
    } else {
      main = t('serve.waitPlace');
    }
    this.hud.banner(`<b>${main}</b>${this.rotationText()}`);
  }

  rotationText() {
    const n = this.match.rotationNote;
    if (!n || n.reason === 'drill') return '';
    const team = n.team === this.myTeam ? t('team.us') : t('team.them');
    const parity = n.score % 2 === 0 ? t('parity.even') : t('parity.odd');
    const court = t(`court.${n.court}`);
    if (n.format !== 'doubles') return `<span class="rot">${t('rot.singles', { name: this.name(n.server), score: n.score, parity, court })}</span>`;
    const key = n.reason === 'keep' ? 'rot.keep' : n.reason === 'start' ? 'rot.start' : 'rot.change';
    return `<span class="rot">${t(key, { team, score: n.score, parity, court, name: this.name(n.server), recv: this.name(n.receiver) })}</span>`;
  }

  // ── 실행 루프 ──────────────────────────────────────
  start() {
    this.running = true;
    if (!this.isClient) this.match.start();
    this.last = performance.now();
    const loop = (ts) => {
      if (!this.running) return;
      const realDt = Math.min(0.1, (ts - this.last) / 1000);
      this.last = ts;
      if (this.isClient) this.clientTick(realDt);
      else if (!this.paused) this.tick(realDt);
      if (this.net?.role === 'host') this.hostBroadcast(ts);
      this.renderer.update(this.match, this.humanIdx);
      if (this.kind !== 'demo') {
        this.hud.update(this.match, this.humanIdx);
        this.serveBanner();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  tick(realDt) {
    const dt = GAMEPLAY.fixedDt;
    this.acc += realDt * this.speed;
    while (this.acc >= dt) {
      for (const ai of this.ais) ai.update();
      if (this.humanIdx >= 0) this.applyLocalInput();
      for (const idx of Object.keys(this.remoteInput)) if (!this.match.players[idx].isAI) this.applyRemote(Number(idx));
      this.match.update(dt);
      this.acc -= dt;
    }
  }

  hostBroadcast(ts) {
    for (const [peer, seen] of Object.entries(this.lastSeen)) {
      if (this.peerSlot[peer] != null && ts - seen > 4000) this.dropPeer(peer);
    }
    if (ts - this.lastSnap < 1000 / NETWORK.snapshotHz) return;
    this.lastSnap = ts;
    this.net.room.broadcast(makeSnapshot(this.match));
  }

  // 참가자: 셔틀은 물리로 이어서 그리고, 내 선수는 바로 움직이고, 입력은 방장에게 전송
  clientTick(realDt) {
    const m = this.match;
    const simDt = realDt * this.speed;
    m.time += simDt;
    if (m.state === 'rally') {
      this.acc += simDt;
      while (this.acc >= GAMEPLAY.fixedDt) { stepShuttle(m.shuttle, GAMEPLAY.fixedDt); this.acc -= GAMEPLAY.fixedDt; }
      if (m.shuttle.y < 0) m.shuttle.y = 0;
    } else this.acc = 0;
    const { x, y } = this.readAxes();
    const me = m.players[this.humanIdx];
    applyScreenInput(me, x, y, m.state === 'serve' && m.serveReady && m.serverIdx === this.humanIdx);
    me.update(simDt, m.time);
    smoothRemotePlayers(m, this.humanIdx);
    const now = performance.now();
    if (now - this.lastInputSent > 1000 / NETWORK.inputHz) {
      this.lastInputSent = now;
      this.net.room.send({ t: 'in', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
    }
  }

  readAxes() {
    const k = this.keyboard.axes();
    const tc = this.touch ? this.touch.axes() : { x: 0, y: 0 };
    let x = k.x + tc.x, y = k.y + tc.y;
    const mg = Math.hypot(x, y);
    if (mg > 1) { x /= mg; y /= mg; }
    return { x, y };
  }

  applyLocalInput() {
    const m = this.match;
    const p = m.players[this.humanIdx];
    const { x, y } = this.readAxes();
    applyScreenInput(p, x, y, m.state === 'serve' && m.serveReady && m.serverIdx === this.humanIdx);
  }

  press(button) {
    if (!this.running || this.paused || this.humanIdx < 0) return;
    if (this.isClient) { this.net.room.send({ t: 'btn', b: button }); this.match.players[this.humanIdx].lastSwingStart = this.match.time; return; }
    this.match.press(this.humanIdx, button);
  }

  dash() {
    if (!this.running || this.paused || this.humanIdx < 0) return;
    if (this.isClient) {
      this.net.room.send({ t: 'in', ...this.readAxes() });
      this.net.room.send({ t: 'dash' });
      return;
    }
    this.applyLocalInput(); // 방향키와 대시 키를 거의 동시에 눌러도 인식되도록 지금 입력을 바로 반영
    this.match.dash(this.humanIdx);
  }

  // 온라인 경기는 일시정지 없음(다른 사람이 함께 하므로)
  setPaused(p) { this.paused = this.net ? false : p; }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.match.events.clear();
  }
}
