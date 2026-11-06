// 튜토리얼 각 단계가 실제로 달성 가능한지 "모범 학생" 봇으로 확인
import { Match } from '../src/core/match.js';
import { Player } from '../src/core/player.js';
import { AIController } from '../src/core/ai.js';
import { RULE_PRESETS } from '../src/config/rules.js';
import { AI_LEVELS } from '../src/config/ai.js';
import { GAMEPLAY } from '../src/config/gameplay.js';
import { LESSONS, FEEDS, goalMatches } from '../src/tutorial/lessons.js';

const PLAN = {
  'lesson.move.2': { button: 'clear' },
  'lesson.overhead.1': { button: 'clear' },
  'lesson.overhead.2': { button: 'clear', smash: true },
  'lesson.overhead.3': { button: 'clear', smash: true, delay: 0.1 },
  'lesson.overhead.4': { button: 'hairpin' },
  'lesson.net.1': { button: 'hairpin' },
  'lesson.net.2': { button: 'clear', delay: -0.25 },
  'lesson.net.3': { button: 'clear' },
  'lesson.backhand.1': { button: 'backhand' },
  'lesson.backhand.2': { button: 'backhand' },
  'lesson.backhand.3': { button: 'backhand', smash: true },
  'lesson.serve.1': { serveButton: 'clear' },
  'lesson.serve.2': { serveButton: 'clear' },
  'lesson.serve.3': { serveButton: 'hairpin' },
  'lesson.serve.4': { serveButton: 'clear', serveHeight: 1.3 },
  'lesson.serve.5': { serveButton: 'clear' },
};
let fail = 0;
for (const lesson of LESSONS) for (const step of lesson.steps) {
  if (!PLAN[step.text]) continue; // 키 연습·복식 경기 단계는 사람 입력/경기 테스트로 확인
  const st = { strength: 50, agility: 50, precision: 50 };
  const players = [new Player({ idx: 0, team: 0, stats: { ...st } }), new Player({ idx: 1, team: 1, stats: { ...st }, isAI: true })];
  const m = new Match({ rules: RULE_PRESETS.school, players, mode: 'drill', drill: { ...step.drill, feedSpecs: FEEDS }, seed: 11 });
  const bot = new AIController(m, 0, AI_LEVELS.hard, 5);
  bot.override = PLAN[step.text];
  let got = 0, attempts = 0; const seen = {};
  m.on('feed', () => attempts++);
  m.on('serveSetup', () => attempts++);
  for (const ev of ['shot', 'serveResult', 'positionOk']) m.on(ev, (p) => {
    if (ev === 'shot' && p.idx === 0) seen[p.type + '/' + p.timing] = (seen[p.type + '/' + p.timing] || 0) + 1;
    if (ev === 'serveResult') seen[p.reason] = (seen[p.reason] || 0) + 1;
    if (goalMatches(step.goal, ev, p)) got++;
  });
  m.start();
  for (let i = 0; i < 120 * 90; i++) { bot.update(); m.update(GAMEPLAY.fixedDt); }
  const ok = got >= step.goal.count;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${step.text.padEnd(20)} goal ${got}/${attempts}`, JSON.stringify(seen));
}
if (fail) process.exit(1);
