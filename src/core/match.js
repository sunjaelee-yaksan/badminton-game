// 경기 진행(상태 머신). 화면과 완전히 분리된 순수 로직 → 온라인 대전 때 서버/호스트에서 그대로 실행.
//
// 상태: serve(자리 잡기 → 서브 준비 완료) → rally → pause(득점 표시) → serve … → ended
//       idle(튜토리얼 키 연습: 공 없음)
// mode: 'match'(점수 경기) | 'drill'(튜토리얼 연습)
// format: 'singles' | 'doubles' — 선수는 팀(0 아래, 1 위) 단위로 관리
import { GAMEPLAY } from '../config/gameplay.js';
import { serviceBox, standBox, insideWithMargin } from '../config/court.js';
import { stepShuttle, simulate, solveClearingNet } from './physics.js';
import { resolveShot, resolveServe, serveContactPoint, servePreviewTarget } from './shots.js';
import { Scoreboard, judgeLanding } from './rules.js';
import { EventBus, createRng } from './util.js';

export class Match {
  constructor({ rules, players, mode = 'match', seed = Date.now(), drill = null, format }) {
    this.rules = rules;
    this.format = format || rules.format || 'singles';
    this.players = players;
    this.teams = [0, 1].map((t) => players.filter((p) => p.team === t));
    this.mode = mode;
    this.drill = drill;
    this.events = new EventBus();
    this.rng = createRng(seed);
    this.time = 0;
    this.state = 'idle';
    this.scoreboard = new Scoreboard(rules);
    this.shuttle = { x: 0, y: 1, z: 2, vx: 0, vy: 0, vz: 0, netHit: false };
    this.lastHitter = -1;       // 마지막으로 친 선수 idx
    this.lastHitTeam = -1;
    this.isServe = false;
    this.lastServeType = null;
    this.serveHeightFault = false;
    this.serveBox = null;
    this.serverIdx = 0;
    this.receiverIdx = 1;
    this.servingTeam = 0;
    this.serveCourtLR = 'R';
    this.serveReady = false;
    this.positionUntil = 0;
    this.rotationNote = null;   // 화면 설명용: 왜 이 사람이 이 자리에서 서브하는가
    this.prediction = null;
    this.pauseUntil = 0;
    this.drillServeCount = 0;
    this.rallyLength = 0;
    // 복식 좌우 자리: 각 선수의 현재 서비스 코트 위치('R'|'L')
    this.courtOf = {};
    for (const team of this.teams) team.forEach((p, i) => { this.courtOf[p.idx] = i === 0 ? 'R' : 'L'; });
    this.stats = players.map(() => ({ shots: {}, overhead: 0, timingGood: 0, pointsWon: 0, reasons: {}, longestRally: 0 }));
    this.movedMark = players.map(() => 0);
  }

  on(type, fn) { return this.events.on(type, fn); }
  teamOf(idx) { return this.players[idx].team; }

  start() {
    this.placeInitial();
    if (this.mode === 'drill') this.nextDrill();
    else this.setupServe({ reason: 'start' });
  }

  // 경기 시작 때만 기본 위치로 배치(이후에는 선수가 직접 걸어감)
  placeInitial() {
    for (const p of this.players) {
      const c = this.courtOf[p.idx];
      const xs = (c === 'R' ? p.side : -p.side) * (this.format === 'doubles' ? 1.3 : 0);
      p.place(xs, p.side * 3.6);
    }
  }

  setDrill(drill) {
    this.drill = drill;
    this.state = 'pause';
    this.pauseUntil = this.time + 0.6;
    for (const p of this.players) p.locked = false;
  }

  // ── 서브 준비 ──────────────────────────────────────
  // 단식: 서버 점수 짝수 → 오른쪽. 복식: 아래 rotate()에서 서버·자리를 정함
  setupServe({ reason, serverIdx, court }) {
    const sb = this.scoreboard;
    if (serverIdx == null) {
      const team = sb.server;
      court = sb.serveCourt(team);
      const members = this.teams[team];
      serverIdx = members.length === 1 ? members[0].idx : members.find((p) => this.courtOf[p.idx] === court).idx;
    }
    const server = this.players[serverIdx];
    const recvTeam = this.teams[1 - server.team];
    const receiver = recvTeam.length === 1 ? recvTeam[0] : recvTeam.find((p) => this.courtOf[p.idx] === court);
    for (const p of this.players) { p.locked = false; p.swing = null; }
    this.serverIdx = serverIdx;
    this.receiverIdx = receiver.idx;
    this.servingTeam = server.team;
    this.serveCourtLR = court;
    this.serveBox = serviceBox(receiver.side, court, this.format);
    this.serverStand = standBox(server.side, court, this.format);
    this.receiverStand = standBox(receiver.side, court, this.format);
    this.state = 'serve';
    this.serveReady = false;
    this.positionUntil = this.time + GAMEPLAY.serve.positionTime;
    this.serveHeightFault = false;
    server.serveHeight = GAMEPLAY.serve.contactHeight;
    this.holdShuttle();
    this.prediction = null;
    this.rallyLength = 0;
    this.rotationNote = {
      reason, court, server: serverIdx, receiver: receiver.idx,
      team: server.team, score: sb.score[server.team], format: this.format,
    };
    this.events.emit('serveSetup', { ...this.rotationNote, score: [...sb.score] });
  }

