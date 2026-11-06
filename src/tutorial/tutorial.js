// 튜토리얼 진행: 단계별 목표를 경기 이벤트로 확인
import { FEEDS, goalMatches } from './lessons.js';
import { t } from '../i18n/index.js';

export class TutorialRunner {
  constructor({ session, lesson, panel, onFinish, onExit }) {
    this.session = session;
    this.lesson = lesson;
    this.panel = panel;
    this.onFinish = onFinish;
    this.onExit = onExit;
    this.stepIdx = 0;
    this.count = 0;
    this.done = false;
    const m = session.match;
    for (const ev of ['shot', 'serveResult', 'dash', 'press', 'chord', 'moved', 'positionOk', 'point']) {
      m.on(ev, (payload) => this.onEvent(ev, payload));
    }
    this.panel.classList.remove('hidden');
    this.render();
  }

  get step() { return this.lesson.steps[this.stepIdx]; }

  onEvent(type, payload) {
    if (this.done || this.advancing || !goalMatches(this.step.goal, type, payload)) return;
    this.count += 1;
    this.render(true);
    if (this.count >= this.step.goal.count) {
      // 목표 달성 후 잠깐 보여주고 다음 단계로 (그 사이 입력은 다음 단계에 섞이지 않게 무시)
      this.advancing = true;
      setTimeout(() => { this.advancing = false; this.advance(); }, 700);
    }
  }

  // 경기형 레슨에서 경기가 끝나면 레슨도 끝
  finishNow() {
    while (!this.done) this.advance();
  }

  advance() {
    if (this.done) return;
    this.stepIdx += 1;
    this.count = 0;
    if (this.stepIdx >= this.lesson.steps.length) {
      this.done = true;
      this.panel.innerHTML = `<div class="tut-title">${t('tutorial.lessonDone')}</div>
        <div class="btns"><button class="primary" data-a="ok">${t('tutorial.done')}</button></div>`;
      this.panel.querySelector('[data-a=ok]').onclick = () => this.onFinish?.(this.lesson.id);
      return;
    }
    // 서브 연습 ↔ 공 받기 연습 전환 (경기형 레슨은 경기를 그대로 이어감)
    if (this.step.drill) this.session.match.setDrill({ ...this.step.drill, feedSpecs: FEEDS });
    this.render();
  }

  render(pulse = false) {
    const goal = this.step.goal;
    const dots = Array.from({ length: goal.count }, (_, i) => `<i class="${i < this.count ? 'on' : ''}"></i>`).join('');
    this.panel.innerHTML = `
      <div class="tut-title">${t(`lesson.${this.lesson.id}.title`)} <small>${t('tutorial.progress', { n: this.stepIdx + 1, total: this.lesson.steps.length })}</small></div>
      <div class="tut-text">${t(this.step.text)}</div>
      ${this.step.keys ? `<div class="keycaps">${this.step.keys.map((k) => `<span class="keycap ${k === '+' ? 'plus' : ''}">${k}</span>`).join('')}</div>` : ''}
      <div class="tut-dots ${pulse ? 'pulse' : ''}">${dots}</div>
      <div class="btns row">
        <button data-a="skip">${t('tutorial.skip')}</button>
        <button data-a="exit">${t('tutorial.exit')}</button>
      </div>`;
    this.panel.querySelector('[data-a=skip]').onclick = () => { if (!this.advancing) this.advance(); };
    this.panel.querySelector('[data-a=exit]').onclick = () => this.onExit?.();
  }

  destroy() {
    this.done = true;
    this.panel.classList.add('hidden');
    this.panel.innerHTML = '';
  }
}
