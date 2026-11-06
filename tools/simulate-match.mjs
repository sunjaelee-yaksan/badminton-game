// AI끼리 경기를 자동으로 돌려 규칙·물리가 정상인지 확인
// 사용: node tools/simulate-match.mjs [레벨A] [레벨B] [판 수] [singles|doubles]
import { Match } from '../src/core/match.js';
import { Player } from '../src/core/player.js';
import { AIController } from '../src/core/ai.js';
import { RULE_PRESETS } from '../src/config/rules.js';
import { AI_LEVELS } from '../src/config/ai.js';
import { DEFAULT_CHARACTER } from '../src/config/progression.js';
import { GAMEPLAY } from '../src/config/gameplay.js';

const [levelA = 'normal', levelB = 'normal', gamesArg = '3', format = 'singles'] = process.argv.slice(2);
const games = Number(gamesArg);
const perTeam = format === 'doubles' ? 2 : 1;
const total = { reasons: {}, shots: {}, rallies: [], timeouts: 0, rotationErrors: 0, serves: 0 };
for (let g = 0; g < games; g++) {
  const players = [];
  for (const team of [0, 1]) for (let i = 0; i < perTeam; i++) {
    players.push(new Player({ idx: players.length, team, name: `T${team}P${i}`, isAI: true, stats: { ...DEFAULT_CHARACTER.stats } }));
  }
  const m = new Match({ rules: RULE_PRESETS.official, players, seed: 100 + g, format });
  const ais = players.map((p) => new AIController(m, p.idx, AI_LEVELS[p.team === 0 ? levelA : levelB], 7 + g * 10 + p.idx));
  let rally = 0, ended = null, last = null;
  m.on('shot', (e) => { rally++; total.shots[e.type] = (total.shots[e.type] || 0) + 1; });
  m.on('point', (e) => { total.reasons[e.reason] = (total.reasons[e.reason] || 0) + 1; total.rallies.push(rally); rally = 0; });
  // 복식 규칙 점검: 서버는 (서브 팀 점수 짝수 → R 자리 선수), 리시버는 같은 글자 자리, 서버가 이기면 같은 서버
  m.on('serveSetup', (e) => {
    total.serves++;
    const team = m.players[e.server].team;
    const expectCourt = m.scoreboard.score[team] % 2 === 0 ? 'R' : 'L';
    if (e.court !== expectCourt) total.rotationErrors++;
    if (format === 'doubles' && (m.courtOf[e.server] !== e.court || m.courtOf[e.receiver] !== e.court)) total.rotationErrors++;
    if (last && e.reason === 'keep' && last.server !== e.server) total.rotationErrors++;
    last = e;
  });
  m.on('matchEnd', (e) => { ended = e; });
  m.start();
  const dt = GAMEPLAY.fixedDt;
  for (let i = 0; i < 120 * 60 * 50 && !ended; i++) { for (const a of ais) a.update(); m.update(dt); }
  if (!ended) total.timeouts++;
  console.log(`game ${g + 1} (${format}): ${m.scoreboard.score.join(':')} ${ended ? 'winner team ' + ended.winner : 'NOT ENDED (state ' + m.state + ')'} · ${(m.time / 60).toFixed(1)}min`);
}
const avg = total.rallies.reduce((a, b) => a + b, 0) / Math.max(1, total.rallies.length);
console.log('point reasons:', total.reasons);
console.log('shots:', total.shots);
console.log('avg shots per rally:', avg.toFixed(2), '· serves', total.serves, '· rotation errors', total.rotationErrors);
if (total.timeouts || total.rotationErrors) { console.error('FAIL'); process.exit(1); }
