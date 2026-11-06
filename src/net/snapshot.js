// 방장 → 참가자: 경기 화면 상태 (초당 30번). 참가자는 이 값을 자기 Match 객체에 덮어써서 그대로 그림.
const r = (v) => Math.round(v * 1000) / 1000;

export function makeSnapshot(m) {
  const p = m.prediction;
  return {
    t: 's',
    time: r(m.time),
    state: m.state,
    sh: [r(m.shuttle.x), r(m.shuttle.y), r(m.shuttle.z), r(m.shuttle.vx), r(m.shuttle.vy), r(m.shuttle.vz), m.shuttle.netHit ? 1 : 0],
    pl: m.players.map((q) => [r(q.x), r(q.z), Math.round(q.stamina), r(q.dashT), q.locked ? 1 : 0,
      q.lastSwingStart == null ? -1 : r(q.lastSwingStart), r(q.serveHeight), r(q.input.aimLat)]),
    score: m.scoreboard.score,
    sbServer: m.scoreboard.server,
    serverIdx: m.serverIdx,
    receiverIdx: m.receiverIdx,
    servingTeam: m.servingTeam,
    court: m.serveCourtLR,
    ready: m.serveReady,
    posUntil: r(m.positionUntil),
    boxes: m.serveBox ? [m.serveBox, m.serverStand, m.receiverStand] : null,
    courtOf: m.courtOf,
    lastHitTeam: m.lastHitTeam,
    rot: m.rotationNote,
    pred: p ? {
      createdAt: r(p.createdAt), receiverTeam: p.receiverTeam, takerIdx: p.takerIdx, netHit: p.netHit,
      landing: { x: r(p.landing.x), z: r(p.landing.z) },
      ideal: p.ideal ? { kind: p.ideal.kind, time: r(p.ideal.time), pressAt: r(p.ideal.pressAt), hit: p.ideal.hit, stand: p.ideal.stand } : null,
    } : null,
  };
}

// ownIdx: 이 기기 선수 — 위치는 직접 예측 이동하므로 크게 어긋날 때만 맞춤
export function applySnapshot(m, s, ownIdx) {
  const drift = s.time - m.time;
  if (Math.abs(drift) > 0.25) m.time = s.time; else m.time += drift * 0.15;
  const prevState = m.state;
  m.state = s.state;
  const [x, y, z, vx, vy, vz, net] = s.sh;
  Object.assign(m.shuttle, { x, y, z, vx, vy, vz, netHit: !!net });
  s.pl.forEach((a, i) => {
    const q = m.players[i];
    const [px, pz, st, dashT, locked, swing, sh, aim] = a;
    if (i === ownIdx) {
      const d = Math.hypot(px - q.x, pz - q.z);
      // 서브 준비 시작처럼 상태가 바뀌거나 많이 어긋나면 방장 위치로 맞춤
      if (d > 0.6 || (locked && !q.locked)) { q.x = px; q.z = pz; } else { q.x += (px - q.x) * 0.2; q.z += (pz - q.z) * 0.2; }
    } else {
      q.netTarget = { x: px, z: pz };
      q.input.aimLat = aim;
    }
    q.stamina = st;
    q.dashT = dashT;
    q.locked = !!locked;
    q.lastSwingStart = swing < 0 ? null : swing;
    q.serveHeight = sh;
  });
  m.scoreboard.score = s.score;
  m.scoreboard.server = s.sbServer;
  m.serverIdx = s.serverIdx;
  m.receiverIdx = s.receiverIdx;
  m.servingTeam = s.servingTeam;
  m.serveCourtLR = s.court;
  m.serveReady = s.ready;
  m.positionUntil = s.posUntil;
  if (s.boxes) [m.serveBox, m.serverStand, m.receiverStand] = s.boxes;
  m.courtOf = s.courtOf;
  m.lastHitTeam = s.lastHitTeam;
  m.rotationNote = s.rot;
  m.prediction = s.pred;
  return prevState;
}

// 다른 선수 위치는 다음 스냅샷까지 부드럽게 따라감
export function smoothRemotePlayers(m, ownIdx, k = 0.35) {
  m.players.forEach((q, i) => {
    if (i === ownIdx || !q.netTarget) return;
    q.x += (q.netTarget.x - q.x) * k;
    q.z += (q.netTarget.z - q.z) * k;
  });
}
