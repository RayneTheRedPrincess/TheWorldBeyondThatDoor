export const BASE_MAX_ENERGY = 7;
export const DODGE_CAP_PCT = 85;
export const BLOCK_CAP_PCT = 85;

function n(value, fallback = 0) { const x = Number(value); return Number.isFinite(x) ? x : fallback; }
export function clamp(value, min, max) { return Math.max(min, Math.min(max, n(value))); }
export function roundFinal(value) { return Math.max(0, Math.round(n(value))); }

export function diminishingDefenseCurve(stat) {
  const s = Math.max(0, n(stat));
  if (s <= 25) return s;
  if (s <= 50) return 25 + (s - 25) * 0.4;
  return 35 + 10 * ((s - 50) / ((s - 50) + 100));
}

export function constitutionBlockReductionCurve(stat) {
  const s = Math.max(0, n(stat));
  if (s <= 25) return s;
  if (s <= 50) return 25 + (s - 25) * 0.2;
  return 30 + 10 * ((s - 50) / ((s - 50) + 150));
}

export function baseDerivedStats(stats = {}) {
  const STR = Math.max(0, n(stats.STR));
  const DEX = Math.max(0, n(stats.DEX));
  const CON = Math.max(0, n(stats.CON));
  const INT = Math.max(0, n(stats.INT));
  const FTH = Math.max(0, n(stats.FTH));
  const CHA = Math.max(0, n(stats.CHA));
  const LCK = Math.max(0, n(stats.LCK));
  return {
    blockChancePct: 5 + diminishingDefenseCurve(STR),
    dodgeChancePct: 5 + diminishingDefenseCurve(DEX) + LCK * 0.05,
    blockedDamageReductionPct: 40 + constitutionBlockReductionCurve(CON),
    damageCritChancePct: 5 + STR * 0.11 + DEX * 0.22 + INT * 0.19 + LCK * 0.37,
    criticalDamagePct: 150 + STR * 0.25 + DEX * 0.18 + INT * 0.22 + LCK * 0.5,
    healingCritChancePct: 5 + FTH * 0.13,
    healingCriticalDamagePct: 150 + FTH * 0.18,
    incomingHealingPct: CON * 0.5 + FTH * 0.25 + CHA * 0.15,
    outgoingHealingPct: FTH * 0.75 + CHA * 0.45,
    energyGainPct: INT * 0.25 + FTH * 0.15 + CHA * 0.17,
    aggroMultiplier: Math.max(0.15, 1 - CHA * 0.0017)
  };
}

export function scaledBaseAmount(base, scaling = {}, stats = {}) {
  let factor = 1;
  for (const [key, coefficient] of Object.entries(scaling || {})) factor += Math.max(0, n(stats[key])) * n(coefficient);
  return n(base) * factor;
}

export function rollPercent(chancePct, rng = Math.random) {
  return n(rng()) * 100 < clamp(chancePct, 0, 100);
}

export function resolveCritical(rawAmount, { chancePct, criticalDamagePct, rng = Math.random } = {}) {
  const chance = Math.max(0, n(chancePct));
  const multiplier = Math.max(0, n(criticalDamagePct, 150)) / 100;
  let critical = false;
  let recursive = false;
  let amount = n(rawAmount);
  if (chance >= 100) {
    critical = true;
    amount *= multiplier;
    const excess = Math.min(100, chance - 100);
    if (excess > 0 && rollPercent(excess, rng)) {
      recursive = true;
      amount *= multiplier;
    }
  } else if (rollPercent(chance, rng)) {
    critical = true;
    amount *= multiplier;
  }
  return { amount, critical, recursive, chancePct: chance, criticalDamagePct: n(criticalDamagePct, 150) };
}

export function applyPercentModifiers(value, modifiers = []) {
  const totalPct = modifiers.reduce((sum, item) => sum + n(item), 0);
  return n(value) * (1 + totalPct / 100);
}

export function capDodgeChance(value) { return clamp(value, 0, DODGE_CAP_PCT); }
export function capBlockChance(value) { return clamp(value, 0, BLOCK_CAP_PCT); }

export function mitigateBlockedDamage(value, blockedDamageReductionPct) {
  return n(value) * Math.max(0, 1 - Math.max(0, n(blockedDamageReductionPct)) / 100);
}

export function applyDamageReduction(value, reductionPct) {
  return n(value) * Math.max(0, 1 - Math.max(-999, n(reductionPct)) / 100);
}

export function applyHealingModifiers(value, outgoingPct, incomingPct) {
  const outgoing = 1 + n(outgoingPct) / 100;
  const incoming = 1 + n(incomingPct) / 100;
  return n(value) * Math.max(0, outgoing) * Math.max(0, incoming);
}
