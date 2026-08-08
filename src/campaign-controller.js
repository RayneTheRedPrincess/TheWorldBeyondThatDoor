import { isClasslessEquipped, getEquippedKeptIds, getKeptImpressionChoices } from './kept-impression-controller.js';
import { CORE_STATS, getStartingStatPool, normalizeStartingStats, totalStartingStats } from './starting-stats.js';
import { createForestExpedition } from './expedition-controller.js';
import { awardExpToCharacter, allocateRunStat, combinedCharacterStats, emptyStats, expToNextLevel } from './character-progression.js';
import { initializeCampaignCraftingInventory } from './crafting-controller.js';
import { forcedTrainerIdsForActiveQuest, settleMaraQuest, lenderCandidatesFromRun, summarizeRunAccomplishments, awardRecruitments, clearMaraQuestAfterCampaign } from './tavern-services-controller.js';
import { setProgressionFeature, PROGRESSION_FEATURES } from './progression-features.js';

const NORMAL_CHRONICLE_PROGRESS_PER_RANK = 100;
const NORMAL_CHRONICLE_MAX_RANK = 30;
const CLASSLESS_PROGRESS_PER_RANK = 50;
const CLASSLESS_MAX_RANK = 12;
const STAT_POINTS_PER_CHARACTER_LEVEL = 3;

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function nowIso() { return new Date().toISOString(); }
function cleanNonNegative(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, n) : 0; }
function makeId(startedAt) { return `campaign-${String(startedAt).replace(/[^0-9]/g, '')}-${Math.random().toString(36).slice(2, 10)}`; }
function emptyCoreStats() { return emptyStats(); }

function initialLevelStatPoints(race, level = 1) {
  const humanOddLevelBonus = race === 'Human' && level % 2 === 1 ? 1 : 0;
  return STAT_POINTS_PER_CHARACTER_LEVEL + humanOddLevelBonus;
}

export function createPartyMetricEntry({ id, name, kind = 'vessel', real = true } = {}) {
  return {
    id: String(id || ''),
    name: String(name || 'Unknown'),
    kind,
    real: Boolean(real),
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0
  };
}

export function canStartCampaign(slot) {
  if (!slot?.character) return { ok: false, reason: 'A bound Vessel is required.' };
  if (slot?.campaign?.settlement) return { ok: false, reason: 'Finish the campaign results first.' };
  if (slot?.campaign?.active) return { ok: false, reason: 'This Vessel already has an active campaign.' };
  const storedPool = Number(slot.character.startingStatPool || 0);
  const pool = Number.isInteger(storedPool) && storedPool > 0 ? storedPool : getStartingStatPool(slot.character.race);
  const total = totalStartingStats(slot.character.startingStats || {});
  if (!Number.isInteger(pool) || pool <= 0 || total !== pool) return { ok: false, reason: 'Allocate the Vessel’s full starting-stat pool before opening the Door.' };
  return { ok: true, reason: '' };
}

