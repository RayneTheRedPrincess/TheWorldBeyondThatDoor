export const APP_VERSION = 'PORTRAIT-A1-2026-08-08';
export const CANON_VERSION = 'v25-2026-08-07';
export const ACCOUNT_KEY = 'TWBTD_V2_ACCOUNT';
export const SLOT_KEYS = Object.freeze(Array.from({ length: 9 }, (_, i) => `TWBTD_V2_SLOT_${i + 1}`));
export const SLOT_COUNT = 9;
export const SCHEMA_VERSION = 1;
export const MAX_PERSISTED_COMBAT_LOG_ENTRIES = 256;

export const CAMPAIGN_DIFFICULTIES = Object.freeze(['Relaxed', 'Normal', 'Hard', 'Mean']);
export const CAMPAIGN_DIFFICULTY_DETAILS = Object.freeze({
  Relaxed: Object.freeze({
    label: 'Relaxed',
    summary: 'Lower enemy durability and damage; defeated allies recover more easily.',
    enemyHpMultiplier: 0.88,
    enemyDamageMultiplier: 0.88,
    specialHpMultiplier: 0.90,
    specialDamageMultiplier: 0.90
  }),
  Normal: Object.freeze({
    label: 'Normal',
    summary: 'Intended baseline. Enemies scale modestly with a larger real party and major encounters are sturdier.',
    enemyHpMultiplier: 1.10,
    enemyDamageMultiplier: 1.07,
    specialHpMultiplier: 1.16,
    specialDamageMultiplier: 1.10
  }),
  Hard: Object.freeze({
    label: 'Hard',
    summary: 'Stronger enemies, tougher bosses and trainers, and less room for inefficient turns.',
    enemyHpMultiplier: 1.28,
    enemyDamageMultiplier: 1.16,
    specialHpMultiplier: 1.38,
    specialDamageMultiplier: 1.22
  }),
  Mean: Object.freeze({
    label: 'Mean',
    summary: 'The harshest campaign: heavy enemy scaling, dangerous major encounters, Mean targeting, and stricter Exhaustion recovery.',
    enemyHpMultiplier: 1.46,
    enemyDamageMultiplier: 1.28,
    specialHpMultiplier: 1.62,
    specialDamageMultiplier: 1.36
  })
});
export function normalizeCampaignDifficulty(value) {
  const label = String(value || 'Normal');
  return CAMPAIGN_DIFFICULTIES.includes(label) ? label : 'Normal';
}
export const ROUTES = Object.freeze({
  HOME: 'home',
  NEW_GAME: 'new-game',
  CREATE: 'create',
  CONTINUE: 'continue',
  TAVERN: 'tavern',
  CAMPAIGN_PREP: 'campaign-prep',
  CAMPAIGN_RUN: 'campaign-run',
  CAMPAIGN_RESULTS: 'campaign-results',
  CHRONICLE: 'chronicle',
  SETTINGS: 'settings',
  HELP: 'help',
  TUTORIAL: 'tutorial',
  CREDITS: 'credits'
});