  holdShuttle() {
    const server = this.players[this.serverIdx];
    Object.assign(this.shuttle, serveContactPoint(server), { vx: 0, vy: 0, vz: 0, netHit: false });
  }

  inPlace(idx) {
    const p = this.players[idx];
    const box = idx === this.serverIdx ? this.serverStand : this.receiverStand;
    return insideWithMargin(p.x, p.z, box);
  }

  serveCountdown() { return Math.max(0, this.positionUntil - this.time); }

  updateServe() {
    this.holdShuttle();
    if (this.serveReady) return;
    if (this.time < this.positionUntil) return;
    if (!this.inPlace(this.serverIdx) || !this.inPlace(this.receiverIdx)) return;
    // 자리 잡기 완료 → 서버·리시버는 서브가 끝날 때까지 움직이지 않음
    this.serveReady = true;
    this.players[this.serverIdx].locked = true;
    this.players[this.receiverIdx].locked = true;
    for (const p of this.players) p.input.heightAdj = 0;
    this.events.emit('serveReady', { serverIdx: this.serverIdx, receiverIdx: this.receiverIdx });
    this.events.emit('positionOk', { idx: this.serverIdx, role: 'server' });
    this.events.emit('positionOk', { idx: this.receiverIdx, role: 'receiver' });
  }

  getServeInfo() {
    if (this.state !== 'serve') return null;
    const server = this.players[this.serverIdx];
    const receiver = this.players[this.receiverIdx];
    const aim = { lat: server.input.aimLat, depth: 0 };
    const base = { server, receiverSide: receiver.side, court: this.serveCourtLR, aim, format: this.format };
    return {
      ready: this.serveReady,
      countdown: this.serveCountdown(),
      serverIdx: this.serverIdx,
      receiverIdx: this.receiverIdx,
      serverInPlace: this.inPlace(this.serverIdx),
      receiverInPlace: this.inPlace(this.receiverIdx),
      serverStand: this.serverStand,
      receiverStand: this.receiverStand,
      box: this.serveBox,
      from: serveContactPoint(server),
      height: server.serveHeight,
      long: servePreviewTarget({ ...base, type: 'long_serve' }),
      short: servePreviewTarget({ ...base, type: 'short_serve' }),
    };
  }

  doServe(button) {
    const server = this.players[this.serverIdx];
    const receiver = this.players[this.receiverIdx];
    const res = resolveServe({
      server, receiverSide: receiver.side, court: this.serveCourtLR, button,
      aim: { lat: server.input.aimLat, depth: 0 },
      rng: this.rng, effects: server.effects, format: this.format, aiAimMul: server.aimMul ?? 1,
    });
    Object.assign(this.shuttle, res.from, res.vel, { netHit: false });
    this.lastHitter = server.idx;
    this.lastHitTeam = server.team;
    this.isServe = true;
    this.serveHeightFault = res.heightFault;
    this.lastServeType = res.type;
    this.state = 'rally';
    for (const p of this.players) p.locked = false;
    server.lastSwingStart = this.time;
    this.recordShot(server.idx, res);
    this.events.emit('shot', { idx: server.idx, type: res.type, timing: 'good', position: 'good', isServe: true, heightFault: res.heightFault, height: res.from.y });
    this.computePrediction();
  }

  // ── 입력 ───────────────────────────────────────────
  press(idx, button) {
    const p = this.players[idx];
    this.events.emit('press', { idx, button });
    if (this.state === 'serve') {
      if (idx === this.serverIdx && this.serveReady) this.doServe(button);
      return;
    }
    if (this.state !== 'rally' && this.state !== 'idle') return;
    const r = p.press(button, this.time, this.state === 'idle' ? 0 : this.shuttle.y);
    if (r === 'chord') this.events.emit('chord', { idx, chord: p.swing.chord });
  }

  dash(idx) {
    const r = this.players[idx].requestDash();
    this.events.emit(r === 'ok' ? 'dash' : 'dashFail', { idx, reason: r });
  }

