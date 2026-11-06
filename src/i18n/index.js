// 다국어: 화면 문구는 전부 언어 파일에 있고 코드에는 키만 씁니다.
// 새 언어 추가 = 이 폴더에 vi.js 같은 파일을 만들고 아래 LANGS에 등록.
import ko from './ko.js';
import en from './en.js';

export const LANGS = { ko, en };
let current = 'ko';

export function setLang(lang) {
  current = LANGS[lang] ? lang : 'ko';
  document.documentElement.lang = current;
}
export function getLang() { return current; }

export function t(key, params = {}) {
  const dict = LANGS[current];
  let s = dict[key] ?? LANGS.ko[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