export function startCampaign(slot, { account = null, chronicleTrees = null, regionsData = null, forestEvents = null, forestTrainers = null, tavernAdventurers = null, progression = null, equipmentConsumablesStatus = null, forestCrafting = null, expeditionRng = Math.random, now = nowIso() } = {}) {
  const readiness = canStartCampaign(slot);
  if (!readiness.ok) return { ok: false, error: readiness.reason };
  const next = clone(slot);
  const classless = isClasslessEquipped(next);
  const baseClass = next.character.baseClass;
  const subclass = classless ? null : (next.character.subclass || null);
  const chronicleFamily = classless ? 'Classless' : baseClass;
  const startingStats = normalizeStartingStats(next.character.startingStats);
  const playerMetric = createPartyMetricEntry({ id: 'vessel', name: next.character.name, kind: 'vessel', real: true });
  const catalogEntries = Array.isArray(tavernAdventurers?.entries) ? tavernAdventurers.entries : [];
  const catalogById = new Map(catalogEntries.map(entry => [entry.id, entry]));
  const recruited = new Set(account?.unlocks?.tavernAdventurers || []);
  const selectedIds = [...new Set(next.party?.tavernAdventurerIds || [])].filter(id => recruited.has(id)).slice(0, Number(tavernAdventurers?.rules?.maxDeployed || 3));
  const selectedAdventurers = selectedIds.map(id => catalogById.get(id)).filter(Boolean);
  const runId = makeId(now);
  const starter = initializeCampaignCraftingInventory(baseClass, forestCrafting, { borrowedItem: next.loadout?.borrowedItem || null });
  const run = {
    id: runId,
    status: 'active',
    startedAt: now,
    endedAt: null,
    outcome: null,
    character: {
      level: 1,
      exp: 0,
      startingStats,
      levelEarnedStats: emptyCoreStats(),
      unspentLevelStatPoints: initialLevelStatPoints(next.character.race, 1)
    },
    configuration: {
      race: next.character.race,
      permanentBaseClass: baseClass,
      effectiveBaseClass: classless ? null : baseClass,
      effectiveSubclass: subclass,
      classless,
      keptImpressions: getEquippedKeptIds(next),
      keptImpressionChoices: getKeptImpressionChoices(next),
      equipment: clone(starter.initialEquipment || {}),
      consumables: [],
      borrowedItem: clone(next.loadout?.borrowedItem || null),
      classlessSelections: clone(next.classlessConfig || null),
      chronicleFamily,
      chronicleAllocationSnapshot: chronicleTrees ? snapshotChronicleAllocation(account, chronicleTrees, chronicleFamily) : null
    },
    expedition: createForestExpedition({
      runId: runId, regionsData, forestEvents, forestTrainers, activeVesselBaseClass: baseClass,
      partyBaseClasses: [...(classless ? [] : [baseClass]), ...selectedAdventurers.map(entry => entry.baseClass)].filter(Boolean),
      unlockedSubclasses: account?.unlocks?.subclasses || [],
      forcedTrainerIds: forcedTrainerIdsForActiveQuest(next),
      firstForestRun: !Boolean(account?.history?.forestIntroSeen),
      rng: expeditionRng
    }),
    inventory: { equipment: clone(starter.equipment || {}), consumables: clone(next.inventory?.consumables || {}), materials: {} },
    crafting: { crafted: [], equippedHistory: clone(starter.equippedHistory || []), campaignOnlyEquipment: true },
    consumptionLedger: { consumables: {} },
    consumableRules: { baseEquipCapacity: Number(equipmentConsumablesStatus?.rules?.baseConsumableEquipCapacity || 1), usesPerBattle: Number(equipmentConsumablesStatus?.rules?.usesPerBattle || 1), equipLocation: 'campsite-only' },
    party: [playerMetric, ...selectedAdventurers.map(entry => createPartyMetricEntry({ id: entry.id, name: entry.name, kind: 'tavern-adventurer', real: true }))],
    adventurers: Object.fromEntries(selectedAdventurers.map(entry => [entry.id, {
      id: entry.id, name: entry.name, level: 1, exp: 0, startingStats: clone(entry.startingStats || emptyCoreStats()), levelEarnedStats: emptyCoreStats(),
      unspentLevelStatPoints: 0, baseClass: entry.baseClass, subclass: entry.subclass, personality: entry.personality, priority: entry.priority,
      combatRole: entry.combatRole, levelStatWeights: clone(entry.levelStatWeights || {}), keptImpressions: clone(entry.keptImpressions || []), keptImpressionChoices: clone(entry.keptImpressionChoices || {}),
      equipment: clone(initializeCampaignCraftingInventory(entry.baseClass, forestCrafting).initialEquipment || {}), progressionSource: 'tavern-adventurer'
    }])),
    metrics: {
      battlesWon: 0,
      combatsCompleted: 0,
      deaths: 0
    },
    rewards: {
      carriedOnyx: 0,
      chronicleProgress: 0
    }
  };
  // Shared campaign inventory owns every equipped party item instance, while each character keeps an isolated loadout.
  for (const adventurer of Object.values(run.adventurers || {})) {
    for (const itemId of Object.values(adventurer.equipment || {}).filter(Boolean)) {
      const cur = run.inventory.equipment[itemId] || { quantity: 0, source: 'party-starter' };
      cur.quantity = Number(cur.quantity || 0) + 1; cur.source = cur.source || 'party-starter'; run.inventory.equipment[itemId] = cur;
    }
  }
  next.campaign = { active: true, state: run, settlement: null, lastCompletedAt: next.campaign?.lastCompletedAt || null };
  return { ok: true, slot: next, run };
}

