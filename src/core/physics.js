// 셔틀콕 물리: 중력 + 속도 제곱에 비례하는 공기저항.
// 처음엔 빠르다가 급격히 느려지고 거의 수직으로 떨어지는 실제 셔틀 궤적을 재현.
import { GAMEPLAY } from '../config/gameplay.js';
import { COURT } from '../config/court.js';
import { DEG } from './util.js';

const dragK = () => GAMEPLAY.gravity / (GAMEPLAY.terminalVelocity ** 2);

export function stepShuttle(s, dt, ignoreNet = false) {
  const k = dragK();
  const v = Math.hypot(s.vx, s.vy, s.vz);
  s.vx += -k * v * s.vx * dt;
  s.vy += (-GAMEPLAY.gravity - k * v * s.vy) * dt;
  s.vz += -k * v * s.vz * dt;
  const px = s.x, py = s.y, pz = s.z;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;

  if (!ignoreNet && !s.netHit && pz !== 0 && Math.sign(pz) !== Math.sign(s.z || -pz)) {
    // 네트 평면(z=0) 통과 순간의 높이 계산
    const t = pz / (pz - s.z);
    const yc = py + (s.y - py) * t;
    const xc = px + (s.x - px) * t;
    if (yc < COURT.netHeight && Math.abs(xc) <= COURT.postHalfWidth + 0.2) {
      // 네트에 걸림 → 친 사람 쪽으로 툭 떨어짐
      s.netHit = true;
      s.x = xc;
      s.y = Math.max(yc, 0.02);
      s.z = Math.sign(pz) * 0.06;
      s.vx = 0;
      s.vz = 0;
      s.vy = Math.min(s.vy, 0) * 0.3;
    }
  }
  return s;
}

// 현재 상태에서 바닥에 닿을 때까지 궤적 예측 (그림자·추천 위치·AI가 사용)
export function simulate(start, maxT = 6, ignoreNet = false) {
  const s = { x: start.x, y: start.y, z: start.z, vx: start.vx, vy: start.vy, vz: start.vz, netHit: !!start.netHit };
  const dt = GAMEPLAY.fixedDt;
  const points = [{ t: 0, x: s.x, y: s.y, z: s.z, vy: s.vy }];
  let t = 0;
  while (t < maxT) {
    stepShuttle(s, dt, ignoreNet);
    t += dt;
    points.push({ t, x: s.x, y: s.y, z: s.z, vy: s.vy });
    if (s.y <= 0) break;
  }
  const last = points[points.length - 1];
  return { points, netHit: s.netHit, landing: { x: last.x, z: last.z, t: last.t } };
}

function launchVel(dir, elevDeg, speed) {
  const c = Math.cos(elevDeg * DEG), sn = Math.sin(elevDeg * DEG);
  return { vx: dir.x * c * speed, vy: sn * speed, vz: dir.z * c * speed };
}

function rangeFor(from, dir, elev, speed) {
  const v = launchVel(dir, elev, speed);
  const r = simulate({ x: 0, y: from.y, z: 0, ...v }, 6, true);
  return Math.hypot(r.landing.x, r.landing.z);
}

// 목표 지점에 떨어지도록 발사 속도를 이분법으로 계산.
// speedMax로도 못 미치면 최대 속도로 침(근력이 낮으면 짧게 떨어짐).
export function solveLaunch(from, target, elevDeg, speedMax) {
  const dx = target.x - from.x, dz = target.z - from.z;
  const dist = Math.hypot(dx, dz) || 0.01;
  const dir = { x: dx / dist, z: dz / dist };
  let lo = 0.3, hi = speedMax;
  if (rangeFor(from, dir, elevDeg, hi) < dist) return launchVel(dir, elevDeg, hi);
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (rangeFor(from, dir, elevDeg, mid) < dist) lo = mid; else hi = mid;
  }
  return launchVel(dir, elevDeg, (lo + hi) / 2);
}

// 잘 친 샷은 네트를 넘도록 각도를 조금씩 올려 보정
export function solveClearingNet(from, target, elevDeg, speedMax, hitterSide) {
  let elev = elevDeg;
  let vel = solveLaunch(from, target, elev, speedMax);
  for (let i = 0; i < 10; i++) {
    const r = simulate({ ...from, ...vel });
    const landedOpp = Math.sign(r.landing.z) === -hitterSide;
    if (!r.netHit && landedOpp) return { vel, elev };
    elev += 4;
    vel = solveLaunch(from, target, Math.min(elev, 75), speedMax);
  }
  return { vel, elev };
}
