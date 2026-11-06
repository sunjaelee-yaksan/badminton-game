// 샷 판정: "버튼 = 샷의 종류, 위치 = 샷의 변형, 타이밍 = 샷의 질"
import { GAMEPLAY, SERVE_BUTTON_MAP, chordIsBackhand } from '../config/gameplay.js';
import { COURT, serviceBox } from '../config/court.js';
import { solveClearingNet, solveLaunch } from './physics.js';
import { clamp } from './util.js';

const BACKHAND_TYPES = new Set(['backhand_clear', 'backhand_smash', 'backhand_drop', 'backhand_hairpin', 'backhand_lift']);
export const OVERHEAD_TYPES = new Set(['clear', 'smash', 'drop', 'backhand_clear', 'backhand_smash', 'backhand_drop']);

// 버튼 + 위치(높이, 네트와의 거리) + 두 번 입력 여부 → 샷 종류
export function decideShotType(button, { h, nearNet, smashIntent, canSmash }) {
  const G = GAMEPLAY;
  if (button === 'clear') {
    if (h < G.lowZone) return 'lift';
    if (smashIntent && h >= G.highZone) return canSmash ? 'smash' : 'clear';
    if (smashIntent && !nearNet) return 'drive';           // 스매시 타이밍이 늦어 낮아진 공 → 드라이브
    if (nearNet) return h >= G.pushMinHeight ? 'push' : 'lift'; // 네트보다 낮으면 밀 수 없음 → 리프트
    return 'clear';
  }
  if (button === 'hairpin') {
    return nearNet ? 'hairpin' : 'drop';
  }
  // backhand
  if (smashIntent && h >= G.highZone && !nearNet) return canSmash ? 'backhand_smash' : 'backhand_clear';
  if (smashIntent && !nearNet) return 'drive';
  if (nearNet) return 'backhand_hairpin';
  if (h < G.lowZone) return 'backhand_lift';
  if (h >= G.highZone && !smashIntent) return 'backhand_clear';
  return 'backhand_drop';
}

// 타점 높이로 타이밍 판정 (오버헤드 샷만)
export function judgeTiming(h, vy) {
  const ideal = GAMEPLAY.idealHeight.overhead;
  const tol = GAMEPLAY.timingTolerance;
  if (vy > 0.5 || h > ideal + tol) return 'early';
  if (h < ideal - tol) return 'late';
  return 'good';
}

// 셔틀이 몸보다 얼마나 앞에 있나 → 서 있는 위치 판정
export function judgePosition(player, shuttle) {
  const ahead = (shuttle.z - player.z) * -player.side; // 네트 방향(+)
  if (ahead < GAMEPLAY.positionWindow.min) return 'under';    // 그림자 바로 위/앞 → 높게 뜨고 짧음
  if (ahead > GAMEPLAY.positionWindow.max) return 'reaching'; // 너무 뒤에 섬 → 네트
  return 'good';
}

