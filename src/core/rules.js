// 점수·서브·인/아웃 판정 (랠리포인트제)
import { inBounds, inBox } from '../config/court.js';

export class Scoreboard {
  constructor(rules) {
    this.rules = rules;
    this.score = [0, 0];
    this.server = 0;
  }
  // 서버 점수가 짝수면 오른쪽, 홀수면 왼쪽 서비스 코트에서 서브
  serveCourt(idx = this.server) {
    return this.score[idx] % 2 === 0 ? 'R' : 'L';
  }
  award(winner) {
    this.score[winner] += 1;
    this.server = winner; // 랠리에서 이긴 쪽이 다음 서브
  }
  winner() {
    const { pointsToWin, winBy, cap } = this.rules;
    for (const i of [0, 1]) {
      const me = this.score[i], op = this.score[1 - i];
      if (me >= cap) return i;
      if (me >= pointsToWin && me - op >= winBy) return i;
    }
    return -1;
  }
  status() {
    const { pointsToWin, cap } = this.rules;
    const [a, b] = this.score;
    if (a === b && a >= pointsToWin - 1) return a === cap - 1 ? 'finalPoint' : 'deuce';
    for (const i of [0, 1]) {
      const me = this.score[i], op = this.score[1 - i];
      if ((me >= pointsToWin - 1 && me > op) || me === cap - 1) return 'gamePoint';
    }
    return null;
  }
}

// 셔틀이 바닥에 닿았을 때 누가 점수를 얻는가
// reason: in(인) | out(아웃) | net(네트) | serveFault(서브가 서비스 코트 밖) | serveHeight(서브 높이 위반) | notOver(못 넘김)
// hitterIdx/winner는 '팀' 번호(0/1)
export function judgeLanding({ landing, hitterIdx, hitterSide, isServe, serveBox, netHit, format, serveHeightFault }) {
  const opp = 1 - hitterIdx;
  if (isServe && serveHeightFault) return { winner: opp, reason: 'serveHeight' };
  const landSide = Math.sign(landing.z) || hitterSide;
  if (landSide === hitterSide) return { winner: opp, reason: netHit ? 'net' : 'notOver' };
  if (isServe) {
    return inBox(landing.x, landing.z, serveBox)
      ? { winner: hitterIdx, reason: 'in' }
      : { winner: opp, reason: 'serveFault' };
  }
  return inBounds(landing.x, landing.z, format)
    ? { winner: hitterIdx, reason: 'in' }
    : { winner: opp, reason: 'out' };
}
