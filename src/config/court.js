// 코트 규격 (단위: m) — 대한배드민턴협회/BWF 규격
// 좌표계: 네트가 z=0, 화면 아래쪽(내 코트)이 z>0, 상대 코트가 z<0, x는 좌우.
export const COURT = {
  halfLength: 6.7,          // 네트 ~ 엔드라인
  doublesHalfWidth: 3.05,   // 복식 사이드라인
  singlesHalfWidth: 2.59,   // 단식 사이드라인
  shortService: 1.98,       // 네트 ~ 숏서비스라인
  doublesLongService: 5.94, // 네트 ~ 복식 롱서비스라인 (복식 서브만 해당)
  netHeight: 1.524,         // 네트 중앙 높이
  netPostHeight: 1.55,
  netDepth: 0.76,           // 네트 그물 세로 길이
  postHalfWidth: 3.05,
};

export function halfWidth(format = 'singles') {
  return format === 'doubles' ? COURT.doublesHalfWidth : COURT.singlesHalfWidth;
}

// 랠리 중 인/아웃 판정 (라인에 걸치면 인)
export function inBounds(x, z, format = 'singles') {
  return Math.abs(x) <= halfWidth(format) && Math.abs(z) <= COURT.halfLength;
}

// 서브가 떨어져야 하는 리시버 서비스 코트
// receiverSide: +1(아래 코트) / -1(위 코트), court: 'R' | 'L' (리시버 기준 오른쪽/왼쪽)
// 아래 코트(+1) 선수는 -z 방향을 보므로 오른쪽이 +x, 위 코트(-1) 선수는 오른쪽이 -x.
export function serviceBox(receiverSide, court, format = 'singles') {
  const hw = halfWidth(format);
  const xs = court === 'R' ? receiverSide : -receiverSide;
  const back = format === 'doubles' ? COURT.doublesLongService : COURT.halfLength;
  const z1 = receiverSide * COURT.shortService;
  const z2 = receiverSide * back;
  return {
    xMin: xs > 0 ? 0 : -hw,
    xMax: xs > 0 ? hw : 0,
    zMin: Math.min(z1, z2),
    zMax: Math.max(z1, z2),
  };
}

export function inBox(x, z, box) {
  return x >= box.xMin && x <= box.xMax && z >= box.zMin && z <= box.zMax;
}

// 서버·리시버가 서 있어야 하는 칸 (내 코트 쪽). side: 그 선수의 코트(+1/-1), court: 'R'|'L'
// 서 있는 곳은 숏서비스라인 ~ 엔드라인 사이 (복식 롱서비스라인은 서브가 떨어지는 곳에만 적용)
export function standBox(side, court, format = 'singles') {
  const hw = halfWidth(format);
  const xs = court === 'R' ? side : -side;
  const z1 = side * COURT.shortService;
  const z2 = side * COURT.halfLength;
  return {
    xMin: xs > 0 ? 0 : -hw,
    xMax: xs > 0 ? hw : 0,
    zMin: Math.min(z1, z2),
    zMax: Math.max(z1, z2),
  };
}

export function insideWithMargin(x, z, box, m = 0.08) {
  return x >= box.xMin + m && x <= box.xMax - m && z >= box.zMin + m && z <= box.zMax - m;
}
