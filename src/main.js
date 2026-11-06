import './styles.css';
import { CourtRenderer } from './render/scene.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';
import { KeyboardInput } from './input/keyboard.js';
import { TouchInput, isTouchDevice } from './input/touch.js';
import { GameSession } from './game/session.js';
import { HostRoom, ClientRoom, normalizeCode } from './net/room.js';
import { TutorialRunner } from './tutorial/tutorial.js';
import { createStorage } from './storage/storage.js';
import { DEFAULT_SETTINGS } from './config/rules.js';
import { setLang, t } from './i18n/index.js';

const storage = createStorage();
const $ = (s) => document.querySelector(s);

const app = {
  settings: { ...DEFAULT_SETTINGS },
  session: null,
  tutorial: null,
  renderer: null,
  hud: null,
  screens: null,
  keyboard: null,
  touch: null,
  online: null, // { role, room, code, format, slots, you }
};

async function init() {
  app.settings = { ...DEFAULT_SETTINGS, ...(await storage.get('settings', {})) };
  setLang(app.settings.lang);
  app.renderer = new CourtRenderer($('#stage'));
  app.hud = new Hud($('#hud'));
  app.screens = new Screens($('#screens'));
  app.hud.onPause(togglePause);

  const handlers = {
    onButton: (b) => app.session?.press(b),
    onDash: () => app.session?.dash(),
    onPause: togglePause,
  };
  app.keyboard = new KeyboardInput(handlers);
  app.keyboard.attach();
  if (isTouchDevice()) {
    $('#touch').classList.remove('hidden');
    app.touch = new TouchInput($('#touch'), handlers);
  }
  document.title = t('app.title');
  showMenu();
}

function endSession() {
  app.tutorial?.destroy();
  app.hud.hideBanner?.();
  app.tutorial = null;
  app.session?.stop();
  app.session = null;
}

function startDemo() {
  endSession();
  app.hud.show(false);
  app.session = new GameSession({ kind: 'demo', settings: app.settings, renderer: app.renderer, hud: app.hud, keyboard: app.keyboard });
  app.session.start();
}

function showMenu() {
  if (app.online?.room) leaveOnline();
  if (!app.session || app.session.kind !== 'demo') startDemo();
  $('#touch').classList.add('dim');
  app.screens.menu({
    onPlay: () => startMatch('singles'),
    onDoubles: () => startMatch('doubles'),
    onOnline: showOnline,
    onTutorial: showTutorials,
    onControls: () => app.screens.controls({ onBack: showMenu }),
    onSettings: showSettings,
  });
}

function showSettings() {
  app.screens.settings(app.settings, {
    onChange: async (k, v) => {
      app.settings[k] = v;
      await storage.set('settings', app.settings);
      if (k === 'lang') {
        setLang(v);
        document.title = t('app.title');
        app.touch?.relabel();
        showSettings();
      }
    },
    onBack: showMenu,
  });
}

function startMatch(format = 'singles') {
  endSession();
  app.screens.hide();
  $('#touch').classList.remove('dim');
  app.hud.show(true);
  const names = format === 'doubles'
    ? [`${t('player.me')} + ${t('player.mate')}`, `${t('team.them')} (${t(`ai.${app.settings.ai}`)})`]
    : [t('player.me'), `${t('player.ai')} (${t(`ai.${app.settings.ai}`)})`];
  app.hud.setup({ names, ruleLabel: t(`rules.${app.settings.rules}`) });
  app.session = new GameSession({
    kind: 'match', format, settings: app.settings, renderer: app.renderer, hud: app.hud,
    keyboard: app.keyboard, touch: app.touch,
    onEnd: async (result) => {
      const history = await storage.get('history', []);
      history.push({ at: new Date().toISOString(), format, rules: app.settings.rules, ai: app.settings.ai, score: result.score, won: result.won });
      await storage.set('history', history.slice(-50));
      app.hud.show(false);
      app.screens.result(result, { onAgain: () => startMatch(format), onMenu: showMenu });
    },
  });
  app.session.start();
}

async function showTutorials() {
  const progress = await storage.get('tutorialProgress', {});
  app.screens.tutorialList(progress, { onPick: startTutorial, onBack: showMenu });
}

function startTutorial(lesson) {
  endSession();
  app.screens.hide();
  $('#touch').classList.remove('dim');
  app.hud.show(true);
  const setup = lesson.setup;
  app.hud.setup({
    names: setup?.format === 'doubles' ? [`${t('player.me')} + ${t('player.mate')}`, t('team.them')] : [t('player.me'), t('player.ai')],
    ruleLabel: setup ? t(`rules.${setup.rules}`) : '',
    showScore: !!setup,
  });
  app.session = new GameSession({
    kind: 'tutorial', format: setup?.format ?? 'singles', rulesId: setup?.rules,
    settings: { ...app.settings, ai: 'easy' }, renderer: app.renderer, hud: app.hud,
    keyboard: app.keyboard, touch: app.touch, drill: lesson.steps[0].drill,
    onEnd: () => app.tutorial?.finishNow(),
  });
  app.tutorial = new TutorialRunner({
    session: app.session, lesson, panel: app.hud.el.tut,
    onFinish: async (id) => {
      const progress = await storage.get('tutorialProgress', {});
      progress[id] = true;
      await storage.set('tutorialProgress', progress);
      app.hud.show(false);
      showTutorials();
      startDemo();
    },
    onExit: () => { app.hud.show(false); showTutorials(); startDemo(); },
  });
  app.session.start();
}