  // ── 진행 ───────────────────────────────────────────
  update(dt) {
    this.time += dt;
    const now = this.time;
    for (const p of this.players) {
      if (p.swing && !p.swing.contacted && now - p.swing.start > GAMEPLAY.swing.window) {
        if (this.state === 'rally' && this.lastHitTeam !== p.team && this.shuttle.z * p.side > 0) {
          this.events.emit('whiff', { idx: p.idx });
        }
      }
      p.update(dt, now);
      const meters = Math.floor(p.distance);
      if (meters > this.movedMark[p.idx]) {
        this.movedMark[p.idx] = meters;
        this.events.emit('moved', { idx: p.idx, meters });
      }
    }

    if (this.state === 'serve') {
      this.updateServe();
    } else if (this.state === 'rally') {
      stepShuttle(this.shuttle, dt);
      for (const p of this.players) {
        const sw = p.swing;
        if (!sw || sw.contacted) continue;
        const el = now - sw.start;
        if (el >= sw.contactDelay && el <= GAMEPLAY.swing.window && this.canHit(p)) {
          this.hit(p);
          break;
        }
      }
      if (this.shuttle.y <= 0) this.onLand();
    } else if (this.state === 'pause' && now >= this.pauseUntil) {
      this.next();
    }
  }

  canHit(p) {
    const s = this.shuttle;
    const R = GAMEPLAY.reach;
    if (this.lastHitTeam === p.team || s.netHit) return false;   // 같은 팀이 연속으로 칠 수 없음
    if (this.isServe && this.serveHeightFault) return false;      // 서브 폴트는 받아 칠 필요 없음
    if (s.z * p.side <= 0) return false;                          // 셔틀이 우리 코트로 넘어온 뒤에만
    if (s.y < R.minY || s.y > R.maxY) return false;
    return Math.hypot(s.x - p.x, s.z - p.z) <= R.horizontal;
  }

  hit(p) {
    const res = resolveShot({
      player: p, button: p.swing.button, smashIntent: p.swing.smashIntent, chord: p.swing.chord,
      shuttle: this.shuttle, aim: { lat: p.input.aimLat, depth: p.input.aimDepth },
      rng: this.rng, effects: p.effects, aiAimMul: p.aimMul ?? 1,
    });
    p.swing.contacted = true;
    if (res.stamina) p.stamina = Math.max(0, p.stamina - res.stamina);
    Object.assign(this.shuttle, res.from, res.vel, { netHit: false });
    this.lastHitter = p.idx;
    this.lastHitTeam = p.team;
    this.isServe = false;
    this.rallyLength += 1;
    this.recordShot(p.idx, res);
    this.events.emit('shot', {
      idx: p.idx, type: res.type, timing: res.timing, position: res.position,
      wrongSide: res.wrongSide, noStamina: res.noStamina, isServe: false,
    });
    this.computePrediction();
  }

  recordShot(idx, res) {
    const st = this.stats[idx];
    st.shots[res.type] = (st.shots[res.type] || 0) + 1;
    if (['clear', 'smash', 'drop', 'backhand_clear', 'backhand_smash', 'backhand_drop', 'drive'].includes(res.type)) {
      st.overhead += 1;
      if (res.timing === 'good' && res.position === 'good') st.timingGood += 1;
    }
  }

  onLand() {
    const s = this.shuttle;
    s.y = 0; s.vx = 0; s.vy = 0; s.vz = 0;
    const landing = { x: s.x, z: s.z };
    const hitTeam = this.lastHitTeam;
    const res = judgeLanding({
      landing, hitterIdx: hitTeam, hitterSide: hitTeam === 0 ? 1 : -1, isServe: this.isServe,
      serveBox: this.serveBox, netHit: s.netHit, format: this.format, serveHeightFault: this.serveHeightFault,
    });
    this.prediction = null;
    this.state = 'pause';

    if (this.mode === 'drill') {
      if (this.isServe) this.events.emit('serveResult', { idx: this.lastHitter, type: this.lastServeType, in: res.reason === 'in', reason: res.reason });
      this.events.emit('drillLanding', { ...res, landing, hitterIdx: this.lastHitter });
      this.pauseUntil = this.time + 1.2;
      return;
    }

    const prevServingTeam = this.scoreboard.server;
    this.scoreboard.award(res.winner);
    // 복식: 서브한 팀이 이기면 서버 팀 두 사람이 좌우 자리를 바꿈
    let rotation = 'change';
    if (res.winner === prevServingTeam) {
      rotation = 'keep';
      const t = this.teams[res.winner];
      if (t.length === 2) {
        const [a, b] = t;
        [this.courtOf[a.idx], this.courtOf[b.idx]] = [this.courtOf[b.idx], this.courtOf[a.idx]];
      }
    }
    this.pendingRotation = rotation;
    for (const p of this.players.filter((q) => q.team === res.winner)) this.stats[p.idx].pointsWon += 1;
    this.stats.forEach((x) => { x.longestRally = Math.max(x.longestRally, this.rallyLength); });
    this.events.emit('point', {
      ...res, landing, hitterIdx: this.lastHitter, isServe: this.isServe,
      score: [...this.scoreboard.score], status: this.scoreboard.status(),
    });
    this.pauseUntil = this.time + GAMEPLAY.pointPause;
  }

