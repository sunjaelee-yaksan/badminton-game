// AI 선수: 사람과 똑같이 "이동 입력 + 버튼"만 넣는다.
// 온라인 대전에서는 이 자리에 '네트워크로 받은 다른 사람의 입력'이 들어가면 됨.
import { GAMEPLAY } from '../config/gameplay.js';
import { COURT } from '../config/court.js';
import { createRng } from './util.js';

export class AIController {
  constructor(match, idx, level, seed = 7) {
    this.match = match;
    this.idx = idx;
    this.level = level;
    this.rng = createRng(seed);
    this.plan = null;
    this.planFor = null;
    this.serveAt = null;
    this.override = null; // 테스트·시연용 강제 샷
    const me = match.players[idx];
    me.aimMul = level.aimErrorMul;
    me.effects.moveSpeed *= level.speedMul;
  }

  get me() { return this.match.players[this.idx]; }

  update() {
    const m = this.match;
    const me = this.me;
    const now = m.time;
    me.input.moveX = 0;
    me.input.moveZ = 0;
    me.input.heightAdj = 0;

    if (m.state === 'serve') return this.updateServe();
    this.serveAt = null;
    if (m.state !== 'rally') return;

    const pred = m.prediction;
    if (pred && pred.receiverTeam === me.team && pred.ideal && pred.takerIdx === this.idx) {
      if (this.planFor !== pred) this.makePlan(pred);
      const plan = this.plan;
      if (now - pred.createdAt < this.level.reaction) return;
      this.moveTo(plan.stand.x, plan.stand.z, plan.pressAt - now);
      if (!plan.pressed && now >= plan.pressAt) {
        me.input.aimLat = plan.aimLat;
        me.input.aimDepth = plan.aimDepth;
        m.press(this.idx, plan.button);
        plan.pressed = true;
        plan.secondAt = plan.smash ? now + 0.03 : null; // 두 버튼 '동시' 누르기
      }
      if (plan.secondAt && now >= plan.secondAt) {
        m.press(this.idx, 'hairpin');
        plan.secondAt = null;
      }
    } else {
      const b = this.basePosition();
      this.moveTo(b.x, b.z, 1);
    }
  }

  // 서브 차례: 서버·리시버는 서비스 코트 안의 자리로 걸어가고, 파트너는 뒤쪽 반대편에
  updateServe() {
    const m = this.match;
    const me = this.me;
    const info = m.getServeInfo();
    let target;
    if (this.idx === info.serverIdx) {
      const b = info.serverStand;
      target = { x: (b.xMin + b.xMax) / 2 * 0.7, z: me.side * (COURT.shortService + 0.55) };
    } else if (this.idx === info.receiverIdx) {
      const b = info.receiverStand;
      const depth = m.format === 'doubles' ? COURT.shortService + 0.9 : COURT.shortService + 1.4;
      target = { x: (b.xMin + b.xMax) / 2, z: me.side * depth };
    } else {
      // 서버/리시버의 파트너: 반대쪽 칸 조금 뒤
      const mateRole = me.team === m.players[info.serverIdx].team ? info.serverStand : info.receiverStand;
      const cx = (mateRole.xMin + mateRole.xMax) / 2;
      target = { x: -cx, z: me.side * 4.3 };
    }
    if (!me.locked) this.moveTo(target.x, target.z, 1, 0.06);
    if (info.ready && info.serverIdx === this.idx) {
      if (this.serveAt == null) this.serveAt = m.time + GAMEPLAY.serve.aiDelay + this.rng.range(0, 0.6);
      if (m.time >= this.serveAt) {
        me.input.aimLat = this.rng.range(-1, 1);
        if (this.override?.serveHeight) me.serveHeight = this.override.serveHeight;
        const longRate = m.format === 'doubles' ? 0.25 : 0.7;
        m.press(this.idx, this.override?.serveButton ?? (this.rng.next() < longRate ? 'clear' : 'hairpin'));
        this.serveAt = null;
      }
    }
  }

  basePosition() {
    const m = this.match;
    const me = this.me;
    if (m.format !== 'doubles') return { x: 0, z: me.side * 3.6 };
    const mate = m.teams[me.team].find((p) => p.idx !== this.idx);
    // 파트너 반대쪽 절반을 맡음(사이드 바이 사이드 수비)
    const mateSide = Math.sign(mate.x) || (m.courtOf[mate.idx] === 'R' ? mate.side : -mate.side);
    return { x: -mateSide * 1.35, z: me.side * 3.6 };
  }

  makePlan(pred) {
    const L = this.level;
    const me = this.me;
    const ideal = pred.ideal;
    const err = this.rng.disk(L.positionError);
    const stand = { x: ideal.stand.x + err.x, z: ideal.stand.z + err.z };
    const nearNet = Math.abs(stand.z) < GAMEPLAY.nearNetDistance;
    const high = ideal.kind === 'overhead';
    const lateral = (ideal.hit.x - stand.x) * me.side;
    const backhandSide = lateral < -0.3 && this.rng.next() < 0.75;
    let button = 'clear';
    let smash = false;
    const r = this.rng.next();
    if (high && !nearNet) {
      if (r < L.smashRate && me.stamina > 20) { smash = true; button = backhandSide ? 'backhand' : 'clear'; }
      else if (r < L.smashRate + L.dropRate) button = backhandSide ? 'backhand' : 'hairpin';
      else button = backhandSide ? 'backhand' : 'clear';
    } else if (nearNet) {
      button = r < 0.55 ? 'hairpin' : (backhandSide ? 'backhand' : 'clear');
    } else {
      button = r < 0.65 ? (backhandSide ? 'backhand' : 'clear') : 'hairpin';
    }
    const ov = this.override;
    if (ov) { button = ov.button; smash = !!ov.smash; }
    this.plan = {
      stand,
      pressAt: ideal.pressAt + this.rng.gauss(L.timingSd) + (ov?.delay || 0),
      button,
      smash,
      aimLat: this.pickAim(),
      aimDepth: this.rng.range(-0.4, 0.4),
      pressed: false,
      secondAt: null,
    };
    this.planFor = pred;
  }

  // 상대가 없는 쪽으로 조준 (난이도가 높을수록 자주)
  pickAim() {
    const me = this.me;
    const opps = this.match.teams[1 - me.team];
    const avgX = opps.reduce((a, p) => a + p.x, 0) / opps.length;
    const oppLat = avgX * me.side;
    if (this.rng.next() < this.level.smartAim) return oppLat > 0 ? this.rng.range(-1, -0.4) : this.rng.range(0.4, 1);
    return this.rng.range(-1, 1);
  }

  moveTo(x, z, timeLeft, dead = 0.08) {
    const me = this.me;
    const dx = x - me.x, dz = z - me.z;
    const d = Math.hypot(dx, dz);
    if (d < dead) return;
    const k = Math.min(1, d / 0.4);
    me.input.moveX = (dx / d) * k;
    me.input.moveZ = (dz / d) * k;
    if (d > 2.4 && timeLeft < d / me.effects.moveSpeed && me.stamina > 40) this.match.dash(this.idx);
    if (Math.abs(me.z) > COURT.halfLength + 0.8) me.input.moveZ = -Math.sign(me.z) * 0.5;
  }
}
