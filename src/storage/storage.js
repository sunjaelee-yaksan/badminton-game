// 저장소 어댑터.
// 1~2단계: 브라우저(localStorage)에만 저장 → 개인정보 수집 없음.
// 3단계(계정 도입): 같은 메서드(get/set)를 가진 SupabaseStorage를 만들어 createStorage()에서 바꿔 끼우면
// 게임 코드는 수정할 필요가 없습니다. 메서드를 처음부터 async로 둔 이유입니다.
const PREFIX = 'badminton-class:';

class LocalStorageAdapter {
  async get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }
  async set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* 저장 불가 환경은 무시 */ }
  }
}

class MemoryAdapter {
  constructor() { this.m = new Map(); }
  async get(key, fallback = null) { return this.m.has(key) ? this.m.get(key) : fallback; }
  async set(key, value) { this.m.set(key, value); }
}

export function createStorage() {
  try {
    localStorage.setItem(PREFIX + '_test', '1');
    localStorage.removeItem(PREFIX + '_test');
    return new LocalStorageAdapter();
  } catch {
    return new MemoryAdapter();
  }
}
