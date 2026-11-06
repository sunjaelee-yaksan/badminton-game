// 튜토리얼 레슨 데이터. 레슨 추가 = 이 배열에 항목 추가 + 언어 파일에 문구 추가.
// drill.idle: 공 없이 키 연습 / drill.feeds: 연습 상대가 띄워 주는 공 / drill.playerServes: 서브 연습
// setup: 레슨 전체를 실제 경기로 진행 (예: 복식 규칙)
// keys: 튜토리얼 패널에 크게 보여줄 키
// goal.event: 'moved' | 'dash' | 'press' | 'chord' | 'shot' | 'serveResult' | 'positionOk' | 'point'

export const FEEDS = {
  lift_center: { shot: 'lift', from: { x: 0, z: -1.4 }, target: { x: 0, z: 4.9 }, jitter: 0.5, height: 0.9 },
  lift_right: { shot: 'lift', from: { x: 0, z: -1.4 }, target: { x: 1.4, z: 4.9 }, jitter: 0.3, height: 0.9 },
  lift_left: { shot: 'lift', from: { x: 0, z: -1.4 }, target: { x: -1.5, z: 4.8 }, jitter: 0.3, height: 0.9 },
  short_center: { shot: 'drop', from: { x: 0, z: -3.6 }, target: { x: 0, z: 1.0 }, jitter: 0.4, height: 2.3 },
  short_left: { shot: 'drop', from: { x: 0, z: -3.6 }, target: { x: -1.3, z: 1.0 }, jitter: 0.25, height: 2.3 },
  push_feed: { shot: 'hairpin', from: { x: 0, z: -0.9 }, target: { x: 0, z: 1.5 }, jitter: 0.3, height: 1.3 },
};

const ANY_SHOT = [
  'clear', 'smash', 'drive', 'push', 'lift', 'drop', 'hairpin',
  'backhand_clear', 'backhand_smash', 'backhand_drop', 'backhand_hairpin', 'backhand_lift',
];
const IDLE = { idle: true };

export const LESSONS = [
  {
    id: 'keys', // 0. 키 조작 먼저 하나씩
    steps: [
      { text: 'lesson.keys.1', keys: ['↑', '←', '↓', '→'], goal: { event: 'moved', count: 6 }, drill: IDLE },
      { text: 'lesson.keys.2', keys: ['→', '→'], goal: { event: 'dash', count: 2 }, drill: IDLE },
      { text: 'lesson.keys.3', keys: ['Space'], goal: { event: 'dash', count: 2 }, drill: IDLE },
      { text: 'lesson.keys.4', keys: ['J'], goal: { event: 'press', button: 'clear', count: 2 }, drill: IDLE },
      { text: 'lesson.keys.5', keys: ['K'], goal: { event: 'press', button: 'hairpin', count: 2 }, drill: IDLE },
      { text: 'lesson.keys.6', keys: ['L'], goal: { event: 'press', button: 'backhand', count: 2 }, drill: IDLE },
      { text: 'lesson.keys.7', keys: ['J', '+', 'K'], goal: { event: 'chord', backhand: false, count: 2 }, drill: IDLE },
      { text: 'lesson.keys.8', keys: ['L', '+', 'K'], goal: { event: 'chord', backhand: true, count: 1 }, drill: IDLE },
    ],
  },
  {
    id: 'move',
    steps: [
      { text: 'lesson.move.2', goal: { event: 'shot', types: ANY_SHOT, count: 3 }, drill: { feeds: ['lift_center', 'lift_right'] } },
    ],
  },
  {
    id: 'overhead',
    steps: [
      { text: 'lesson.overhead.1', keys: ['J'], goal: { event: 'shot', types: ['clear'], count: 3 }, drill: { feeds: ['lift_center'] } },
      { text: 'lesson.overhead.2', keys: ['J', '+', 'K'], goal: { event: 'shot', types: ['smash'], good: true, count: 2 }, drill: { feeds: ['lift_center'] } },
      { text: 'lesson.overhead.3', keys: ['J', '+', 'K'], goal: { event: 'shot', types: ['drive'], count: 1 }, drill: { feeds: ['lift_center'] } },
      { text: 'lesson.overhead.4', keys: ['K'], goal: { event: 'shot', types: ['drop'], count: 2 }, drill: { feeds: ['lift_center', 'lift_right'] } },
    ],
  },
  {
    id: 'net',
    steps: [
      { text: 'lesson.net.1', keys: ['K'], goal: { event: 'shot', types: ['hairpin'], count: 3 }, drill: { feeds: ['short_center'] } },
      { text: 'lesson.net.2', keys: ['J'], goal: { event: 'shot', types: ['push'], count: 2 }, drill: { feeds: ['push_feed'] } },
      { text: 'lesson.net.3', keys: ['J'], goal: { event: 'shot', types: ['lift'], count: 2 }, drill: { feeds: ['short_center'] } },
    ],
  },
  {
    id: 'backhand',
    steps: [
      { text: 'lesson.backhand.1', keys: ['L'], goal: { event: 'shot', types: ['backhand_clear'], count: 2 }, drill: { feeds: ['lift_left'] } },
      { text: 'lesson.backhand.2', keys: ['L'], goal: { event: 'shot', types: ['backhand_hairpin'], count: 2 }, drill: { feeds: ['short_left'] } },
      { text: 'lesson.backhand.3', keys: ['L', '+', 'K'], goal: { event: 'shot', types: ['backhand_smash'], good: true, count: 1 }, drill: { feeds: ['lift_left'] } },
    ],
  },
  {
    id: 'serve',
    steps: [
      { text: 'lesson.serve.1', keys: ['↑', '←', '↓', '→'], goal: { event: 'positionOk', role: 'server', count: 2 }, drill: { playerServes: true } },
      { text: 'lesson.serve.2', keys: ['J'], goal: { event: 'serveResult', type: 'long_serve', count: 2 }, drill: { playerServes: true } },
      { text: 'lesson.serve.3', keys: ['K'], goal: { event: 'serveResult', type: 'short_serve', count: 2 }, drill: { playerServes: true } },
      { text: 'lesson.serve.4', keys: ['↑', '↓'], goal: { event: 'serveResult', fault: 'serveHeight', count: 1 }, drill: { playerServes: true } },
      { text: 'lesson.serve.5', keys: ['↑', '↓', 'J'], goal: { event: 'serveResult', count: 2 }, drill: { playerServes: true } },
    ],
  },
  {
    id: 'doubles',
    setup: { format: 'doubles', rules: 'quick' },
    steps: [
      { text: 'lesson.doubles.1', goal: { event: 'positionOk', count: 3 } },
      { text: 'lesson.doubles.2', goal: { event: 'point', count: 2 } },
    ],
  },
];

export function goalMatches(goal, type, payload) {
  if (goal.event !== type) return false;
  if (payload.idx !== undefined && payload.idx !== 0) return false;
  switch (type) {
    case 'shot':
      if (payload.isServe || !goal.types.includes(payload.type)) return false;
      return !goal.good || payload.timing === 'good';
    case 'serveResult':
      if (goal.fault) return payload.reason === goal.fault;
      return payload.in && (!goal.type || goal.type === payload.type);
    case 'press':
      return payload.button === goal.button;
    case 'chord':
      return goal.backhand === undefined || goal.backhand === payload.chord.includes('backhand');
    case 'positionOk':
      return !goal.role || payload.role === goal.role;
    case 'point':
      return payload.winner === 0;
    default:
      return true;
  }
}
