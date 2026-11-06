// 게임 판정 수치 — 플레이 테스트하면서 여기 숫자만 바꾸면 됩니다.
export const GAMEPLAY = {
  fixedDt: 1 / 120,            // 물리 계산 간격(초). 서버 대전 때도 같은 값 사용.
  gravity: 9.81,
  terminalVelocity: 6.8,       // 셔틀콕 종단속도(m/s) — 공기저항이 커서 급격히 느려짐

  reach: { horizontal: 1.2, minY: 0.12, maxY: 3.1 },   // 라켓이 닿는 범위
  idealHeight: { overhead: 2.4, low: 0.9 },             // 가장 좋은 타점 높이
  timingTolerance: 0.5,        // 타점 높이 허용 오차(m): 이보다 높으면 '빠름', 낮으면 '늦음'
  // 셔틀이 몸보다 얼마나 앞(네트 쪽)에 있을 때 쳐야 하는가 = "그림자보다 살짝 뒤에 서기"
  positionWindow: { min: 0.05, max: 0.9 },
  idealStandOffset: 0.4,       // 빨간 원(추천 위치)은 타점보다 이만큼 뒤
  nearNetDistance: 2.2,        // 네트에서 이 거리 안이면 '네트 앞' (헤어핀·푸시)
  highZone: 1.8,               // 이 높이 이상 = 오버헤드 (클리어·스매시·드롭)
  lowZone: 1.0,                // 이 높이 미만 = 언더 (리프트)
  pushMinHeight: 1.45,         // 네트 앞에서 이 높이 이상이어야 푸시 가능

  swing: {
    window: 0.45,              // 버튼 누른 뒤 라켓이 셔틀을 맞힐 수 있는 시간
    chordWindow: 0.1,          // 두 버튼 '동시' 입력으로 인정하는 시간 → 스매시 (오버헤드 공은 이만큼 뒤에 맞음)
    quickContact: 0.04,        // 낮은 공은 바로 맞음
    moveSlow: 0.45,            // 스윙 중 이동 속도 배율
  },
  dash: { doubleTapWindow: 0.3, duration: 0.3, multiplier: 2.3, cost: 18 },
  stamina: { max: 100, regen: 12 },
  wrongSidePenalty: 1.7,       // 백핸드 쪽 공을 포핸드 버튼으로 칠 때(또는 반대) 정확도 감소 배율

  serve: {
    contactHeight: 1.0,      // 기본 타점 높이
    legalMaxHeight: 1.15,    // 규정: 셔틀 전체가 코트 바닥에서 1.15m 아래에서 맞아야 함
    heightRange: [0.7, 1.4], // 1인칭 서브에서 ↑↓로 조절 가능한 범위
    heightSpeed: 0.45,       // 초당 조절 속도(m)
    positionTime: 3,         // 서브 전 자리 잡기 시간(초)
    aiDelay: 1.0,
  },
  pointPause: 1.8,

  // 샷 기본값: elevation=발사 각도(도), depth=네트에서 상대 코트로 떨어질 거리(m), speedMax=최대 초속
  shots: {
    clear:            { elevation: 48,  depth: 5.9, speedMax: 34 },
    smash:            { elevation: -8,  depth: 4.6, speedMax: 50, stamina: 15 },
    drive:            { elevation: 4,   depth: 4.8, speedMax: 30 },
    push:             { elevation: 2,   depth: 3.3, speedMax: 22 },
    lift:             { elevation: 58,  depth: 5.8, speedMax: 32 },
    drop:             { elevation: 18,  depth: 2.2, speedMax: 20 },
    hairpin:          { elevation: 66,  depth: 0.6, speedMax: 10 },
    backhand_clear:   { elevation: 46,  depth: 5.0, speedMax: 26 },
    backhand_smash:   { elevation: -8,  depth: 4.0, speedMax: 36, stamina: 15 },
    backhand_drop:    { elevation: 18,  depth: 2.2, speedMax: 18 },
    backhand_hairpin: { elevation: 66,  depth: 0.6, speedMax: 10 },
    backhand_lift:    { elevation: 56,  depth: 5.2, speedMax: 28 },
    long_serve:       { elevation: 58,  depth: 6.2, speedMax: 34 },
    short_serve:      { elevation: 26,  depth: 2.3, speedMax: 16 },
  },
};

// 두 버튼 동시 입력: 백핸드가 들어가면 백핸드 스매시, 아니면 스매시
export function chordIsBackhand(chord) { return chord?.includes('backhand'); }

// 서브 버튼: 클리어 = 롱서브, 헤어핀 = 숏서브, 백핸드 = 백핸드 숏서브
export const SERVE_BUTTON_MAP = {
  clear: 'long_serve',
  hairpin: 'short_serve',
  backhand: 'short_serve',
};