function snapshotChronicleAllocation(account, chronicleTrees, familyName) {
  if (familyName === 'Classless') {
    const state = account?.chronicle?.classless || {};
    return { type: 'classless', family: 'Classless', rank: Number(state.rank || 0), progress: Number(state.progress || 0) };
  }
  const family = chronicleTrees?.families?.find(entry => entry.name === familyName);
  if (!family) return null;
  const state = account?.chronicle?.families?.[familyName] || {};
  const valid = new Set(family.nodes.map(node => node.id));
  return {
    type: 'normal',
    family: familyName,
    rank: Number(state.rank || 0),
    purchasedNodes: Array.isArray(state.purchasedNodes) ? state.purchasedNodes.filter(id => valid.has(id)) : []
  };
}


export function setTavernAdventurerParty(slot, adventurerIds, { catalog = null, recruitedIds = null } = {}) {
  if (!slot?.character) return { ok:false, error:'A bound Vessel is required.' };
  if (slot?.campaign?.active || slot?.campaign?.settlement) return { ok:false, error:'Party composition can only change between campaigns.' };
  const ids=[...new Set(Array.isArray(adventurerIds)?adventurerIds:[])];
  const max=Math.max(0,Number(catalog?.rules?.maxDeployed||3)); if(ids.length>max)return {ok:false,error:`No more than ${max} Tavern Adventurers may be deployed.`};
  const known=new Set((catalog?.entries||[]).map(e=>e.id)); for(const id of ids)if(!known.has(id))return {ok:false,error:`Unknown Tavern Adventurer: ${id}`};
  if(Array.isArray(recruitedIds)){const recruited=new Set(recruitedIds);for(const id of ids)if(!recruited.has(id))return {ok:false,error:'Only recruited Tavern Adventurers may be deployed.'};}
  const next=clone(slot); next.party={...(next.party||{}),tavernAdventurerIds:ids}; return {ok:true,slot:next};
}

export function allocatePlayerRunStat(slot, stat, amount = 1) {
  if (!slot?.campaign?.active || !slot.campaign.state?.character) return {ok:false,error:'No active campaign.'};
  const next=clone(slot); const result=allocateRunStat(next.campaign.state.character,stat,amount); if(!result.ok)return result;
  return {ok:true,slot:next,character:clone(next.campaign.state.character)};
}

export function awardCharacterExp(slot, amount, progression, { rng = Math.random } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state) return {ok:false,error:'No active campaign.'};
  const next=clone(slot); const run=next.campaign.state; const combat=run.combat;
  const livingIds=new Set((combat?.actors||[]).filter(a=>a.real&&a.side==='party'&&Number(a.resources?.hp||0)>0).map(a=>a.id));
  if(!combat){for(const member of run.party||[])if(member.real!==false)livingIds.add(member.id);}
  const awards=[];
  if(livingIds.has('vessel')) awards.push({id:'vessel',...awardExpToCharacter(run.character,amount,progression,{isPlayer:true,race:run.configuration?.race,rng})});
  for(const [id,state] of Object.entries(run.adventurers||{})) if(livingIds.has(id)) awards.push({id,...awardExpToCharacter(state,amount,progression,{isPlayer:false,weights:state.levelStatWeights,rng})});
  run.lastExperienceAward={amount:Number(amount||0),livingIds:[...livingIds],awards:clone(awards),at:nowIso()};
  return {ok:true,slot:next,awards};
}

