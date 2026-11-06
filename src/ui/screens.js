// 메뉴·설정·조작법·튜토리얼 목록·결과 화면
import { t, LANGS } from '../i18n/index.js';
import { RULE_PRESETS, SPEED_PRESETS } from '../config/rules.js';
import { AI_LEVELS } from '../config/ai.js';
import { LESSONS } from '../tutorial/lessons.js';

export class Screens {
  constructor(root) { this.root = root; }

  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; }

  render(html, bind) {
    this.root.innerHTML = `<div class="panel">${html}</div>`;
    this.root.classList.remove('hidden');
    bind?.((sel) => this.root.querySelector(sel), (sel) => this.root.querySelectorAll(sel));
  }

  menu({ onPlay, onDoubles, onOnline, onTutorial, onControls, onSettings }) {
    this.render(`
      <h1>🏸 ${t('app.title')}</h1>
      <p class="sub">${t('app.subtitle')}</p>
      <div class="btns">
        <button class="primary" data-a="tutorial">${t('menu.tutorial')}</button>
        <button data-a="play">${t('menu.play')}</button>
        <button data-a="doubles">${t('menu.doubles')}</button>
        <button data-a="online">${t('menu.online')}</button>
        <button data-a="controls">${t('menu.controls')}</button>
        <button data-a="settings">${t('menu.settings')}</button>
      </div>`, (q) => {
      q('[data-a=play]').onclick = onPlay;
      q('[data-a=doubles]').onclick = onDoubles;
      q('[data-a=online]').onclick = onOnline;
      q('[data-a=tutorial]').onclick = onTutorial;
      q('[data-a=controls]').onclick = onControls;
      q('[data-a=settings]').onclick = onSettings;
    });
  }

  settings(settings, { onChange, onBack }) {
    const sel = (key, options, labelKey) => `
      <label>${t(labelKey)}
        <select data-k="${key}">
          ${options.map(([v, l]) => `<option value="${v}" ${settings[key] === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </label>`;
    this.render(`
      <h2>${t('menu.settings')}</h2>
      <div class="form">
        ${sel('lang', Object.keys(LANGS).map((k) => [k, LANGS[k]['lang.name']]), 'settings.lang')}
        ${sel('rules', Object.keys(RULE_PRESETS).map((k) => [k, t(`rules.${k}`)]), 'settings.rules')}
        ${sel('speed', Object.keys(SPEED_PRESETS).map((k) => [k, t(`speed.${k}`)]), 'settings.speed')}
        ${sel('ai', Object.keys(AI_LEVELS).map((k) => [k, t(`ai.${k}`)]), 'settings.ai')}
      </div>
      <div class="btns"><button data-a="back">${t('menu.back')}</button></div>`, (q, qa) => {
      qa('select').forEach((s) => { s.onchange = () => onChange(s.dataset.k, s.value); });
      q('[data-a=back]').onclick = onBack;
    });
  }

  controls({ onBack }) {
    const keys = ['move', 'dash', 'clear', 'hairpin', 'backhand', 'aim', 'serve', 'smash', 'markers', 'pause'];
    this.render(`
      <h2>${t('controls.title')}</h2>
      <ul class="list">${keys.map((k) => `<li>${t(`controls.${k}`)}</li>`).join('')}</ul>
      <div class="btns"><button data-a="back">${t('menu.back')}</button></div>`, (q) => {
      q('[data-a=back]').onclick = onBack;
    });
  }

  tutorialList(progress, { onPick, onBack }) {
    this.render(`
      <h2>${t('tutorial.title')}</h2>
      <div class="btns lessons">
        ${LESSONS.map((l, i) => `<button data-i="${i}">${progress[l.id] ? '✅ ' : ''}${t(`lesson.${l.id}.title`)}</button>`).join('')}
      </div>
      <div class="btns"><button data-a="back">${t('menu.back')}</button></div>`, (q, qa) => {
      qa('[data-i]').forEach((b) => { b.onclick = () => onPick(LESSONS[Number(b.dataset.i)]); });
      q('[data-a=back]').onclick = onBack;
    });
  }

  // ── 온라인 ─────────────────────────────────────────
  onlineEntry({ name, format, code = '', error = '' }, { onHost, onJoin, onBack }) {
    this.render(`
      <h2>${t('online.title')}</h2>
      <p class="sub">${t('online.desc')}</p>
      <div class="form">
        <label>${t('online.nick')}
          <input data-k="name" maxlength="8" value="${escapeHtml(name)}" placeholder="${t('online.nickPh')}" autocomplete="off">
        </label>
      </div>
      <h3>${t('online.hostTitle')}</h3>
      <div class="form">
        <label>${t('online.format')}
          <select data-k="format">
            <option value="doubles" ${format === 'doubles' ? 'selected' : ''}>${t('online.doubles')}</option>
            <option value="singles" ${format === 'singles' ? 'selected' : ''}>${t('online.singles')}</option>
          </select>
        </label>
      </div>
      <div class="btns"><button class="primary" data-a="host">${t('online.host')}</button></div>
      <h3>${t('online.joinTitle')}</h3>
      <div class="joinrow">
        <input data-k="code" class="codeinput" maxlength="4" value="${escapeHtml(code)}" placeholder="ABCD" autocomplete="off" autocapitalize="characters">
        <button class="primary" data-a="join">${t('online.join')}</button>
      </div>
      <p class="err">${error}</p>
      <p class="note">${t('online.note')}</p>
      <div class="btns"><button data-a="back">${t('menu.back')}</button></div>`, (q) => {
      const val = () => ({ name: q('[data-k=name]').value.trim(), format: q('[data-k=format]').value, code: q('[data-k=code]').value });
      q('[data-a=host]').onclick = () => onHost(val());
      q('[data-a=join]').onclick = () => onJoin(val());
      q('[data-k=code]').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') onJoin(val()); };
      q('[data-k=name]').onkeydown = (e) => e.stopPropagation();
      q('[data-a=back]').onclick = onBack;
    });
  }

  // 대기실: slots = [{name, type}], youIdx = 내 자리
  lobby({ code, slots, youIdx, isHost, format, status = '' }, { onStart, onLeave }) {
    const perTeam = format === 'doubles' ? 2 : 1;
    const row = (s, i) => `<li class="${i === youIdx ? 'you' : ''}">
        <span class="slotno">${i + 1}</span>
        <span>${s.type === 'empty' ? `<i class="muted">${t('online.emptyAi')}</i>` : escapeHtml(s.name)}</span>
        ${i === 0 ? `<small class="tag">${t('online.hostTag')}</small>` : ''}
        ${i === youIdx ? `<small class="tag you">${t('online.youTag')}</small>` : ''}
      </li>`;
    const teams = [0, 1].map((tm) => `
      <div class="team team${tm}">
        <h4>${tm === 0 ? t('online.teamA') : t('online.teamB')}</h4>
        <ul>${slots.slice(tm * perTeam, tm * perTeam + perTeam).map((s, j) => row(s, tm * perTeam + j)).join('')}</ul>
      </div>`).join('');
    this.render(`
      <h2>${t('online.lobby')}</h2>
      <div class="roomcode"><small>${t('online.code')}</small><b>${code}</b></div>
      <p class="sub">${isHost ? t('online.hostWait') : t('online.clientWait')}</p>
      <div class="teams">${teams}</div>
      <p class="sub">${status}</p>
      <div class="btns">
        ${isHost ? `<button class="primary" data-a="start">${t('online.start')}</button>` : ''}
        <button data-a="leave">${t('online.leave')}</button>
      </div>`, (q) => {
      if (isHost) q('[data-a=start]').onclick = onStart;
      q('[data-a=leave]').onclick = onLeave;
    });
  }

  message(title, text, { onOk }) {
    this.render(`<h2>${title}</h2><p class="sub">${text}</p><div class="btns"><button class="primary" data-a="ok">OK</button></div>`, (q) => {
      q('[data-a=ok]').onclick = onOk;
    });
  }

  pause({ onResume, onQuit }) {
    this.render(`
      <h2>${t('menu.paused')}</h2>
      <div class="btns">
        <button class="primary" data-a="resume">${t('menu.resume')}</button>
        <button data-a="quit">${t('menu.quit')}</button>
      </div>`, (q) => {
      q('[data-a=resume]').onclick = onResume;
      q('[data-a=quit]').onclick = onQuit;
    });
  }

  result({ won, score, stats, myTeam = 0 }, { onAgain, onMenu, waitText, againLabel }) {
    // 위 코트(팀 B)에서 본 점수는 우리 팀 점수를 앞에
    score = myTeam === 1 ? [score[1], score[0]] : score;
    const shots = Object.entries(stats.shots)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<span class="chip">${t(`shot.${k}`)} ${v}</span>`).join('');
    const pct = stats.overhead ? Math.round((stats.timingGood / stats.overhead) * 100) : 0;
    this.render(`
      <h1>${won ? '🏆 ' + t('result.win') : t('result.lose')}</h1>
      <p class="bigscore">${score[0]} : ${score[1]}</p>
      <h3>${t('result.shots')}</h3>
      <div class="chips">${shots || '-'}</div>
      <p>${t('result.timing')}: <b>${pct}%</b> · ${t('result.longest')}: <b>${stats.longestRally}</b></p>
      ${waitText ? `<p class="sub">${waitText}</p>` : ''}
      <div class="btns">
        ${onAgain ? `<button class="primary" data-a="again">${againLabel ?? t('result.again')}</button>` : ''}
        <button data-a="menu">${t('result.menu')}</button>
      </div>`, (q) => {
      if (onAgain) q('[data-a=again]').onclick = onAgain;
      q('[data-a=menu]').onclick = onMenu;
    });
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
