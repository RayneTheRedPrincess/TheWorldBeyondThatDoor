import { ACCOUNT_KEY, SLOT_KEYS, SCHEMA_VERSION, MAX_PERSISTED_COMBAT_LOG_ENTRIES } from './constants.js';
import { compactEncounterHistory, compactRegionSummaries, compactRegionBaselines, normalizeCraftingLedger, normalizeCampaignHistory } from './storage-efficiency.js';

const CORE_STATS = ['STR','DEX','CON','INT','FTH','CHA','LCK'];

function safeParse(raw) {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function nowIso() { return new Date().toISOString(); }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function record(value) { return isRecord(value) ? value : {}; }
function stringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))];
}
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function nonNegative(value, fallback = 0) { return Math.max(0, finite(value, fallback)); }
function boolean(value, fallback = false) { return typeof value === 'boolean' ? value : fallback; }
function normalizeStats(value) {
  const source = record(value);
  return Object.fromEntries(CORE_STATS.map(stat => [stat, Math.max(0, Math.trunc(finite(source[stat], 0)))]));
}

const EXPEDITION_STATES = new Set(['choosing-event','combat-pending','noncombat-pending','event-result','campsite','awaiting-next-step','region-boundary','awaiting-next-region']);
const SETTLEMENT_OUTCOMES = new Set(['victory','defeat','return']);

function normalizePerformanceResult(value) {
  const result = record(value);
  return { ...result, names: stringList(result.names), value: nonNegative(result.value, 0) };
}

function normalizeSettlement(value) {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const outcome = typeof value.outcome === 'string' ? value.outcome : '';
  if (!id || !SETTLEMENT_OUTCOMES.has(outcome)) return null;
  const onyx = record(value.onyx);
  const chronicle = record(value.chronicle);
  if (typeof chronicle.family !== 'string' || !chronicle.family.trim()) return null;
  const performance = record(value.performance);
  const lender = record(value.lender);
  const candidates = stringList(lender.candidates);
  const selected = typeof lender.selectedItemId === 'string' && candidates.includes(lender.selectedItemId) ? lender.selectedItemId : null;
  return {
    ...value,
    id,
    outcome,
    vesselName: typeof value.vesselName === 'string' ? value.vesselName : 'Recovered Vessel',
    finalCharacterLevel: Math.max(1, Math.trunc(finite(value.finalCharacterLevel, 1))),
    onyx: {
      ...onyx,
      carried: nonNegative(onyx.carried, 0),
      baseCarried: nonNegative(onyx.baseCarried, 0),
      maraQuestOnyx: nonNegative(onyx.maraQuestOnyx, 0),
      banked: nonNegative(onyx.banked, 0),
      rule: typeof onyx.rule === 'string' ? onyx.rule : (outcome === 'defeat' ? 'Half carried Onyx banked' : 'All carried Onyx banked')
    },
    chronicle: {
      ...chronicle,
      family: chronicle.family.trim(),
      progressEarned: nonNegative(chronicle.progressEarned, 0),
      rankBefore: Math.max(0, Math.trunc(finite(chronicle.rankBefore, 0))),
      rankAfter: Math.max(0, Math.trunc(finite(chronicle.rankAfter, 0))),
      chroniclePointsEarned: Math.max(0, Math.trunc(finite(chronicle.chroniclePointsEarned, 0)))
    },
    performance: {
      ...performance,
      mostDamageDealt: normalizePerformanceResult(performance.mostDamageDealt),
      mostDamageTaken: normalizePerformanceResult(performance.mostDamageTaken),
      mostHealingDone: normalizePerformanceResult(performance.mostHealingDone)
    },
    lender: { ...lender, candidates, selectedItemId: selected },
    accomplishments: record(value.accomplishments),
    metrics: record(value.metrics),
    party: Array.isArray(value.party) ? value.party.filter(isRecord) : []
  };
}

