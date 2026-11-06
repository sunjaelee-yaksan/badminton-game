// AI 난이도. 같은 Player 클래스를 쓰고 "입력"만 AI가 넣으므로,
// 나중에 온라인 대전에서 AI 대신 다른 사람의 입력을 넣으면 그대로 동작합니다.
export const AI_LEVELS = {
  easy: {
    reaction: 0.32,       // 상대 샷을 보고 움직이기 시작하는 시간(초)
    timingSd: 0.08,       // 치는 타이밍 오차(초, 표준편차)
    positionError: 0.35,  // 서는 위치 오차(m)
    aimErrorMul: 1.4,
    smashRate: 0.12,
    dropRate: 0.25,
    speedMul: 0.8,
    smartAim: 0.2,
  },
  normal: {
    reaction: 0.24,
    timingSd: 0.06,
    positionError: 0.3,
    aimErrorMul: 1.0,
    smashRate: 0.3,
    dropRate: 0.25,
    speedMul: 0.95,
    smartAim: 0.5,
  },
  hard: {
    reaction: 0.1,
    timingSd: 0.02,
    positionError: 0.08,
    aimErrorMul: 0.7,
    smashRate: 0.45,
    dropRate: 0.3,
    speedMul: 1.1,
    smartAim: 0.75,
  },
};
