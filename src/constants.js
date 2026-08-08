export const APP_VERSION = 'I22-2026-08-08';
export const CANON_VERSION = 'v25-2026-08-07';
export const ACCOUNT_KEY = 'TWBTD_V2_ACCOUNT';
export const SLOT_KEYS = Object.freeze(Array.from({ length: 9 }, (_, i) => `TWBTD_V2_SLOT_${i + 1}`));
export const SLOT_COUNT = 9;
export const SCHEMA_VERSION = 1;
export const MAX_PERSISTED_COMBAT_LOG_ENTRIES = 256;
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