export function getRunProgressionView(run, progression) {
  if(!run?.character)return null; return { level:run.character.level, exp:run.character.exp, expToNext:expToNextLevel(run.character,progression), stats:combinedCharacterStats(run.character), adventurers:clone(run.adventurers||{}) };
}

export function addCampaignPartyMember(slot, member) {
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign.' };
  const next = clone(slot);
  const entry = createPartyMetricEntry(member);
  if (!entry.id) return { ok: false, error: 'Party member id is required.' };
  if (next.campaign.state.party.some(item => item.id === entry.id)) return { ok: false, error: 'That party member is already tracked.' };
  next.campaign.state.party.push(entry);
  return { ok: true, slot: next };
}

export function recordCampaignPerformance(slot, participantId, metric, amount) {
  const allowed = new Set(['damageDealt','damageTaken','healingDone']);
  if (!allowed.has(metric)) return { ok: false, error: 'Unknown campaign performance metric.' };
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign.' };
  const next = clone(slot);
  const member = next.campaign.state.party.find(item => item.id === participantId);
  if (!member) return { ok: false, error: 'Unknown campaign participant.' };
  member[metric] = cleanNonNegative(member[metric]) + cleanNonNegative(amount);
  return { ok: true, slot: next };
}

export function addCampaignOnyx(slot, amount) {
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign.' };
  const next = clone(slot);
  next.campaign.state.rewards.carriedOnyx = cleanNonNegative(next.campaign.state.rewards.carriedOnyx) + cleanNonNegative(amount);
  return { ok: true, slot: next };
}

export function addCampaignChronicleProgress(slot, amount) {
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign.' };
  const next = clone(slot);
  next.campaign.state.rewards.chronicleProgress = cleanNonNegative(next.campaign.state.rewards.chronicleProgress) + cleanNonNegative(amount);
  return { ok: true, slot: next };
}

function projectNormalChronicle(account, familyName, earnedProgress) {
  const raw = account?.chronicle?.families?.[familyName] || {};
  const rankBefore = Math.max(0, Math.min(NORMAL_CHRONICLE_MAX_RANK, Math.trunc(Number(raw.rank || 0))));
  const progressBefore = Math.max(0, Number(raw.progress || 0));
  if (rankBefore >= NORMAL_CHRONICLE_MAX_RANK) return { family: familyName, rankBefore, rankAfter: rankBefore, progressBefore: 0, progressAfter: 0, rankGain: 0, chroniclePointsEarned: 0 };
  const total = progressBefore + cleanNonNegative(earnedProgress);
  const possibleRanks = Math.floor(total / NORMAL_CHRONICLE_PROGRESS_PER_RANK);
  const rankGain = Math.min(NORMAL_CHRONICLE_MAX_RANK - rankBefore, possibleRanks);
  const rankAfter = rankBefore + rankGain;
  const progressAfter = rankAfter >= NORMAL_CHRONICLE_MAX_RANK ? 0 : total - rankGain * NORMAL_CHRONICLE_PROGRESS_PER_RANK;
  return { family: familyName, rankBefore, rankAfter, progressBefore, progressAfter, rankGain, chroniclePointsEarned: rankGain };
}