export function normalizeAccountSave(value) {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return null;
  const unlocks = record(value.unlocks);
  const features = record(value.progressionFeatures);
  const chronicle = record(value.chronicle);
  const classless = record(chronicle.classless);
  const currencies = record(value.currencies);
  const history = record(value.history);
  const records = record(value.records);
  const forestAccomplishments = record(records.forestAccomplishments);
  const settings = record(value.settings);
  const tutorials = record(value.tutorials);
  const starter = record(tutorials.starter);
  const tokenWallet = record(tutorials.tokenWallet);
  const statusesRaw = record(tutorials.statuses);
  const statuses = {};
  for (const [id, status] of Object.entries(statusesRaw)) {
    statuses[id] = ['never-seen','started','completed','skipped'].includes(status) ? status : 'never-seen';
  }
  const activeSlot = Math.trunc(finite(value.activeSlot, 0));
  const combatSpeed = finite(settings.combatSpeed, 1);
  const screenFlash = ['off','low','standard'].includes(settings.screenFlash) ? settings.screenFlash : 'standard';
  return {
    ...value,
    activeSlot: activeSlot >= 1 && activeSlot <= SLOT_KEYS.length ? activeSlot : null,
    unlocks: {
      ...unlocks,
      races: stringList(unlocks.races),
      subclasses: stringList(unlocks.subclasses),
      keptImpressions: stringList(unlocks.keptImpressions),
      tavernAdventurers: stringList(unlocks.tavernAdventurers),
      mantleBaseClasses: stringList(unlocks.mantleBaseClasses)
    },
    progressionFeatures: {
      ...features,
      mantle: boolean(features.mantle),
      chronicle: boolean(features.chronicle)
    },
    chronicle: {
      ...chronicle,
      families: record(chronicle.families),
      classless: { ...classless, rank: Math.max(0, Math.trunc(finite(classless.rank, 0))), progress: nonNegative(classless.progress, 0) }
    },
    currencies: { ...currencies, onyx: nonNegative(currencies.onyx, 0) },
    history: { ...history, settledCampaignIds: stringList(history.settledCampaignIds) },
    records: {
      ...records,
      bossesDefeated: Math.max(0, Math.trunc(finite(records.bossesDefeated, 0))),
      minibossesDefeated: Math.max(0, Math.trunc(finite(records.minibossesDefeated, 0))),
      trainersEncountered: stringList(records.trainersEncountered),
      trainersFought: stringList(records.trainersFought),
      trainersLearnedFrom: stringList(records.trainersLearnedFrom),
      notableCombat: record(records.notableCombat),
      forestAccomplishments: {
        ...forestAccomplishments,
        campaignsSettled: Math.max(0, Math.trunc(finite(forestAccomplishments.campaignsSettled, 0))),
        highestDepth: Math.max(0, Math.trunc(finite(forestAccomplishments.highestDepth, 0))),
        battlesWon: Math.max(0, Math.trunc(finite(forestAccomplishments.battlesWon, 0))),
        successfulChecks: Math.max(0, Math.trunc(finite(forestAccomplishments.successfulChecks, 0))),
        craftedItems: Math.max(0, Math.trunc(finite(forestAccomplishments.craftedItems, 0))),
        trainerEncounters: Math.max(0, Math.trunc(finite(forestAccomplishments.trainerEncounters, 0))),
        ordinaryMaterialsCollected: Math.max(0, Math.trunc(finite(forestAccomplishments.ordinaryMaterialsCollected, 0))),
        minibossesDefeated: Math.max(0, Math.trunc(finite(forestAccomplishments.minibossesDefeated, 0))),
        bossesDefeated: Math.max(0, Math.trunc(finite(forestAccomplishments.bossesDefeated, 0))),
        forestsCleared: Math.max(0, Math.trunc(finite(forestAccomplishments.forestsCleared, 0)))
      }
    },
    settings: {
      ...settings,
      combatSpeed: Math.min(4, Math.max(0.1, combatSpeed)),
      autoEndTurn: typeof settings.autoEndTurn === 'boolean' ? settings.autoEndTurn : true,
      reducedMotion: boolean(settings.reducedMotion),
      combatNumbers: typeof settings.combatNumbers === 'boolean' ? settings.combatNumbers : true,
      screenFlash,
      hiddenCraftingRecipes: stringList(settings.hiddenCraftingRecipes)
    },
    tutorials: {
      ...tutorials,
      starter: {
        ...starter,
        resolved: boolean(starter.resolved),
        resolution: ['completed','skipped'].includes(starter.resolution) ? starter.resolution : null,
        rewardGranted: boolean(starter.rewardGranted),
        raceChoiceGranted: boolean(starter.raceChoiceGranted),
        resolvedAt: typeof starter.resolvedAt === 'string' ? starter.resolvedAt : null
      },
      statuses,
      tokenWallet: { ...tokenWallet, keptImpression3OrLess: Math.min(2, Math.max(0, Math.trunc(finite(tokenWallet.keptImpression3OrLess, 0)))), raceChoice: Math.min(1, Math.max(0, Math.trunc(finite(tokenWallet.raceChoice, 0)))) },
      contextualSeen: stringList(tutorials.contextualSeen)
    }
  };
}

