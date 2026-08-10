import { planForestTrainerRoster, createForestEventCards } from './forest-event-deck.js';
import { planBogTrainerRoster, createBogEventCards } from './bog-event-deck.js';
import { keptVictoryRecovery } from './kept-impression-runtime.js';
const FOREST_ID = 'forest';
const BOG_ID = 'bog-of-lost-souls';
const CHECKMARK_OUTCOMES = new Set(['success', 'failure']);
const COMBAT_SOURCES = new Set(['event-card', 'checkmark-followup', 'boss', 'miniboss']);

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function randomIndex(length, rng) {
  if (length <= 0) return 0;
  const raw = Number(rng());
  const value = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
  return Math.floor(value * length);
}

function compactRandomToken(rng) {
  const raw = Number(rng());
  const value = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
  return Math.floor(value * 0xFFFFFF).toString(36).padStart(5, '0');
}

function getRegion(regionsData, id = FOREST_ID) {
  return regionsData?.regions?.find(region => region.id === id) || null;
}

function eligibleKinds(region, depth) {
  return (region.eventKinds || []).filter(kind => {
    if (!kind.trainer) return true;
    return depth >= Number(region.trainerEligibility?.start || 3)
      && depth <= Number(region.trainerEligibility?.end || 29);
  });
}

function cardDescription(kind) {
  if (kind.id === 'combat') return 'A direct battle lies beyond this route.';
  if (kind.id === 'trainer') return 'A regional trainer encounter waits on this route.';
  if (kind.id === 'landmark') return 'A landmark interrupts the route through the region.';
  if (kind.id === 'helpful-person') return 'Someone in the region may offer aid or an opportunity.';
  if (kind.id === 'discovery') return 'Something worth investigating has been found.';
  return 'A noncombat event waits beyond this route.';
}

function createLegacyEventCards({ runId, region, depth, rng = Math.random } = {}) {
  if (!region) throw new Error('A region definition is required.');
  const count = Number(region.cardsPerStep || 3);
  const pool = eligibleKinds(region, depth).map(kind => ({ ...kind }));
  const cards = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    if (!pool.length) break;
    const index = randomIndex(pool.length, rng);
    const kind = pool[index];
    cards.push({
      id: `${runId}-d${depth}-c${ordinal + 1}-${compactRandomToken(rng)}`,
      ordinal: ordinal + 1,
      depth,
      kind: kind.id,
      label: kind.label,
      combat: Boolean(kind.combat),
      noncombat: Boolean(kind.noncombat),
      trainer: Boolean(kind.trainer),
      description: cardDescription(kind)
    });
  }
  if (cards.length !== count) throw new Error(`Region ${region.id} cannot supply exactly ${count} event cards.`);
  return cards;
}

export function createEventCards({ runId, region, depth, rng = Math.random, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, expedition = null } = {}) {
  if (region?.id === BOG_ID && bogEvents?.events && expedition) return createBogEventCards({ runId, depth, bogEvents, bogTrainers, expedition, rng });
  if (region?.id === FOREST_ID && forestEvents?.events && expedition) return createForestEventCards({ runId, depth, forestEvents, forestTrainers, expedition, rng });
  return createLegacyEventCards({ runId, region, depth, rng });
}

