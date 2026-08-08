export const CORE_STATS = Object.freeze(['STR','DEX','CON','INT','FTH','CHA','LCK']);
export const BASE_STARTING_STAT_POINTS = 10;

const RACIAL_STARTING_POINT_BONUS = Object.freeze({
  Human: 2
});

export function getStartingStatPool(race) {
  return BASE_STARTING_STAT_POINTS + Number(RACIAL_STARTING_POINT_BONUS[String(race || '')] || 0);
}

export function emptyStartingStats() {
  return Object.fromEntries(CORE_STATS.map(stat => [stat, 0]));
}

export function normalizeStartingStats(input = {}) {
  const output = emptyStartingStats();
  for (const stat of CORE_STATS) {
    const raw = Number(input?.[stat] ?? 0);
    output[stat] = Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 0;
  }
  return output;
}

export function totalStartingStats(input = {}) {
  const stats = normalizeStartingStats(input);
  return CORE_STATS.reduce((sum, stat) => sum + stats[stat], 0);
}

export function validateStartingStats(input, pool) {
  const stats = normalizeStartingStats(input);
  const total = totalStartingStats(stats);
  const errors = [];
  if (!Number.isInteger(pool) || pool < 0) errors.push('Starting stat pool is invalid.');
  if (total !== pool) errors.push(`Allocate exactly ${pool} starting stat points. ${Math.max(0, pool - total)} remain.`);
  return { ok: errors.length === 0, errors, stats, total, remaining: pool - total };
}

export function readStartingStatsFromForm(formData) {
  const raw = {};
  for (const stat of CORE_STATS) raw[stat] = formData.get(`stat_${stat}`);
  return normalizeStartingStats(raw);
}

export function ensureVesselStartingStats(slot) {
  if (!slot?.character) return slot;
  const next = structuredClone(slot);
  const pool = Number.isInteger(next.character.startingStatPool) && next.character.startingStatPool > 0
    ? next.character.startingStatPool
    : getStartingStatPool(next.character.race);
  next.character.startingStatPool = pool;
  next.character.startingStats = normalizeStartingStats(next.character.startingStats || {});
  return next;
}

export function redistributeStartingStats(slot, stats) {
  if (!slot?.character) return { ok: false, error: 'A bound Vessel is required.' };
  if (slot?.campaign?.active || slot?.campaign?.settlement) return { ok: false, error: 'Starting stats can only be redistributed between campaigns.' };
  const pool = Number.isInteger(slot.character.startingStatPool) && slot.character.startingStatPool > 0
    ? slot.character.startingStatPool
    : getStartingStatPool(slot.character.race);
  const validation = validateStartingStats(stats, pool);
  if (!validation.ok) return { ok: false, error: validation.errors[0] };
  const next = structuredClone(slot);
  next.character.startingStatPool = pool;
  next.character.startingStats = validation.stats;
  return { ok: true, slot: next };
}
