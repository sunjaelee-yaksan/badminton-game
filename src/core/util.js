// 공통 유틸. 난수는 시드 기반이라 같은 입력이면 같은 결과 → 리플레이·서버 판정에 유리.
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    gauss: (sd = 1) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    disk: (r) => {
      const ang = next() * Math.PI * 2;
      const rad = r * Math.sqrt(next());
      return { x: Math.cos(ang) * rad, z: Math.sin(ang) * rad };
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const DEG = Math.PI / 180;

export class EventBus {
  constructor() { this.handlers = new Map(); }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, payload) {
    // 핸들러 안에서 clear()가 불려도(경기 종료 등) 이번 이벤트는 끝까지 전달
    const own = [...(this.handlers.get(type) ?? [])];
    const any = [...(this.handlers.get('*') ?? [])];
    own.forEach((fn) => fn(payload));
    any.forEach((fn) => fn(type, payload));
  }
  clear() { this.handlers.clear(); }
}