export function createForestExpedition({ runId, regionsData, forestEvents = null, forestTrainers = null, activeVesselBaseClass = null, partyBaseClasses = [], unlockedSubclasses = [], forcedTrainerIds = [], firstForestRun = false, rng = Math.random } = {}) {
  const region = getRegion(regionsData, FOREST_ID);
  if (!region) throw new Error('Forest region definition is missing.');
  const depth = 1;
  const trainerPlan = forestTrainers?.entries ? planForestTrainerRoster({ forestTrainers, activeVesselBaseClass, partyBaseClasses, unlockedSubclasses, forcedTrainerIds, rng }) : null;
  const expedition = {
    regionId: region.id,
    regionName: region.name,
    depth,
    maxDepth: Number(region.depthCount || 30),
    introductoryBand: clone(region.introductoryBand || { start: 1, end: 5 }),
    cardsPerStep: Number(region.cardsPerStep || 3),
    state: 'choosing-event',
    step: 1,
    cards: [],
    selectedCardId: null,
    encounter: null,
    campsite: null,
    history: [],
    usedEventIds: [],
    shownTrainerIds: [],
    trainerPlan: trainerPlan ? clone(trainerPlan) : null,
    firstEverIntro: Boolean(firstForestRun),
    completionReward: clone(region.completionReward || { onyx: 100, chronicleProgress: 4 }),
    nextRegion: clone(region.nextRegion || { id: 'bog-of-lost-souls', name: 'Bog of Lost Souls', expectedEntryLevel: [5, 6], targetEndLevel: 12 })
  };
  const draw = createEventCards({ runId, region, depth, rng, forestEvents, forestTrainers, expedition });
  expedition.cards = Array.isArray(draw) ? draw : draw.cards;
  if (!Array.isArray(draw)) { expedition.usedEventIds = draw.usedEventIds; expedition.shownTrainerIds = draw.shownTrainerIds; }
  return expedition;
}

export function createBogExpedition({ runId, regionsData, bogEvents = null, bogTrainers = null, activeVesselBaseClass = null, partyBaseClasses = [], unlockedSubclasses = [], forcedTrainerIds = [], rng = Math.random } = {}) {
  const region=getRegion(regionsData,BOG_ID);if(!region)throw new Error('Bog of Lost Souls region definition is missing.');
  const depth=1,trainerPlan=bogTrainers?.entries?planBogTrainerRoster({bogTrainers,activeVesselBaseClass,partyBaseClasses,unlockedSubclasses,forcedTrainerIds,rng}):null;
  const expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:trainerPlan?clone(trainerPlan):null,fogPressure:Math.max(0,Number(region.regionalMechanic?.starting||0)),regionalMechanic:clone(region.regionalMechanic||{}),completionReward:clone(region.completionReward||{onyx:500,chronicleProgress:20}),nextRegion:clone(region.nextRegion||null)};
  const draw=createEventCards({runId,region,depth,rng,bogEvents,bogTrainers,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw)){expedition.usedEventIds=draw.usedEventIds;expedition.shownTrainerIds=draw.shownTrainerIds;}return expedition;
}