function projectClasslessChronicle(account, earnedProgress) {
  const raw = account?.chronicle?.classless || {};
  const rankBefore = Math.max(0, Math.min(CLASSLESS_MAX_RANK, Math.trunc(Number(raw.rank || 0))));
  const progressBefore = Math.max(0, Number(raw.progress || 0));
  if (rankBefore >= CLASSLESS_MAX_RANK) return { family: 'Classless', rankBefore, rankAfter: rankBefore, progressBefore: 0, progressAfter: 0, rankGain: 0, chroniclePointsEarned: 0 };
  const total = progressBefore + cleanNonNegative(earnedProgress);
  const possibleRanks = Math.floor(total / CLASSLESS_PROGRESS_PER_RANK);
  const rankGain = Math.min(CLASSLESS_MAX_RANK - rankBefore, possibleRanks);
  const rankAfter = rankBefore + rankGain;
  const progressAfter = rankAfter >= CLASSLESS_MAX_RANK ? 0 : total - rankGain * CLASSLESS_PROGRESS_PER_RANK;
  return { family: 'Classless', rankBefore, rankAfter, progressBefore, progressAfter, rankGain, chroniclePointsEarned: 0 };
}

export function projectChronicleReward(account, familyName, earnedProgress) {
  return familyName === 'Classless'
    ? projectClasslessChronicle(account, earnedProgress)
    : projectNormalChronicle(account, familyName, earnedProgress);
}

function topPerformance(party, metric) {
  const realParty = (party || []).filter(member => member.real !== false);
  if (!realParty.length) return { names: [], value: 0 };
  const value = Math.max(...realParty.map(member => cleanNonNegative(member[metric])));
  return { names: realParty.filter(member => cleanNonNegative(member[metric]) === value).map(member => member.name), value };
}

export function endCampaign(slot, account, outcome, { now = nowIso() } = {}) {
  if (!['victory','defeat','return'].includes(outcome)) return { ok: false, error: 'Campaign outcome must be victory, successful return, or defeat.' };
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign to finish.' };
  if (slot.campaign.settlement) return { ok: false, error: 'Campaign results are already awaiting settlement.' };
  const next = clone(slot);
  const run = next.campaign.state;
  run.status = 'completed';
  run.endedAt = now;
  run.outcome = outcome;
  const baseCarriedOnyx = Math.round(cleanNonNegative(run.rewards?.carriedOnyx));
  const successfulReturn = outcome === 'victory' || outcome === 'return';
  const maraQuest = settleMaraQuest(next, run);
  const questOnyx = maraQuest?.complete ? Math.round(cleanNonNegative(maraQuest.reward?.onyx)) : 0;
  const questChronicle = maraQuest?.complete ? Math.round(cleanNonNegative(maraQuest.reward?.chronicleProgress)) : 0;
  const carriedOnyx = baseCarriedOnyx + questOnyx;
  const bankedOnyx = successfulReturn ? carriedOnyx : Math.round(carriedOnyx * 0.5);
  const progressEarned = Math.round(cleanNonNegative(run.rewards?.chronicleProgress)) + questChronicle;
  const chronicle = projectChronicleReward(account, run.configuration.chronicleFamily, progressEarned);
  const settlement = {
    id: run.id,
    createdAt: now,
    outcome,
    startedAt: run.startedAt,
    endedAt: now,
    vesselName: next.character.name,
    finalCharacterLevel: run.character.level,
    performance: {
      mostDamageDealt: topPerformance(run.party, 'damageDealt'),
      mostDamageTaken: topPerformance(run.party, 'damageTaken'),
      mostHealingDone: topPerformance(run.party, 'healingDone')
    },
    onyx: { carried: carriedOnyx, baseCarried: baseCarriedOnyx, maraQuestOnyx: questOnyx, banked: bankedOnyx, rule: successfulReturn ? 'All carried Onyx banked' : 'Half carried Onyx banked' },
    chronicle: { progressEarned, ...chronicle },
    party: clone(run.party),
    metrics: clone(run.metrics),
    maraQuest: maraQuest ? clone(maraQuest) : null,
    lender: { candidates: successfulReturn ? lenderCandidatesFromRun(run) : [], selectedItemId: null },
    accomplishments: summarizeRunAccomplishments(run)
  };
  next.campaign.active = false;
  next.campaign.settlement = settlement;
  return { ok: true, slot: next, settlement };
}

