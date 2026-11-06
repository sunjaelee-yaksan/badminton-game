// 경기 규칙 프리셋 — 학교용/동호인용/국가별 대회용을 같은 코드로 운영하기 위해 값으로 분리.
// 새 프리셋은 여기에 추가만 하면 메뉴에 자동으로 나타납니다.
export const RULE_PRESETS = {
  school: {
    id: 'school',          // 수업용: 40분 수업 안에 여러 경기
    pointsToWin: 11,
    winBy: 2,
    cap: 15,               // 14:14 → 15점 먼저
    format: 'singles',
  },
  quick: {
    id: 'quick',           // 튜토리얼 직후 짧은 연습 경기
    pointsToWin: 7,
    winBy: 2,
    cap: 10,
    format: 'singles',
  },
  official: {
    id: 'official',        // 공식 규칙: 21점, 20:20 듀스 → 2점 차, 29:29 → 30점 먼저
    pointsToWin: 21,
    winBy: 2,
    cap: 30,
    format: 'singles',
  },
};

// 게임 속도(셔틀 비행·이동 전체에 곱해짐). 저학년은 slow 권장.
export const SPEED_PRESETS = {
  slow: 0.65,
  normal: 0.82,
  real: 1.0,
};

export const DEFAULT_SETTINGS = {
  lang: 'ko',
  rules: 'school',
  speed: 'normal',
  ai: 'easy',
};