export function enterBogRegion(slot,{regionsData,bogEvents=null,bogTrainers=null,unlockedSubclasses=[],forcedTrainerIds=[],rng=Math.random,now=new Date().toISOString()}={}){
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==BOG_ID)return{ok:false,error:'The campaign is not waiting to enter the Bog of Lost Souls.'};
  const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[FOREST_ID]={highestDepth:Number(old?.depth||0),history:clone(old?.history||[]),shownTrainerIds:clone(old?.shownTrainerIds||[]),trainerDecisions:clone(nextRun.trainerDecisions||{}),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:Number(nextRun.crafting?.crafted?.length||0),materialsSnapshot:clone(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.forestCleared)};
  const partyClasses=[nextRun.configuration?.permanentBaseClass,...Object.values(nextRun.adventurers||{}).map(a=>a.baseClass)].filter(Boolean);nextRun.expedition=createBogExpedition({runId:nextRun.id,regionsData,bogEvents,bogTrainers,activeVesselBaseClass:nextRun.configuration?.permanentBaseClass||null,partyBaseClasses:partyClasses,unlockedSubclasses,forcedTrainerIds,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[BOG_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:Number(nextRun.crafting?.crafted?.length||0),materials:clone(nextRun.inventory?.materials||{})};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}

export function getExpeditionView(slot) {
  return slot?.campaign?.active && slot.campaign.state?.expedition
    ? clone(slot.campaign.state.expedition)
    : null;
}

function activeRun(slot) {
  return slot?.campaign?.active && slot.campaign.state ? slot.campaign.state : null;
}

function makeEncounter(run, card, { source = 'event-card', rng = Math.random, kind = null, boss = false, miniboss = false } = {}) {
  const encounterKind = kind || card?.kind || 'combat';
  return {
    id: `${run.id}-enc-d${run.expedition.depth}-${compactRandomToken(rng)}`,
    depth: run.expedition.depth,
    source,
    cardId: card?.id || null,
    eventId: card?.eventId || null,
    trainerId: card?.trainerId || null,
    eventPayload: card?.eventPayload ? clone(card.eventPayload) : null,
    combatProfile: card?.combatProfile || null,
    faction: card?.faction || null,
    fogTouched: Boolean(card?.fogTouched),
    majorHaunting: Boolean(card?.majorHaunting),
    fogOnFailure: Number(card?.fogOnFailure || 0),
    kind: encounterKind,
    combat: encounterKind === 'combat' || source === 'checkmark-followup' || boss || miniboss,
    noncombat: !(encounterKind === 'combat' || source === 'checkmark-followup' || boss || miniboss),
    boss: Boolean(boss),
    miniboss: Boolean(miniboss),
    state: 'pending',
    resolution: null
  };
}

export function selectExpeditionCard(slot, cardId, { rng = Math.random } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'choosing-event') return { ok: false, error: 'An expedition path is already in progress.' };
  const card = run.expedition.cards?.find(entry => entry.id === cardId);
  if (!card) return { ok: false, error: 'That event card is not available.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  nextRun.expedition.selectedCardId = card.id;
  nextRun.expedition.encounter = makeEncounter(nextRun, card, { source: 'event-card', rng });
  nextRun.expedition.state = card.combat ? 'combat-pending' : 'noncombat-pending';
  return { ok: true, slot: next, encounter: clone(nextRun.expedition.encounter) };
}

function archiveEncounter(expedition, encounter) {
  expedition.history = Array.isArray(expedition.history) ? expedition.history : [];
  if (!expedition.history.some(entry => entry.id === encounter.id)) expedition.history.push(clone(encounter));
}

export function resolveNoncombatCheckmark(slot, outcome, { rng = Math.random, details = null } = {}) {
  if (!CHECKMARK_OUTCOMES.has(outcome)) return { ok: false, error: 'Checkmark outcome must be success or failure.' };
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'noncombat-pending' || !run.expedition.encounter?.noncombat) return { ok: false, error: 'No noncombat event is awaiting resolution.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const resolved = nextRun.expedition.encounter;
  resolved.state = 'resolved';
  resolved.resolution = { type: 'checkmark', outcome, details: details ? clone(details) : null };
  archiveEncounter(nextRun.expedition, resolved);
  const followup = makeEncounter(nextRun, null, { source: 'checkmark-followup', kind: 'combat', rng });
  followup.triggeredByEncounterId = resolved.id;
  followup.triggeredByOutcome = outcome;
  followup.triggeredByDetails = details ? clone(details) : null;
  nextRun.expedition.encounter = followup;
  nextRun.expedition.state = 'combat-pending';
  return { ok: true, slot: next, encounter: clone(followup) };
}

export function resolveNoncombatWithoutCheckmark(slot, { note = null, details = null } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'noncombat-pending' || !run.expedition.encounter?.noncombat) return { ok: false, error: 'No noncombat event is awaiting resolution.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const resolved = nextRun.expedition.encounter;
  resolved.state = 'resolved';
  resolved.resolution = { type: 'no-checkmark', note: note ? String(note) : null, details: details ? clone(details) : null };
  archiveEncounter(nextRun.expedition, resolved);
  nextRun.expedition.encounter = null;
  nextRun.expedition.state = 'awaiting-next-step';
  return { ok: true, slot: next };
}

export function continueAfterForestEventResult(slot){
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='event-result'||!run.expedition?.pendingPostEventCombat)return{ok:false,error:'No Forest event result is awaiting combat.'};
  const next=clone(slot),ex=next.campaign.state.expedition;ex.encounter=clone(ex.pendingPostEventCombat);ex.pendingPostEventCombat=null;ex.state='combat-pending';return{ok:true,slot:next,encounter:clone(ex.encounter)};
}

export function attachSpecialCombat(slot, { boss = false, miniboss = false, rng = Math.random } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.encounter) return { ok: false, error: 'An encounter is already active.' };
  const source = boss ? 'boss' : miniboss ? 'miniboss' : 'event-card';
  if (!COMBAT_SOURCES.has(source)) return { ok: false, error: 'Unknown combat source.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  nextRun.expedition.encounter = makeEncounter(nextRun, null, { source, kind: 'combat', boss, miniboss, rng });
  nextRun.expedition.state = 'combat-pending';
  return { ok: true, slot: next, encounter: clone(nextRun.expedition.encounter) };
}

