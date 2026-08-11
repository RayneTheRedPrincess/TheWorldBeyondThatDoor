import { getStartingStatPool, normalizeStartingStats, validateStartingStats } from './starting-stats.js';
import { validateRacialConfiguration } from './racial-configuration.js';

const NAME_MAX = 24;

export function normalizeVesselName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateVesselDraft(draft, { unlockedRaces, baseClasses, racialConfigurations = null }) {
  const name = normalizeVesselName(draft.name);
  const race = String(draft.race || '');
  const baseClass = String(draft.baseClass || '');
  const errors = [];

  if (!name) errors.push('Enter a Vessel name.');
  if (name.length > NAME_MAX) errors.push(`Vessel names may contain at most ${NAME_MAX} characters.`);
  if (!unlockedRaces.includes(race)) errors.push('Choose an unlocked race.');
  if (!baseClasses.includes(baseClass)) errors.push('Choose a base class.');

  const startingStatPool = getStartingStatPool(race);
  const statValidation = validateStartingStats(draft.startingStats || {}, startingStatPool);
  errors.push(...statValidation.errors);
  const racialValidation = validateRacialConfiguration(race, draft.racialConfiguration, racialConfigurations);
  errors.push(...racialValidation.errors);

  return { ok: errors.length === 0, errors, value: { name, race, baseClass, startingStatPool, startingStats: statValidation.stats, racialConfiguration: racialValidation.value } };
}

export function createVesselSlotState({ name, race, baseClass, startingStatPool = getStartingStatPool(race), startingStats = {}, racialConfiguration = null }, now = new Date().toISOString()) {
  return {
    createdAt: now,
    character: {
      name,
      race,
      baseClass,
      subclass: null,
      createdAt: now,
      appearance: {},
      startingStatPool,
      startingStats: normalizeStartingStats(startingStats),
      racialConfiguration: racialConfiguration ? JSON.parse(JSON.stringify(racialConfiguration)) : null
    },
    loadout: {
      keptImpressions: [],
      equipment: {},
      consumables: [],
      borrowedItem: null
    },
    inventory: { equipment: {}, consumables: {} },
    party: { tavernAdventurerIds: [] },
    campaign: {
      active: false,
      state: null,
      settlement: null,
      lastCompletedAt: null
    },
    tavern: {
      lastRoom: 'main-hall'
    },
    tavernServices: { mara: { offerCycle: -1, offers: [], activeQuest: null } },
    lender: { collection: [], selectedItemId: null },
    history: {
      returnedAliveItems: [],
      campaigns: [],
      campaignStats: { total: 0, victories: 0, defeats: 0 }
    }
  };
}
