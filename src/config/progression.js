// ─────────────────────────────────────────────────────────────
// 캐릭터 성장·아이템·시즌 규칙 (3단계 계정 도입 때 사용할 데이터)
// 1~2단계(계정 없음)에서는 DEFAULT_CHARACTER 하나로만 경기합니다.
// ─────────────────────────────────────────────────────────────

export const STAT_KEYS = ['strength', 'agility', 'precision']; // 근력·순발력·정교함

export const STAT_LIMITS = {
  base: 30,            // 시즌 시작(초기화) 시 능력치
  maxFromTraining: 50, // 훈련·레벨업으로 올릴 수 있는 최대치
  maxFromItems: 15,    // 아이템으로 더할 수 있는 합계 상한(스탯별)
  hardCap: 100,
};

// 레벨: 시즌마다 1로 초기화. 아이템 착용 레벨 제한을 높게 잡아 장기 유저의 독주를 막음.
export const LEVELS = {
  max: 60,
  xpForLevel: (lv) => Math.round(80 * Math.pow(lv, 1.35)),
  statPointsPerLevel: 1,
};

// 시즌 규칙: 아이템은 유지, 레벨과 능력치는 초기화
export const SEASON = {
  keepItems: true,
  resetLevel: true,
  resetStats: true,
  // 학교용은 학기 = 시즌 권장
  schoolCalendar: [
    { id: 'S1', start: '03-01', end: '07-31' },
    { id: 'S2', start: '08-15', end: '02-15' },
  ],
};

// 장비: requiredLevel 이상이어야 착용, 효과는 STAT_LIMITS.maxFromItems로 제한
export const EQUIPMENT = [
  { id: 'racket_basic',   slot: 'racket',   requiredLevel: 1,  bonus: { strength: 2 } },
  { id: 'racket_power',   slot: 'racket',   requiredLevel: 30, bonus: { strength: 8 } },
  { id: 'racket_pro',     slot: 'racket',   requiredLevel: 50, bonus: { strength: 12 } },
  { id: 'shoes_basic',    slot: 'shoes',    requiredLevel: 1,  bonus: { agility: 2 } },
  { id: 'shoes_court',    slot: 'shoes',    requiredLevel: 30, bonus: { agility: 8 } },
  { id: 'wear_basic',     slot: 'wear',     requiredLevel: 1,  bonus: { agility: 1 } },
  { id: 'headband_basic', slot: 'headband', requiredLevel: 10, bonus: { precision: 3 } },
  { id: 'headband_focus', slot: 'headband', requiredLevel: 40, bonus: { precision: 9 } },
];

// 계정 없는 1~2단계와 수업 모드에서 모두가 쓰는 기본 캐릭터 (공정 경기)
export const DEFAULT_CHARACTER = {
  level: 1,
  stats: { strength: 50, agility: 50, precision: 50 },
  equipment: [],
};

// 실제 경기에 쓰이는 능력치 계산: 레벨 제한과 상한을 여기서 한 번에 적용
export function effectiveStats(character, { classMode = false } = {}) {
  if (classMode) return { ...DEFAULT_CHARACTER.stats }; // 수업 모드 = 능력치 평준화
  const out = {};
  for (const key of STAT_KEYS) {
    const trained = Math.min(character.stats[key] ?? STAT_LIMITS.base, STAT_LIMITS.maxFromTraining);
    let itemBonus = 0;
    for (const id of character.equipment ?? []) {
      const item = EQUIPMENT.find((e) => e.id === id);
      if (item && character.level >= item.requiredLevel) itemBonus += item.bonus[key] ?? 0;
    }
    out[key] = Math.min(trained + Math.min(itemBonus, STAT_LIMITS.maxFromItems), STAT_LIMITS.hardCap);
  }
  return out;
}

// 능력치 → 게임 수치 변환
export function statEffects(stats) {
  return {
    moveSpeed: 2.4 + stats.agility * 0.02,          // 2.4 ~ 4.4 m/s
    powerMul: 0.8 + stats.strength / 250,            // 0.8 ~ 1.2 (최대 샷 속도)
    aimError: 0.85 - (stats.precision / 100) * 0.7,  // 0.85 ~ 0.15 m (낙하지점 오차 반경)
  };
}