export const EXHAUSTION_RULES = Object.freeze({ Relaxed:{cap:3,removeAtCampsite:3}, Normal:{cap:3,removeAtCampsite:2}, Hard:{cap:3,removeAtCampsite:2}, Mean:{cap:5,removeAtCampsite:1} });
function exhaustionRule(difficulty){return EXHAUSTION_RULES[difficulty]||EXHAUSTION_RULES.Normal;}
function postBattlePartyRecovery(run, combat){
  const recovered=[]; if(!combat)return recovered; const cap=exhaustionRule(run.configuration?.difficulty||'Normal').cap;
  for(const actor of combat.actors||[]){
    if(actor.side!=='party'||!actor.real)continue;
    const state=actor.id==='vessel'?run.character:run.adventurers?.[actor.id]; if(!state)continue;
    const maxHp=Math.max(1,Number(actor.resources?.maxHp||1)); const defeated=Number(actor.resources?.hp||0)<=0;
    state.currentHp=defeated?Math.max(1,Math.round(maxHp*.10)):Math.max(0,Number(actor.resources?.hp||0));
    state.exhaustion=Math.min(cap,Math.max(0,Math.trunc(Number(state.exhaustion||0)))+(defeated?1:0));
    if(defeated)recovered.push({id:actor.id,hp:state.currentHp,maxHp,exhaustionAdded:1});
  }
  return recovered;
}
function removeCampsiteExhaustion(run){
  const remove=exhaustionRule(run.configuration?.difficulty||'Normal').removeAtCampsite; const changed=[];
  for(const [id,state] of [['vessel',run.character],...Object.entries(run.adventurers||{})]){if(!state)continue;const before=Math.max(0,Math.trunc(Number(state.exhaustion||0)));state.exhaustion=Math.max(0,before-remove);if(before!==state.exhaustion)changed.push({id,before,after:state.exhaustion,removed:before-state.exhaustion});}
  return {remove,changed};
}