  next() {
    if (this.mode === 'drill') return this.nextDrill();
    const w = this.scoreboard.winner();
    if (w >= 0) {
      this.state = 'ended';
      this.events.emit('matchEnd', { winner: w, score: [...this.scoreboard.score], stats: this.stats });
      return;
    }
    this.setupServe({ reason: this.pendingRotation });
  }

  // ── 튜토리얼 연습 ──────────────────────────────────
  nextDrill() {
    const d = this.drill || {};
    if (d.idle) {
      this.state = 'idle';
      for (const p of this.players) p.locked = false;
      Object.assign(this.shuttle, { x: 0, y: 0, z: -9, vx: 0, vy: 0, vz: 0 });
      return;
    }
    if (d.playerServes) {
      const court = this.drillServeCount % 2 === 0 ? 'R' : 'L';
      this.drillServeCount += 1;
      this.setupServe({ reason: 'drill', serverIdx: 0, court });
      // 연습 상대(리시버)는 바로 자기 서비스 코트에 서 있음
      const r = this.players[this.receiverIdx];
      const b = this.receiverStand;
      r.place((b.xMin + b.xMax) / 2, r.side * 3.4);
      return;
    }
    this.feed(this.rng.pick(d.feeds || ['lift_center']), d.feedSpecs);
  }

  // 연습용으로 상대 팀 첫 선수가 공을 띄워 줌
  feed(name, specs) {
    const spec = specs[name];
    const feeder = this.teams[1][0];
    feeder.place(spec.from.x, spec.from.z);
    for (const p of this.players) p.locked = false;
    const from = { x: feeder.x, y: spec.height ?? 1.0, z: feeder.z };
    const target = {
      x: spec.target.x + this.rng.range(-1, 1) * (spec.jitter ?? 0.4),
      z: spec.target.z + this.rng.range(-1, 1) * (spec.jitter ?? 0.4) * 0.6,
    };
    const def = GAMEPLAY.shots[spec.shot];
    const { vel } = solveClearingNet(from, target, def.elevation, def.speedMax, feeder.side);
    Object.assign(this.shuttle, from, vel, { netHit: false });
    this.lastHitter = feeder.idx;
    this.lastHitTeam = feeder.team;
    this.isServe = false;
    this.state = 'rally';
    feeder.lastSwingStart = this.time;
    this.computePrediction();
    this.events.emit('feed', { name });
  }

  // ── 궤적 예측: 그림자·빨간 원·타이밍 링·AI 이동 ──
  computePrediction() {
    const sim = simulate(this.shuttle);
    const recvTeam = 1 - this.lastHitTeam;
    const side = recvTeam === 0 ? 1 : -1;
    let ideal = null;
    let takerIdx = null;
    if (!sim.netHit && Math.sign(sim.landing.z) === side) {
      const pts = sim.points;
      const find = (h) => {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (b.z * side <= 0.05) continue;
          if (b.vy < 0 && a.y > h && b.y <= h) return b;
        }
        return null;
      };
      let kind = 'overhead';
      let hp = find(GAMEPLAY.idealHeight.overhead);
      if (!hp) { kind = 'low'; hp = find(GAMEPLAY.idealHeight.low); }
      if (!hp) { kind = 'low'; hp = pts[Math.max(0, pts.length - 4)]; }
      const delay = kind === 'overhead' ? GAMEPLAY.swing.chordWindow : GAMEPLAY.swing.quickContact;
      ideal = {
        kind,
        time: this.time + hp.t,
        pressAt: this.time + hp.t - delay,
        hit: { x: hp.x, y: hp.y, z: hp.z },
        stand: { x: hp.x, z: hp.z + side * GAMEPLAY.idealStandOffset },
      };
      // 복식: 누가 받을지 (사람이 비슷한 거리면 사람에게 양보)
      let best = Infinity;
      for (const p of this.teams[recvTeam]) {
        let d = Math.hypot(p.x - ideal.stand.x, p.z - ideal.stand.z);
        if (!p.isAI) d -= 0.6;
        if (d < best) { best = d; takerIdx = p.idx; }
      }
    }
    this.prediction = {
      createdAt: this.time, receiverTeam: recvTeam, takerIdx,
      landing: sim.landing, netHit: sim.netHit, ideal, points: sim.points,
    };
  }
}
