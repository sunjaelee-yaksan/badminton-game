// 키 배치 — 설정 화면이나 국가별 키보드 배열에 맞춰 바꿀 수 있도록 분리
export const KEYMAP = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  clear: ['KeyJ', 'KeyZ'],     // 클리어 / 푸시 / 리프트 / 롱서브
  hairpin: ['KeyK', 'KeyX'],   // 헤어핀 / 드롭 / 숏서브
  backhand: ['KeyL', 'KeyC'],  // 백핸드 계열 / 백핸드 숏서브
  // 스매시 = J+K 동시, 백핸드 스매시 = L+K 동시
  dash: ['Space', 'ShiftLeft', 'ShiftRight'],
  pause: ['Escape', 'KeyP'],
};

export const SHOT_BUTTONS = ['clear', 'hairpin', 'backhand'];