function applyProjectedChronicle(account, settlement) {
  const next = account;
  const reward = settlement.chronicle;
  next.chronicle = next.chronicle || { families: {}, classless: { rank: 0, progress: 0 } };
  if (reward.family === 'Classless') {
    const prior = next.chronicle.classless || {};
    next.chronicle.classless = { ...prior, rank: reward.rankAfter, progress: reward.progressAfter };
  } else {
    next.chronicle.families = next.chronicle.families || {};
    const prior = next.chronicle.families[reward.family] || {};
    next.chronicle.families[reward.family] = {
      ...prior,
      rank: reward.rankAfter,
      progress: reward.progressAfter,
      purchasedNodes: Array.isArray(prior.purchasedNodes) ? prior.purchasedNodes : []
    };
  }
  return next;
}

export function applyCampaignSettlement(slot, account, { tavernServices = null } = {}) {
  const settlement = slot?.campaign?.settlement;
  if (!settlement) return { ok: false, error: 'No campaign results are awaiting settlement.' };
  if ((settlement.outcome === 'victory' || settlement.outcome === 'return') && (settlement.lender?.candidates||[]).length && !settlement.lender?.selectedItemId) return { ok:false, error:'Choose one returned item for Mara’s lender collection before finishing the results.' };
  let nextAccount = clone(account);
  nextAccount.currencies = { ...(nextAccount.currencies || {}), onyx: cleanNonNegative(nextAccount.currencies?.onyx) };
  nextAccount.history = nextAccount.history || {};
  nextAccount.history.settledCampaignIds = Array.isArray(nextAccount.history.settledCampaignIds) ? [...new Set(nextAccount.history.settledCampaignIds)] : [];
  const alreadyApplied = nextAccount.history.settledCampaignIds.includes(settlement.id);
  if (!alreadyApplied) {
    nextAccount.currencies.onyx += settlement.onyx.banked;
    applyProjectedChronicle(nextAccount, settlement);
    nextAccount.history.settledCampaignIds.push(settlement.id);
    const accomplishments=settlement.accomplishments||{};
    nextAccount.history.forestCleared = Boolean(nextAccount.history.forestCleared || accomplishments.forestCleared);
    if (accomplishments.forestCleared && !nextAccount.history.firstForestClearAt) nextAccount.history.firstForestClearAt = settlement.endedAt;
    nextAccount.records=nextAccount.records||{};
    nextAccount.records.bossesDefeated=Number(nextAccount.records.bossesDefeated||0)+(accomplishments.bossDefeated?1:0);
    nextAccount.records.minibossesDefeated=Number(nextAccount.records.minibossesDefeated||0)+(accomplishments.minibossDefeated?1:0);
    nextAccount.records.trainersEncountered=[...new Set([...(nextAccount.records.trainersEncountered||[]),...(accomplishments.shownTrainerIds||[])])];
    const decisions=accomplishments.trainerDecisions||{}; nextAccount.records.trainersFought=[...new Set([...(nextAccount.records.trainersFought||[]),...Object.keys(decisions).filter(id=>decisions[id]==='fight')])];
    nextAccount.records.trainersLearnedFrom=[...new Set([...(nextAccount.records.trainersLearnedFrom||[]),...Object.keys(decisions).filter(id=>decisions[id]==='learn')])];
    const perf=settlement.performance||{}; nextAccount.records.notableCombat=nextAccount.records.notableCombat||{};
    for(const [key,val] of Object.entries(perf)){const old=nextAccount.records.notableCombat[key];if(!old||Number(val?.value||0)>Number(old?.value||0))nextAccount.records.notableCombat[key]=clone(val);}
    const rec=awardRecruitments(nextAccount,accomplishments,tavernServices||{tavernAdventurerRecruitment:{remaining:[]}}); nextAccount=rec.account; nextAccount.history.lastRecruitmentUnlocks=rec.newIds;
    if((settlement.outcome==='victory'||settlement.outcome==='return')&&accomplishments.forestCleared){nextAccount=setProgressionFeature(nextAccount,PROGRESSION_FEATURES.CHRONICLE,true);}
  }

  const nextSlot = clone(slot);
  nextSlot.inventory = nextSlot.inventory || { equipment:{}, consumables:{} };
  // I13: there is no permanent equipment inventory. Run-crafted/starter gear disappears at settlement; Mara's lender uses eligibility history instead.
  nextSlot.inventory.equipment = {};
  nextSlot.loadout = nextSlot.loadout || {};
  nextSlot.loadout.equipment = {};
  nextSlot.inventory.consumables = nextSlot.inventory.consumables || {};
  const runStateForSettlement = slot?.campaign?.state || {};
  const consumed = runStateForSettlement?.consumptionLedger?.consumables || {};
  if ((settlement.outcome === 'victory' || settlement.outcome === 'return') && runStateForSettlement.inventory?.consumables) {
    // Returning alive preserves all unused carried/crafted consumables.
    nextSlot.inventory.consumables = clone(runStateForSettlement.inventory.consumables);
  } else {
    for (const [itemId, quantity] of Object.entries(consumed)) {
      const current = cleanNonNegative(nextSlot.inventory.consumables?.[itemId]?.quantity);
      const remaining = Math.max(0, current - cleanNonNegative(quantity));
      if (nextSlot.inventory.consumables[itemId]) nextSlot.inventory.consumables[itemId].quantity = remaining;
    }
  }
  nextSlot.history = nextSlot.history || {};
  nextSlot.lender=nextSlot.lender||{collection:[],selectedItemId:null}; nextSlot.lender.collection=Array.isArray(nextSlot.lender.collection)?nextSlot.lender.collection:[];
  if((settlement.outcome==='victory'||settlement.outcome==='return')&&settlement.lender?.selectedItemId)nextSlot.lender.collection=[...new Set([...nextSlot.lender.collection,settlement.lender.selectedItemId])];
  nextSlot.history.returnedAliveItems=[...nextSlot.lender.collection];
  nextSlot.history.campaigns = Array.isArray(nextSlot.history.campaigns) ? nextSlot.history.campaigns : [];
  if (!nextSlot.history.campaigns.some(entry => entry.id === settlement.id)) {
    nextSlot.history.campaigns.push({
      id: settlement.id,
      outcome: settlement.outcome,
      startedAt: settlement.startedAt,
      endedAt: settlement.endedAt,
      onyxBanked: settlement.onyx.banked,
      chronicleFamily: settlement.chronicle.family,
      chronicleProgress: settlement.chronicle.progressEarned,
      rankBefore: settlement.chronicle.rankBefore,
      rankAfter: settlement.chronicle.rankAfter,
      finalCharacterLevel: settlement.finalCharacterLevel,
      performance: clone(settlement.performance),
      highestDepth: Number(settlement.accomplishments?.highestDepth||0),
      maraQuest: clone(settlement.maraQuest||null),
      lenderRegisteredItemId: settlement.lender?.selectedItemId||null
    });
  }
  const cleared=clearMaraQuestAfterCampaign(nextSlot);
  Object.assign(nextSlot,cleared);
  nextSlot.campaign = { active: false, state: null, settlement: null, lastCompletedAt: settlement.endedAt };
  nextSlot.tavern = { ...(nextSlot.tavern || {}), lastRoom: 'main-hall' };
  return { ok: true, account: nextAccount, slot: nextSlot, alreadyApplied, newRecruitIds: alreadyApplied ? [] : [...(nextAccount.history?.lastRecruitmentUnlocks||[])] };
}

export function getCampaignRunView(slot) {
  return slot?.campaign?.active && slot.campaign.state ? clone(slot.campaign.state) : null;
}