function normalizeCombatState(value) {
  if (!isRecord(value)) return null;
  if (!['ready','active','complete'].includes(value.state)) return null;
  if (!Array.isArray(value.actors) || value.actors.length < 2) return null;
  const rawActors = value.actors.filter(actor => isRecord(actor) && typeof actor.id === 'string' && actor.id.trim() && ['party','enemy'].includes(actor.side) && isRecord(actor.resources) && Number.isFinite(Number(actor.resources.hp)) && Number.isFinite(Number(actor.resources.maxHp)) && Number(actor.resources.maxHp) > 0);
  if (rawActors.length !== value.actors.length || new Set(rawActors.map(actor => actor.id)).size !== rawActors.length) return null;
  const actors = rawActors.map(actor => {
    const maxHp = Math.max(1, finite(actor.resources.maxHp, 1));
    const maxEnergy = Math.max(1, finite(actor.resources.maxEnergy, 7));
    return {
      ...actor,
      resources: {
        ...actor.resources,
        maxHp,
        hp: Math.min(maxHp, Math.max(0, finite(actor.resources.hp, maxHp))),
        maxEnergy,
        energy: Math.min(maxEnergy, Math.max(0, finite(actor.resources.energy, 0))),
        shield: nonNegative(actor.resources.shield, 0),
        shieldLayers: Array.isArray(actor.resources.shieldLayers) ? actor.resources.shieldLayers.filter(isRecord) : []
      }
    };
  });
  if (!actors.some(actor => actor.real !== false && actor.side === 'party') || !actors.some(actor => actor.real !== false && actor.side === 'enemy')) return null;
  const actorIds = new Set(actors.map(actor => actor.id));
  const rawQueue = Array.isArray(value.queue) ? value.queue.filter(id => typeof id === 'string' && actorIds.has(id)) : [];
  if (!rawQueue.length || new Set(rawQueue).size !== rawQueue.length) return null;
  const queue = rawQueue;
  const round = Math.max(1, Math.trunc(finite(value.round, 1)));
  const rawQueueIndex = Math.trunc(finite(value.queueIndex, 0));
  const queueIndex = Math.min(queue.length, Math.max(0, rawQueueIndex));
  const currentActorId = typeof value.currentActorId === 'string' ? value.currentActorId : null;
  const turn = isRecord(value.turn) ? value.turn : null;
  if (value.state === 'ready' && (currentActorId || turn)) return null;
  if (value.state === 'active') {
    const current = currentActorId ? actors.find(actor => actor.id === currentActorId) : null;
    if (!current || Number(current.resources?.hp || 0) <= 0 || !turn || turn.actorId !== currentActorId) return null;
    if (queueIndex >= queue.length || queue[queueIndex] !== currentActorId) return null;
  }
  if (value.state === 'complete') {
    if (!['victory','defeat'].includes(value.outcome)) return null;
    if (currentActorId || turn) return null;
  }
  return { ...value, actors, queue, queueIndex, round, currentActorId, turn, log: Array.isArray(value.log) ? value.log.filter(isRecord).slice(-MAX_PERSISTED_COMBAT_LOG_ENTRIES) : [] };
}