export function resolveCombatVictory(slot, { now = new Date().toISOString() } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'combat-pending' || !run.expedition.encounter?.combat) return { ok: false, error: 'No combat encounter is awaiting victory resolution.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const resolved = nextRun.expedition.encounter;
  if (resolved.state === 'resolved') return { ok: false, error: 'That combat is already resolved.' };
  if (nextRun.combat) {
    if (nextRun.combat.encounterId !== resolved.id) return { ok: false, error: 'The attached combat does not belong to this encounter.' };
    if (nextRun.combat.state !== 'complete' || nextRun.combat.outcome !== 'victory') return { ok: false, error: 'The attached combat must reach victory before the expedition can resolve it.' };
  }
  keptVictoryRecovery(nextRun, nextRun.combat);
  const defeatRecovery = postBattlePartyRecovery(nextRun, nextRun.combat);
  if(nextRun.expedition?.regionId===BOG_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={});const bog=metrics.bog||(metrics.bog={negativeStatusesApplied:0,poisonStatusesApplied:0,negativeEffectsSuffered:0,negativeEffectsExpired:0,enemiesDefeatedWithTwoStatuses:0,enemiesDefeatedWithThreeStatuses:0,undeadSpiritsDefeated:0,lesserWitchesDefeated:0,banditCampsDefeated:0});const cm=nextRun.combat.metrics||{};for(const key of ['negativeStatusesApplied','poisonStatusesApplied','negativeEffectsSuffered','negativeEffectsExpired'])bog[key]=Number(bog[key]||0)+Number(cm[key]||0);for(const actor of nextRun.combat.actors||[]){if(actor.side!=='enemy'||actor.real===false||Number(actor.resources?.hp||0)>0)continue;const negatives=(actor.effects||[]).filter(e=>e.negative).length;if(negatives>=2)bog.enemiesDefeatedWithTwoStatuses+=1;if(negatives>=3)bog.enemiesDefeatedWithThreeStatuses+=1;}const undead=new Set(['drowned-infantry','gravebound-pikeman','wailing-shade','ectoplasmic-knight','soulmire-leech']);const witches=new Set(['fen-hexer','corpse-lantern-witch']);for(const e of resolved.enemyRoster||[]){const id=String(e.templateId||'').replace(/^trainer:/,'');if(undead.has(id))bog.undeadSpiritsDefeated+=1;if(witches.has(id))bog.lesserWitchesDefeated+=1;}if(resolved.combatProfile==='bandit-camp')bog.banditCampsDefeated+=1;}
  let forestClearedNow = false;
  let bogClearedNow = false;
  let regionClearedNow = false;
  let completionReward = null;
  if (resolved.boss) {
    const regionId=nextRun.expedition?.regionId;
    nextRun.regionalProgress = nextRun.regionalProgress || {};
    const key=regionId===FOREST_ID?'forest':regionId===BOG_ID?'bog':null;
    if(key&&!nextRun.regionalProgress[`${key}CompletionRewardApplied`]){
      const fallback=regionId===FOREST_ID?{onyx:100,chronicleProgress:4}:{onyx:500,chronicleProgress:20};
      const reward=nextRun.expedition.completionReward||fallback,onyx=Math.max(0,Math.round(Number(reward.onyx||0))),chronicleProgress=Math.max(0,Math.round(Number(reward.chronicleProgress||0)));
      nextRun.rewards=nextRun.rewards||{carriedOnyx:0,chronicleProgress:0};nextRun.rewards.carriedOnyx=Number(nextRun.rewards.carriedOnyx||0)+onyx;nextRun.rewards.chronicleProgress=Number(nextRun.rewards.chronicleProgress||0)+chronicleProgress;
      nextRun.regionalProgress[`${key}CompletionRewardApplied`]=true;nextRun.regionalProgress[`${key}Cleared`]=true;nextRun.regionalProgress[`${key}ClearedAt`]=now;nextRun.regionalProgress[`${key}CompletionReward`]={onyx,chronicleProgress};completionReward={onyx,chronicleProgress};regionClearedNow=true;forestClearedNow=key==='forest';bogClearedNow=key==='bog';
    }
  }
  if(resolved.majorHaunting&&nextRun.expedition?.regionId===BOG_ID)nextRun.expedition.fogPressure=Math.max(0,Number(nextRun.expedition.fogPressure||0)-1);
  resolved.state = 'resolved';
  resolved.resolution = { type: 'victory', at: now, ...(completionReward ? { regionCompletionReward: clone(completionReward), ...(nextRun.expedition?.regionId===FOREST_ID?{forestCompletionReward:clone(completionReward)}:{bogCompletionReward:clone(completionReward)}) } : {}) };
  archiveEncounter(nextRun.expedition, resolved);
  nextRun.metrics = nextRun.metrics || {};
  nextRun.metrics.battlesWon = Number(nextRun.metrics.battlesWon || 0) + 1;
  nextRun.metrics.combatsCompleted = Number(nextRun.metrics.combatsCompleted || 0) + 1;
  nextRun.expedition.encounter = null;
  nextRun.combat = null;
  nextRun.expedition.campsite = {
    required: true,
    enteredAt: now,
    sourceEncounterId: resolved.id,
    sourceBoss: Boolean(resolved.boss),
    sourceMiniboss: Boolean(resolved.miniboss),
    defeatRecovery: clone(defeatRecovery)
  };
  nextRun.expedition.state = 'campsite';
  return { ok: true, slot: next, campsite: clone(nextRun.expedition.campsite), forestClearedNow, bogClearedNow, regionClearedNow, completionReward: completionReward ? clone(completionReward) : null };
}