function togglePause() {
  const s = app.session;
  if (!s || s.kind === 'demo') return;
  if (s.net) { // 온라인: 멈추지 않고 나가기만 선택
    if (!$('#screens').classList.contains('hidden')) { app.screens.hide(); return; }
    app.screens.pause({ onResume: () => app.screens.hide(), onQuit: () => { leaveOnline(); showMenu(); } });
    return;
  }
  if (s.paused) {
    s.setPaused(false);
    app.screens.hide();
  } else {
    s.setPaused(true);
    app.screens.pause({
      onResume: () => { s.setPaused(false); app.screens.hide(); },
      onQuit: () => { app.hud.show(false); showMenu(); },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// 온라인 2:2 (P2P, 방 코드)
// ─────────────────────────────────────────────────────────────
const JOIN_ORDER = { doubles: [2, 1, 3], singles: [1] }; // 두 번째 사람은 상대 팀부터 → 1:1 + AI 파트너로도 바로 가능

async function showOnline(error = '') {
  const name = await storage.get('nick', '');
  const last = app.online?.lastInput || {};
  app.screens.onlineEntry({ name: last.name ?? name, format: last.format ?? 'doubles', code: last.code ?? '', error }, {
    onHost: (v) => hostOnline(v),
    onJoin: (v) => joinOnline(v),
    onBack: showMenu,
  });
}

function checkName(v) {
  if (!v.name) { showOnlineWith(v, t('online.needNick')); return false; }
  storage.set('nick', v.name);
  return true;
}
function showOnlineWith(v, err) { app.online = { lastInput: v }; showOnline(err); }

function lobbySlotsPublic() {
  return app.online.slots.map((s) => ({ type: s.type === 'empty' ? 'empty' : 'player', name: s.name }));
}

function renderHostLobby(status = '') {
  const o = app.online;
  app.screens.lobby({ code: o.code, slots: lobbySlotsPublic(), youIdx: 0, isHost: true, format: o.format, status }, {
    onStart: startOnlineMatch,
    onLeave: () => { leaveOnline(); showMenu(); },
  });
}

function broadcastLobby() {
  const o = app.online;
  o.slots.forEach((s, i) => {
    if (s.type === 'remote') o.room.send(s.peer, { t: 'lobby', code: o.code, format: o.format, slots: lobbySlotsPublic(), you: i });
  });
}

function hostAddPlayer(peer, name) {
  const o = app.online;
  if (o.slots.some((s) => s.peer === peer)) return;
  const free = JOIN_ORDER[o.format].find((i) => o.slots[i].type === 'empty');
  if (free == null) { o.room.send(peer, { t: 'full' }); return; }
  o.slots[free] = { type: 'remote', name: (name || t('online.guest')).slice(0, 8), peer };
  if (!app.session || app.session.kind === 'demo') renderHostLobby();
  broadcastLobby();
}

function attachHostLobbyHandlers() {
  const o = app.online;
  o.room.onMessage = (peer, msg) => { if (msg.t === 'hello') hostAddPlayer(peer, msg.name); };
  o.room.onLeave = (peer) => {
    const i = o.slots.findIndex((s) => s.peer === peer);
    if (i >= 0) o.slots[i] = { type: 'empty', name: '' };
    if (!app.session || app.session.kind === 'demo') renderHostLobby();
    broadcastLobby();
  };
}

async function hostOnline(v) {
  if (!checkName(v)) return;
  leaveOnline();
  endSession();
  startDemo();
  app.screens.message(t('online.title'), t('online.opening'), { onOk: () => {} });
  const room = new HostRoom();
  let code;
  try {
    code = await room.open();
  } catch (e) {
    showOnlineWith(v, t('online.err.server', { type: e.type || e.message }));
    return;
  }
  const n = v.format === 'doubles' ? 4 : 2;
  app.online = {
    role: 'host', room, code, format: v.format, lastInput: v,
    slots: [{ type: 'local', name: v.name }, ...Array.from({ length: n - 1 }, () => ({ type: 'empty', name: '' }))],
  };
  attachHostLobbyHandlers();
  renderHostLobby();
}

function startOnlineMatch() {
  const o = app.online;
  let aiNo = 0;
  const slots = o.slots.map((s) => (s.type === 'empty' ? { type: 'ai', name: `AI ${++aiNo}` } : { ...s }));
  const rulesId = app.settings.rules;
  const speed = app.settings.speed;
  slots.forEach((s, i) => {
    if (s.type === 'remote') {
      o.room.send(s.peer, { t: 'start', format: o.format, rules: rulesId, speed, slots: slots.map((x) => ({ name: x.name, type: x.type })), you: i, code: o.code });
    }
  });
  endSession();
  app.screens.hide();
  $('#touch').classList.remove('dim');
  app.hud.show(true);
  const teamNames = teamLabels(slots, o.format, 0);
  app.hud.setup({ names: teamNames, ruleLabel: `${t('online.code')} ${o.code} · ${t(`rules.${rulesId}`)}` });
  app.session = new GameSession({
    kind: 'match', format: o.format, rulesId, settings: app.settings, renderer: app.renderer, hud: app.hud,
    keyboard: app.keyboard, touch: app.touch, slots,
    net: { role: 'host', room: o.room, onOther: (peer, msg) => { if (msg.t === 'hello') hostAddPlayer(peer, msg.name); } },
    onEnd: (result) => {
      app.hud.show(false);
      // 경기 중 나간 사람 자리는 비우고 대기실로
      o.slots = o.slots.map((s) => (s.type === 'remote' && !o.room.conns.has(s.peer) ? { type: 'empty', name: '' } : s));
      app.screens.result(result, {
        againLabel: t('online.toLobby'),
        onAgain: () => { endSession(); startDemo(); attachHostLobbyHandlers(); renderHostLobby(); broadcastLobby(); },
        onMenu: () => { leaveOnline(); showMenu(); },
      });
    },
  });
  app.session.start();
}

function teamLabels(slots, format, myTeam) {
  const per = format === 'doubles' ? 2 : 1;
  const names = [0, 1].map((tm) => slots.slice(tm * per, tm * per + per).map((s) => s.name).join(' + '));
  return myTeam === 1 ? [names[1], names[0]] : names;
}

async function joinOnline(v) {
  if (!checkName(v)) return;
  const code = normalizeCode(v.code);
  if (code.length !== 4) { showOnlineWith(v, t('online.err.code')); return; }
  leaveOnline();
  app.screens.message(t('online.title'), t('online.joining', { code }), { onOk: () => {} });
  const room = new ClientRoom();
  try {
    await room.join(code);
  } catch (e) {
    room.close();
    const notFound = e.type === 'peer-unavailable' || e.type === 'timeout';
    showOnlineWith(v, notFound ? t('online.err.notFound', { code }) : t('online.err.server', { type: e.type || e.message }));
    return;
  }
  app.online = { role: 'client', room, code, lastInput: v };
  const onMsg = (msg) => {
    if (msg.t === 'lobby') {
      Object.assign(app.online, { slots: msg.slots, you: msg.you, format: msg.format });
      if (app.session) { endSession(); app.hud.show(false); startDemo(); }
      app.screens.lobby({ code, slots: msg.slots, youIdx: msg.you, isHost: false, format: msg.format }, {
        onLeave: () => { leaveOnline(); showMenu(); },
      });
    } else if (msg.t === 'start') {
      startClientMatch(msg);
    } else if (msg.t === 'full') {
      leaveOnline(); showOnlineWith(v, t('online.err.full'));
    } else if (msg.t === 'closed') {
      hostGone();
    }
  };
  room.onMessage = onMsg;
  room.onClosed = hostGone;
  app.online.onMsg = onMsg;
  room.send({ t: 'hello', name: v.name });
  app.screens.message(t('online.title'), t('online.joined', { code }), { onOk: () => {} });
}

function hostGone() {
  if (!app.online || app.online.role !== 'client') return;
  leaveOnline();
  endSession();
  app.hud.show(false);
  startDemo();
  app.screens.message(t('online.title'), t('online.hostLeft'), { onOk: showMenu });
}

function startClientMatch(msg) {
  const o = app.online;
  endSession();
  app.screens.hide();
  $('#touch').classList.remove('dim');
  app.hud.show(true);
  const slots = msg.slots.map((s, i) => ({ type: i === msg.you ? 'local' : 'remote', name: s.name }));
  const per = msg.format === 'doubles' ? 2 : 1;
  const myTeam = msg.you < per ? 0 : 1;
  app.hud.setup({ names: teamLabels(slots, msg.format, myTeam), ruleLabel: `${t('online.code')} ${msg.code} · ${t(`rules.${msg.rules}`)}` });
  o.room.onMessage = null; // 세션이 받음
  app.session = new GameSession({
    kind: 'match', format: msg.format, rulesId: msg.rules, settings: { ...app.settings, speed: msg.speed },
    renderer: app.renderer, hud: app.hud, keyboard: app.keyboard, touch: app.touch, slots,
    net: { role: 'client', room: o.room, onOther: o.onMsg },
    onEnd: (result) => {
      app.hud.show(false);
      app.screens.result(result, { waitText: t('online.waitNext'), onMenu: () => { leaveOnline(); showMenu(); } });
    },
  });
  app.session.start();
}

function leaveOnline() {
  const o = app.online;
  if (!o?.room) return;
  o.room.onMessage = null;
  if (o.role === 'client') o.room.onClosed = null;
  o.room.close();
  app.online = { lastInput: o.lastInput };
}

// 개발·점검용: 주소 뒤에 ?debug 를 붙이면 콘솔에서 window.__app 으로 상태 확인 가능
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) window.__app = app;

init();