function normalizeRunState(value) {
  if (!isRecord(value)) return null;
  const run = { ...value };
  if (!isRecord(run.character) || !isRecord(run.configuration) || !isRecord(run.expedition)) return null;
  run.character = {
    ...run.character,
    level: Math.max(1, Math.trunc(finite(run.character.level, 1))),
    exp: nonNegative(run.character.exp, 0),
    startingStats: normalizeStats(run.character.startingStats),
    levelEarnedStats: normalizeStats(run.character.levelEarnedStats),
    unspentLevelStatPoints: Math.max(0, Math.trunc(finite(run.character.unspentLevelStatPoints, 0)))
  };
  run.configuration = {
    ...run.configuration,
    keptImpressions: stringList(run.configuration.keptImpressions),
    consumables: stringList(run.configuration.consumables),
    equipment: record(run.configuration.equipment),
    keptImpressionChoices: record(run.configuration.keptImpressionChoices)
  };
  const expedition = record(run.expedition);
  if (!EXPEDITION_STATES.has(expedition.state)) return null;
  const maxDepth = Math.max(1, Math.trunc(finite(expedition.maxDepth, 30)));
  const depth = Math.min(maxDepth, Math.max(1, Math.trunc(finite(expedition.depth, 1))));
  run.expedition = {
    ...expedition,
    cards: Array.isArray(expedition.cards) ? expedition.cards.filter(isRecord) : [],
    history: compactEncounterHistory(expedition.history),
    usedEventIds: stringList(expedition.usedEventIds),
    shownTrainerIds: stringList(expedition.shownTrainerIds),
    encounter: isRecord(expedition.encounter) ? expedition.encounter : null,
    campsite: isRecord(expedition.campsite) ? expedition.campsite : null,
    depth,
    maxDepth
  };
  run.rewards = { ...record(run.rewards), carriedOnyx: nonNegative(run.rewards?.carriedOnyx, 0), chronicleProgress: nonNegative(run.rewards?.chronicleProgress, 0) };
  run.metrics = record(run.metrics);
  run.party = Array.isArray(run.party) ? run.party.filter(isRecord) : [];
  run.adventurers = record(run.adventurers);
  run.inventory = {
    ...record(run.inventory),
    equipment: record(run.inventory?.equipment),
    consumables: record(run.inventory?.consumables),
    materials: record(run.inventory?.materials)
  };
  run.crafting = { ...normalizeCraftingLedger(run.crafting), equippedHistory: stringList(run.crafting?.equippedHistory) };
  const craftingUi = record(run.craftingUi);
  run.craftingUi = {
    onlyCraftable: boolean(craftingUi.onlyCraftable),
    sortStat: typeof craftingUi.sortStat === 'string' ? craftingUi.sortStat : '',
    direction: craftingUi.direction === 'asc' ? 'asc' : 'desc',
    query: typeof craftingUi.query === 'string' ? craftingUi.query : '',
    slot: typeof craftingUi.slot === 'string' && craftingUi.slot ? craftingUi.slot : 'all',
    itemType: typeof craftingUi.itemType === 'string' && craftingUi.itemType ? craftingUi.itemType : 'all',
    subtype: typeof craftingUi.subtype === 'string' && craftingUi.subtype ? craftingUi.subtype : 'all',
    weaponType: typeof craftingUi.weaponType === 'string' && craftingUi.weaponType ? craftingUi.weaponType : 'all',
    armorWeight: typeof craftingUi.armorWeight === 'string' && craftingUi.armorWeight ? craftingUi.armorWeight : 'all',
    openCategories: stringList(craftingUi.openCategories),
    hiddenRecipeIds: stringList(craftingUi.hiddenRecipeIds),
    showHidden: boolean(craftingUi.showHidden)
  };
  run.regionSummaries = compactRegionSummaries(run.regionSummaries);
  run.regionBaselines = compactRegionBaselines(run.regionBaselines);
  run.consumptionLedger = { ...record(run.consumptionLedger), consumables: record(run.consumptionLedger?.consumables) };
  run.combat = normalizeCombatState(run.combat);
  return run;
}

