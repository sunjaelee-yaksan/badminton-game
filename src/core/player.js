// 선수: 8방향 이동, 대시, 스태미나, 스윙 상태.
// 입력(input)은 키보드·터치·AI·(추후)네트워크 어디서 오든 같은 형태.
import { GAMEPLAY } from '../config/gameplay.js';
import { COURT } from '../config/court.js';
import { statEffects } from '../config/progression.js';
import { clamp } from './util.js';

export class Player {
  constructor({ idx, team, name, stats, isAI = false, color = 0x2f6fde }) {
    this.idx = idx;
    this.team = team;          // 0 = 아래(내) 코트, 1 = 위 코트
    this.side = team === 0 ? 1 : -1;
    this.name = name;
    this.isAI = isAI;
    this.color = color;
    this.stats = stats;
    this.effects = statEffects(stats);
    this.x = 0;
    this.z = this.side * 3.5;
    this.vx = 0;
    this.vz = 0;
    this.stamina = GAMEPLAY.stamina.max;
    this.dashT = 0;
    this.locked = false;       // 서브 직전: 서버·리시버는 움직이면 안 됨(규칙)
    this.swing = null;         // { button, start, contactDelay, smashIntent, chord, contacted }
    this.lastSwingStart = null;
    this.serveHeight = GAMEPLAY.serve.contactHeight;
    this.distance = 0;         // 이동 거리 누적(튜토리얼용)
    // 이동은 월드 좌표, 조준은 선수 기준(lat: 오른쪽+, depth: 깊게+), heightAdj: 서브 타점 조절(-1~1)
    this.input = { moveX: 0, moveZ: 0, aimLat: 0, aimDepth: 0, heightAdj: 0 };
  }

  place(x, z) {
    this.x = x; this.z = z; this.vx = 0; this.vz = 0;
  }

  // 대시: 실패하면 이유를 돌려줌 (화면 안내용)
  requestDash() {
    const D = GAMEPLAY.dash;
    if (this.locked) return 'locked';
    if (Math.hypot(this.input.moveX, this.input.moveZ) < 0.2) return 'still';
    if (this.dashT > 0) return 'busy';
    if (this.stamina < D.cost) return 'stamina';
    this.dashT = D.duration;
    this.stamina -= D.cost;
    return 'ok';
  }

  // 버튼 입력. 첫 입력에 스윙 시작, 짧은 시간 안에 '다른' 버튼이 오면 스매시로 전환(동시 누르기)
  press(button, now, shuttleY) {
    const S = GAMEPLAY.swing;
    if (this.swing && !this.swing.contacted) {
      if (button !== this.swing.button && now - this.swing.start <= S.chordWindow && !this.swing.smashIntent) {
        this.swing.smashIntent = true;
        this.swing.chord = [this.swing.button, button];
        return 'chord';
      }
      return null;
    }
    if (this.swing) return null;
    // 머리 위 공은 어떤 버튼이든 같은 타이밍(동시 입력 대기 시간 포함)에 맞음 → 타이밍 링 하나로 통일
    const overhead = shuttleY >= GAMEPLAY.highZone;
    this.lastSwingStart = now;
    this.swing = {
      button,
      start: now,
      contactDelay: overhead ? S.chordWindow : S.quickContact,
      smashIntent: false,
      chord: null,
      contacted: false,
    };
    return 'swing';
  }

  update(dt, now) {
    const G = GAMEPLAY;
    if (this.swing && now - this.swing.start > G.swing.window) this.swing = null;
    let mx = this.input.moveX, mz = this.input.moveZ;
    const mag = Math.hypot(mx, mz);
    if (mag > 1) { mx /= mag; mz /= mag; }
    let speed = this.effects.moveSpeed;
    if (this.dashT > 0) { speed *= G.dash.multiplier; this.dashT -= dt; }
    if (this.swing) speed *= G.swing.moveSlow;
    if (this.locked) speed = 0;
    this.vx = mx * speed;
    this.vz = mz * speed;
    const ox = this.x, oz = this.z;
    this.x = clamp(this.x + this.vx * dt, -COURT.doublesHalfWidth - 0.6, COURT.doublesHalfWidth + 0.6);
    const zMin = this.side > 0 ? 0.3 : -COURT.halfLength - 1.0;
    const zMax = this.side > 0 ? COURT.halfLength + 1.0 : -0.3;
    this.z = clamp(this.z + this.vz * dt, zMin, zMax);
    this.distance += Math.hypot(this.x - ox, this.z - oz);
    if (this.dashT <= 0) this.stamina = Math.min(G.stamina.max, this.stamina + G.stamina.regen * dt);
    // 서브 타점 높이 조절(1인칭 서브)
    if (this.input.heightAdj) {
      const [lo, hi] = G.serve.heightRange;
      this.serveHeight = clamp(this.serveHeight + this.input.heightAdj * G.serve.heightSpeed * dt, lo, hi);
    }
  }

  swingAge(now) {
    return this.lastSwingStart == null ? Infinity : now - this.lastSwingStart;
  }
}
