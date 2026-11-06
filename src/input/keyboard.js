import { KEYMAP, SHOT_BUTTONS } from '../config/controls.js';
import { GAMEPLAY } from '../config/gameplay.js';

const DIRS = ['up', 'down', 'left', 'right'];

export class KeyboardInput {
  constructor({ onButton, onDash, onPause }) {
    this.handlers = { onButton, onDash, onPause };
    this.held = new Set();
    this.lastDirPress = {};
    this.codeToAction = new Map();
    for (const [action, codes] of Object.entries(KEYMAP)) codes.forEach((c) => this.codeToAction.set(c, action));
    this.down = this.down.bind(this);
    this.up = this.up.bind(this);
    this.blur = () => this.held.clear();
  }
  attach() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }
  detach() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
    this.held.clear();
  }
  down(e) {
    const action = this.codeToAction.get(e.code);
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    if (DIRS.includes(action)) {
      const now = performance.now() / 1000;
      // 먼저 '누르고 있음'으로 기록해야 대시 순간에 이동 방향이 잡힘 (예전 버그: 대시가 잘 안 되던 원인)
      this.held.add(action);
      if (now - (this.lastDirPress[action] ?? -9) < GAMEPLAY.dash.doubleTapWindow) this.handlers.onDash?.();
      this.lastDirPress[action] = now;
    } else if (SHOT_BUTTONS.includes(action)) {
      this.handlers.onButton?.(action);
    } else if (action === 'dash') {
      this.handlers.onDash?.();
    } else if (action === 'pause') {
      this.handlers.onPause?.();
    }
  }
  up(e) {
    const action = this.codeToAction.get(e.code);
    if (action) this.held.delete(action);
  }
  // 화면 기준 축: x 오른쪽 +, y 위쪽 +
  axes() {
    const x = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
    const y = (this.held.has('up') ? 1 : 0) - (this.held.has('down') ? 1 : 0);
    return { x, y };
  }
}