export function normalizeSlotSave(value) {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION) return null;
  // A persisted slot key without a Vessel is not a recoverable bound slot. Treat it
  // as empty so malformed storage cannot create a ghost slot that blocks creation.
  if (!isRecord(value.character)) return null;
  const character = {
    ...value.character,
    name: typeof value.character.name === 'string' ? value.character.name : 'Recovered Vessel',
    race: typeof value.character.race === 'string' ? value.character.race : '',
    baseClass: typeof value.character.baseClass === 'string' ? value.character.baseClass : '',
    subclass: typeof value.character.subclass === 'string' ? value.character.subclass : null,
    appearance: record(value.character.appearance),
    startingStatPool: Math.max(0, Math.trunc(finite(value.character.startingStatPool, 0))),
    startingStats: normalizeStats(value.character.startingStats)
  };
  const loadout = record(value.loadout);
  const inventory = record(value.inventory);
  const party = record(value.party);
  const campaignRaw = record(value.campaign);
  const settlement = normalizeSettlement(campaignRaw.settlement);
  let active = boolean(campaignRaw.active);
  let state = active ? normalizeRunState(campaignRaw.state) : (isRecord(campaignRaw.state) ? normalizeRunState(campaignRaw.state) : null);
  // An active campaign with no coherent run state cannot be resumed. Clearing only the
  // active flag prevents the Tavern <-> Campaign route loop while preserving the Vessel.
  if (active && !state) active = false;
  if (settlement) active = false;
  return {
    ...value,
    character,
    loadout: {
      ...loadout,
      keptImpressions: stringList(loadout.keptImpressions),
      keptImpressionChoices: record(loadout.keptImpressionChoices),
      equipment: record(loadout.equipment),
      consumables: stringList(loadout.consumables),
      borrowedItem: isRecord(loadout.borrowedItem) ? loadout.borrowedItem : null
    },
    inventory: {
      ...inventory,
      equipment: record(inventory.equipment),
      consumables: record(inventory.consumables)
    },
    party: { ...party, tavernAdventurerIds: stringList(party.tavernAdventurerIds) },
    campaign: {
      ...campaignRaw,
      active,
      state: active ? state : (settlement ? state : (campaignRaw.active ? null : state)),
      settlement,
      lastCompletedAt: typeof campaignRaw.lastCompletedAt === 'string' ? campaignRaw.lastCompletedAt : null
    },
    tavern: { ...record(value.tavern), lastRoom: typeof value.tavern?.lastRoom === 'string' ? value.tavern.lastRoom : 'main-hall' },
    tavernServices: record(value.tavernServices),
    lender: { ...record(value.lender), collection: stringList(value.lender?.collection), selectedItemId: typeof value.lender?.selectedItemId === 'string' ? value.lender.selectedItemId : null },
    history: {
      ...normalizeCampaignHistory(value.history),
      returnedAliveItems: stringList(value.history?.returnedAliveItems)
    }
  };
}