export function continueBeyondForest(slot, { now = new Date().toISOString() } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'region-boundary' || run.expedition?.regionId !== FOREST_ID) return { ok: false, error: 'The Forest is not awaiting a region-boundary decision.' };
  if (!run.regionalProgress?.forestCleared) return { ok: false, error: 'The Forest boss must be defeated before continuing beyond the region.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const target = clone(nextRun.expedition.nextRegion || { id: 'bog-of-lost-souls', name: 'Bog of Lost Souls', expectedEntryLevel: [5, 6], targetEndLevel: 12 });
  nextRun.regionTransition = { fromRegionId: FOREST_ID, toRegionId: target.id, toRegionName: target.name, chosenAt: now, state: 'awaiting-next-region' };
  nextRun.completedRegions = [...new Set([...(nextRun.completedRegions || []), FOREST_ID])];
  nextRun.expedition.state = 'awaiting-next-region';
  nextRun.expedition.cards = [];
  nextRun.expedition.encounter = null;
  nextRun.expedition.campsite = null;
  return { ok: true, slot: next, transition: clone(nextRun.regionTransition) };
}

export function advanceAfterResolvedNoncombat(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, rng = Math.random } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'awaiting-next-step') return { ok: false, error: 'The expedition is not ready to advance.' };
  return advanceDepth(slot, { regionsData, forestEvents, forestTrainers, bogEvents, bogTrainers, rng });
}

export function leaveCampsite(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, rng = Math.random, now = new Date().toISOString() } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'campsite' || !run.expedition.campsite?.required) return { ok: false, error: 'No mandatory campsite is active.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const exhaustionRecovery = removeCampsiteExhaustion(nextRun);
  nextRun.expedition.campsite = { ...nextRun.expedition.campsite, required: false, leftAt: now, exhaustionRecovery };
  if(nextRun.expedition?.regionId===BOG_ID)nextRun.expedition.fogPressure=Math.max(0,Number(nextRun.expedition.fogPressure||0)-Number(nextRun.expedition.regionalMechanic?.safeCampReduction||1));
  return advanceDepth(next, { regionsData, forestEvents, forestTrainers, bogEvents, bogTrainers, rng });
}

function advanceDepth(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, rng = Math.random } = {}) {
  const next = clone(slot);
  const run = next.campaign.state;
  const expedition = run.expedition;
  const region = getRegion(regionsData, expedition.regionId);
  if (!region) return { ok: false, error: 'The current region definition is missing.' };
  if (expedition.depth >= expedition.maxDepth) {
    expedition.state = 'region-boundary';
    expedition.cards = [];
    expedition.selectedCardId = null;
    expedition.encounter = null;
    return { ok: true, slot: next, regionBoundary: true, depth: expedition.depth };
  }
  expedition.depth += 1;
  expedition.step = Number(expedition.step || 0) + 1;
  expedition.selectedCardId = null;
  expedition.encounter = null;
  expedition.campsite = null;
  const minibossDepth = Number(region.combatStructure?.minibossDepth || Math.floor(Number(region.depthCount || 30) / 2));
  const bossDepth = Number(region.combatStructure?.bossDepth || Number(region.depthCount || 30));
  if (expedition.depth === minibossDepth || expedition.depth === bossDepth) {
    const boss = expedition.depth === bossDepth;
    expedition.cards = [];
    expedition.encounter = makeEncounter(run, null, { source: boss ? 'boss' : 'miniboss', kind: 'combat', boss, miniboss: !boss, rng });
    expedition.state = 'combat-pending';
    return { ok: true, slot: next, regionBoundary: false, depth: expedition.depth, specialCombat: boss ? 'boss' : 'miniboss', encounter: clone(expedition.encounter) };
  }
  const draw = createEventCards({ runId: run.id, region, depth: expedition.depth, rng, forestEvents, forestTrainers, bogEvents, bogTrainers, expedition });
  expedition.cards = Array.isArray(draw) ? draw : draw.cards;
  if (!Array.isArray(draw)) { expedition.usedEventIds = draw.usedEventIds; expedition.shownTrainerIds = draw.shownTrainerIds; }
  expedition.state = 'choosing-event';
  return { ok: true, slot: next, regionBoundary: false, depth: expedition.depth, cards: clone(expedition.cards) };
}

export function isIntroductoryDepth(expedition) {
  const depth = Number(expedition?.depth || 0);
  return depth >= Number(expedition?.introductoryBand?.start || 1)
    && depth <= Number(expedition?.introductoryBand?.end || 5);
}