export function resolveShot({ player, button: pressed, smashIntent, chord, shuttle, aim, rng, effects, aiAimMul = 1 }) {
  const G = GAMEPLAY;
  // 동시 입력(스매시): 백핸드가 포함되면 백핸드 계열, 아니면 포핸드(클리어 버튼) 계열로 판정
  const button = smashIntent ? (chordIsBackhand(chord) ? 'backhand' : 'clear') : pressed;
  const h = shuttle.y;
  const nearNet = Math.abs(player.z) < G.nearNetDistance;
  const smashCost = G.shots.smash.stamina;
  const canSmash = player.stamina >= smashCost;
  let type = decideShotType(button, { h, nearNet, smashIntent, canSmash });
  const noStamina = smashIntent && !canSmash && h >= G.highZone;

  // 오버헤드 판정은 실제로 머리 위에서 쳤을 때만 (낮은 공을 헤어핀 버튼으로 치면 언더 드롭)
  const overhead = OVERHEAD_TYPES.has(type) && h >= G.highZone - 0.2;
  let timing = overhead ? judgeTiming(h, shuttle.vy) : 'good';
  const position = overhead && !nearNet ? judgePosition(player, shuttle) : 'good';

  // 스매시 타이밍: 빠르면 네트, 정확하면 스매시, 늦으면 드라이브
  if (type === 'smash' && timing === 'late') type = 'drive';
  if (type === 'backhand_smash' && timing === 'late') type = 'drive';

  const def = { ...G.shots[type] };
  let correctNet = true;
  let depth = def.depth;
  let elev = def.elevation;

  if ((type === 'smash' || type === 'backhand_smash') && timing === 'early') {
    elev -= 16; correctNet = false;
  } else if (timing === 'early') {
    elev += 6; depth *= 0.92;
  } else if (timing === 'late' && type !== 'drive') {
    elev -= 10; depth *= 0.85;
  }
  if (position === 'under') { elev += 14; depth *= 0.7; }
  if (position === 'reaching') { elev -= 14; correctNet = false; }

  // 포핸드/백핸드 쪽 판정
  const lateral = (shuttle.x - player.x) * player.side; // 선수 기준 오른쪽(+)
  const isBackhandShot = BACKHAND_TYPES.has(type) || (button === 'backhand' && type === 'drive');
  const wrongSide = isBackhandShot ? lateral > 0.35 : lateral < -0.35;

  // 방향: 치는 순간 누르고 있는 방향키, 안 누르면 정면
  const side = player.side;
  depth = clamp(depth + (aim.depth || 0) * 0.8, 0.45, 6.5);
  const straightX = player.x * 0.35;
  let tx = clamp(straightX + (aim.lat || 0) * side * 2.0, -2.3, 2.3);
  let tz = -side * depth;

  const errR = effects.aimError * (wrongSide ? G.wrongSidePenalty : 1) * aiAimMul;
  const e = rng.disk(errR);
  tx += e.x; tz += e.z * (type === 'hairpin' || type === 'backhand_hairpin' ? 0.3 : 1);

  const from = { x: shuttle.x, y: h, z: shuttle.z };
  const speedMax = def.speedMax * effects.powerMul * (wrongSide ? 0.9 : 1);
  const target = { x: tx, z: tz };
  const vel = correctNet
    ? solveClearingNet(from, target, elev, speedMax, side).vel
    : solveLaunch(from, target, elev, speedMax);

  return { type, timing, position, wrongSide, noStamina, vel, target, from, stamina: def.stamina || 0 };
}

// 서브: 클리어 버튼 = 롱서브, 헤어핀/백핸드 버튼 = 숏서브
export function resolveServe({ server, receiverSide, court, button, aim, rng, effects, format, aiAimMul = 1 }) {
  const type = SERVE_BUTTON_MAP[button];
  const def = GAMEPLAY.shots[type];
  const target = servePreviewTarget({ server, receiverSide, court, type, aim, format });
  const e = rng.disk(effects.aimError * 0.55 * aiAimMul);
  target.x += e.x; target.z += e.z * 0.6;
  const from = serveContactPoint(server);
  const heightFault = from.y > GAMEPLAY.serve.legalMaxHeight; // 서브 높이 규정 위반
  const { vel } = solveClearingNet(from, target, def.elevation, def.speedMax * effects.powerMul, server.side);
  return { type, vel, from, target, timing: 'good', position: 'good', wrongSide: false, heightFault };
}

export function serveContactPoint(server) {
  return { x: server.x + 0.25 * server.side, y: server.serveHeight ?? GAMEPLAY.serve.contactHeight, z: server.z - 0.35 * server.side };
}

export function servePreviewTarget({ server, receiverSide, court, type, aim, format }) {
  const box = serviceBox(receiverSide, court, format);
  const cx = (box.xMin + box.xMax) / 2;
  const x = clamp(cx + (aim.lat || 0) * server.side * 0.9, box.xMin + 0.25, box.xMax - 0.25);
  const back = format === 'doubles' ? COURT.doublesLongService : COURT.halfLength;
  const depth = type === 'long_serve'
    ? clamp(back - 0.45 + (aim.depth || 0) * 0.3, COURT.shortService + 1, back - 0.15)
    : COURT.shortService + 0.35;
  return { x, z: receiverSide * depth };
}
