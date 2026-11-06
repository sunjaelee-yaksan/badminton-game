// 모바일·태블릿용 가상 조이패드 (왼쪽 스틱 + 오른쪽 버튼 4개)
import { t } from '../i18n/index.js';

export class TouchInput {
  constructor(root, { onButton, onDash }) {
    this.root = root;
    this.handlers = { onButton, onDash };
    this.vec = { x: 0, y: 0 };
    this.pointerId = null;
    this.build();
  }

  build() {
    this.root.innerHTML = `
      <div class="stick" data-stick><div class="stick-knob" data-knob></div></div>
      <div class="tbtns">
        <button class="tbtn tb-dash" data-act="dash"></button>
        <button class="tbtn tb-smash" data-act="smash"></button>
        <button class="tbtn tb-backhand" data-act="backhand"></button>
        <button class="tbtn tb-hairpin" data-act="hairpin"></button>
        <button class="tbtn tb-clear" data-act="clear"></button>
      </div>`;
    this.stick = this.root.querySelector('[data-stick]');
    this.knob = this.root.querySelector('[data-knob]');
    this.relabel();

    this.stick.addEventListener('pointerdown', (e) => {
      this.pointerId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.moveStick(e);
    });
    this.stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.pointerId) this.moveStick(e); });
    const end = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.vec = { x: 0, y: 0 };
      this.knob.style.transform = 'translate(-50%, -50%)';
    };
    this.stick.addEventListener('pointerup', end);
    this.stick.addEventListener('pointercancel', end);

    this.root.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const act = b.dataset.act;
        if (act === 'dash') this.handlers.onDash?.();
        else if (act === 'smash') { this.handlers.onButton?.('clear'); this.handlers.onButton?.('hairpin'); } // 두 버튼 동시
        else this.handlers.onButton?.(act);
        b.classList.add('pressed');
      });
      const up = () => b.classList.remove('pressed');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
    });
  }

  relabel() {
    this.root.querySelectorAll('[data-act]').forEach((b) => { b.textContent = t(`btn.${b.dataset.act}`); });
  }

  moveStick(e) {
    const r = this.stick.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (e.clientX - cx) / (r.width / 2);
    let dy = (e.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    this.vec = { x: Math.abs(dx) < 0.15 ? 0 : dx, y: Math.abs(dy) < 0.15 ? 0 : -dy };
    this.knob.style.transform = `translate(calc(-50% + ${dx * 40}px), calc(-50% + ${dy * 40}px))`;
  }

  axes() { return this.vec; }
}

export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
}