function equivalentIgnoringUpdatedAt(a, b) {
  if (!isRecord(a) || !isRecord(b)) return false;
  const left = { ...a };
  const right = { ...b };
  delete left.updatedAt;
  delete right.updatedAt;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function createFreshAccount() {
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    activeSlot: null,
    unlocks: { races: [], subclasses: [], keptImpressions: [], tavernAdventurers: [], mantleBaseClasses: [] },
    progressionFeatures: { mantle: false, chronicle: false },
    chronicle: { families: {}, classless: { rank: 0, progress: 0 } },
    currencies: { onyx: 0 },
    history: { settledCampaignIds: [] },
    records: { bossesDefeated: 0, minibossesDefeated: 0, trainersEncountered: [], trainersFought: [], trainersLearnedFrom: [], notableCombat: {}, forestAccomplishments: { campaignsSettled: 0, highestDepth: 0, battlesWon: 0, successfulChecks: 0, craftedItems: 0, trainerEncounters: 0, ordinaryMaterialsCollected: 0, minibossesDefeated: 0, bossesDefeated: 0, forestsCleared: 0 } },
    settings: { combatSpeed: 1, autoEndTurn: true, reducedMotion: false, combatNumbers: true, screenFlash: 'standard', hiddenCraftingRecipes: [] },
    tutorials: { starter: { resolved: false, resolution: null, rewardGranted: false, raceChoiceGranted: false, resolvedAt: null }, statuses: {}, tokenWallet: { keptImpression3OrLess: 0, raceChoice: 0 }, contextualSeen: [] }
  };
}

export class SaveController {
  constructor(storage = window.localStorage) { this.storage = storage; }

  loadAccount() {
    return normalizeAccountSave(safeParse(this.storage.getItem(ACCOUNT_KEY)));
  }

  ensureAccount() {
    const existing = this.loadAccount();
    if (existing) return existing;
    const account = createFreshAccount();
    this.saveAccount(account);
    return account;
  }

  saveAccount(account) {
    const source = isRecord(account) ? account : createFreshAccount();
    const existing = this.loadAccount();
    const candidate = normalizeAccountSave({ ...source, schemaVersion: SCHEMA_VERSION, updatedAt: existing?.updatedAt || source.updatedAt || nowIso() }) || createFreshAccount();
    if (existing && equivalentIgnoringUpdatedAt(existing, candidate)) return existing;
    const value = normalizeAccountSave({ ...candidate, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() }) || createFreshAccount();
    this.storage.setItem(ACCOUNT_KEY, JSON.stringify(value));
    return value;
  }

  loadSlot(slotNumber) {
    const key = SLOT_KEYS[slotNumber - 1];
    if (!key) throw new RangeError(`Invalid slot number: ${slotNumber}`);
    return normalizeSlotSave(safeParse(this.storage.getItem(key)));
  }

  createSlot(slotNumber, slotState) {
    if (this.loadSlot(slotNumber)) throw new Error(`Vessel slot ${slotNumber} is already bound.`);
    return this.saveSlot(slotNumber, slotState);
  }

  saveSlot(slotNumber, slotState) {
    const key = SLOT_KEYS[slotNumber - 1];
    if (!key) throw new RangeError(`Invalid slot number: ${slotNumber}`);
    if (!isRecord(slotState)) throw new TypeError('Vessel slot state must be an object.');
    const existing = this.loadSlot(slotNumber);
    const candidate = normalizeSlotSave({ ...slotState, schemaVersion: SCHEMA_VERSION, updatedAt: existing?.updatedAt || slotState.updatedAt || nowIso() });
    if (!candidate) throw new Error(`Vessel slot ${slotNumber} could not be normalized.`);
    if (existing && equivalentIgnoringUpdatedAt(existing, candidate)) return existing;
    const value = normalizeSlotSave({ ...candidate, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() });
    if (!value) throw new Error(`Vessel slot ${slotNumber} could not be normalized.`);
    this.storage.setItem(key, JSON.stringify(value));
    return value;
  }

  deleteSlot(slotNumber) {
    const key = SLOT_KEYS[slotNumber - 1];
    if (!key) throw new RangeError(`Invalid slot number: ${slotNumber}`);
    this.storage.removeItem(key);
    const account = this.ensureAccount();
    if (account.activeSlot === slotNumber) {
      account.activeSlot = null;
      this.saveAccount(account);
    }
  }

  listSlots() { return SLOT_KEYS.map((_, index) => this.loadSlot(index + 1)); }

  resetAllTWBTDData() {
    this.storage.removeItem(ACCOUNT_KEY);
    for (const key of SLOT_KEYS) this.storage.removeItem(key);
    return this.ensureAccount();
  }
}
