// 경기 중 화면 정보: 점수판, 미니맵(위에서 본 코트), 알림, 스테미나
import { COURT } from '../config/court.js';
import { t } from '../i18n/index.js';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="scoreboard">
        <div class="srow me"><span class="srv" data-srv0></span><span class="nm" data-n0></span><b data-s0>0</b></div>
        <div class="srow ai"><span class="srv" data-srv1></span><span class="nm" data-n1></span><b data-s1>0</b></div>
        <div class="rulelabel" data-rule></div>
      </div>
      <canvas class="minimap" width="120" height="210" data-mini></canvas>
      <div class="banner hidden" data-banner></div>
      <div class="toasts" data-toasts></div>
      <div class="stamina"><span data-stl></span><div class="bar"><i data-st></i></div></div>
      <button class="pausebtn" data-pause aria-label="pause">II</button>
      <div class="serve-gauge hidden" data-gauge>
        <div class="g-title" data-gt></div>
        <div class="g-bar"><div class="g-limit" data-glimit></div><div class="g-mark" data-gmark></div></div>
        <div class="g-val" data-gval></div>
      </div>
      <div class="tutorial-panel hidden" data-tut></div>`;
    const q = (s) => root.querySelector(s);
    this.el = {
      s0: q('[data-s0]'), s1: q('[data-s1]'), n0: q('[data-n0]'), n1: q('[data-n1]'),
      srv0: q('[data-srv0]'), srv1: q('[data-srv1]'), rule: q('[data-rule]'),
      mini: q('[data-mini]'), banner: q('[data-banner]'), toasts: q('[data-toasts]'),
      st: q('[data-st]'), stl: q('[data-stl]'), pause: q('[data-pause]'), tut: q('[data-tut]'),
      gauge: q('[data-gauge]'), gt: q('[data-gt]'), glimit: q('[data-glimit]'), gmark: q('[data-gmark]'), gval: q('[data-gval]'),
    };
    this.bannerHtml = '';
    this.ctx = this.el.mini.getContext('2d');
  }

  show(on) { this.root.classList.toggle('hidden', !on); }

  setup({ names, ruleLabel, showScore = true }) {
    this.el.n0.textContent = names[0];
    this.el.n1.textContent = names[1];
    this.el.rule.textContent = ruleLabel;
    this.el.stl.textContent = t('hud.stamina');
    this.root.querySelector('.scoreboard').classList.toggle('hidden', !showScore);
    this.el.toasts.innerHTML = '';
    this.hideBanner();
  }

  onPause(fn) { this.el.pause.onclick = fn; }

  update(match, humanIdx = 0) {
    // 윗줄 = 우리 팀 (온라인에서 위 코트 팀이면 순서를 바꿔 보여줌)
    const myTeam = match.players[humanIdx]?.team ?? 0;
    const sc = match.scoreboard.score;
    this.el.s0.textContent = sc[myTeam];
    this.el.s1.textContent = sc[1 - myTeam];
    const serving = match.state === 'serve' || match.state === 'rally';
    const st = match.players[match.serverIdx]?.team;
    this.el.srv0.classList.toggle('on', serving && st === myTeam);
    this.el.srv1.classList.toggle('on', serving && st === 1 - myTeam);
    // 1인칭 서브 높이 게이지
    const sv = match.getServeInfo();
    const fp = sv && sv.ready && sv.serverIdx === humanIdx;
    this.el.gauge.classList.toggle('hidden', !fp);
    if (fp) {
      const [lo, hi] = [0.6, 1.5];
      const pctOf = (h) => `${((h - lo) / (hi - lo)) * 100}%`;
      this.el.gt.textContent = t('gauge.title');
      this.el.glimit.style.bottom = pctOf(1.15);
      this.el.gmark.style.bottom = pctOf(sv.height);
      const bad = sv.height > 1.15;
      this.el.gmark.classList.toggle('bad', bad);
      this.el.gval.textContent = `${sv.height.toFixed(2)}m ${bad ? t('gauge.bad') : t('gauge.ok')}`;
      this.el.gval.classList.toggle('bad', bad);
    }
    const me = match.players[humanIdx];
    const pct = (me.stamina / 100) * 100;
    this.el.st.style.width = `${pct}%`;
    this.el.st.classList.toggle('low', me.stamina < 15);
    this.drawMinimap(match, humanIdx);
  }

  drawMinimap(match, humanIdx) {
    const c = this.ctx, W = 120, H = 210, k = 14;
    const cx = W / 2, cz = H / 2;
    const f = match.players[humanIdx]?.side ?? 1; // 위 코트 선수는 미니맵도 뒤집어서 내 코트가 아래
    const X = (x) => cx + x * k * f, Z = (z) => cz + z * k * f;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,90,60,0.9)';
    c.fillRect(cx - COURT.doublesHalfWidth * k, cz - COURT.halfLength * k, COURT.doublesHalfWidth * 2 * k, COURT.halfLength * 2 * k);
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1;
    c.strokeRect(cx - COURT.singlesHalfWidth * k, cz - COURT.halfLength * k, COURT.singlesHalfWidth * 2 * k, COURT.halfLength * 2 * k);
    c.beginPath();
    for (const z of [-COURT.shortService, COURT.shortService]) { c.moveTo(X(-COURT.doublesHalfWidth), Z(z)); c.lineTo(X(COURT.doublesHalfWidth), Z(z)); }
    c.moveTo(X(0), Z(-COURT.halfLength)); c.lineTo(X(0), Z(-COURT.shortService));
    c.moveTo(X(0), Z(COURT.shortService)); c.lineTo(X(0), Z(COURT.halfLength));
    c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X(-COURT.doublesHalfWidth - 0.2), Z(0)); c.lineTo(X(COURT.doublesHalfWidth + 0.2), Z(0)); c.stroke();
    const pred = match.prediction;
    if (pred && match.state === 'rally') {
      c.fillStyle = pred.receiverTeam === match.players[humanIdx].team ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)';
      c.beginPath(); c.arc(X(pred.landing.x), Z(pred.landing.z), 4, 0, Math.PI * 2); c.fill();
    }
    match.players.forEach((p, i) => {
      c.fillStyle = i === humanIdx ? '#58a6ff' : p.team === match.players[humanIdx].team ? '#a8d0ff' : '#ff6b6b';
      c.beginPath(); c.arc(X(p.x), Z(p.z), 5, 0, Math.PI * 2); c.fill();
      if (i === humanIdx) { c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); }
    });
    const s = match.shuttle;
    c.fillStyle = '#ffe066';
    c.beginPath(); c.arc(X(s.x), Z(s.z), 2.5, 0, Math.PI * 2); c.fill();
  }

  toast(text, kind = 'info', dur = 1.4) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => d.classList.add('out'), dur * 1000);
    setTimeout(() => d.remove(), dur * 1000 + 400);
  }

  banner(html) {
    if (html !== this.bannerHtml) { this.el.banner.innerHTML = html; this.bannerHtml = html; }
    this.el.banner.classList.remove('hidden');
  }
  hideBanner() { this.el.banner.classList.add('hidden'); this.bannerHtml = ''; }
}
