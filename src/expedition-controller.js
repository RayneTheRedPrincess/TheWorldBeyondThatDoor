import { planForestTrainerRoster, createForestEventCards } from './forest-event-deck.js';
import { planBogTrainerRoster, createBogEventCards } from './bog-event-deck.js';
import { createTowerEventCards } from './tower-event-deck.js';
import { createPlainsEventCards } from './plains-event-deck.js';
import { createHellEventCards } from './hell-event-deck.js';
import { createDragonEventCards } from './dragon-event-deck.js';
import { createNecropolisEventCards } from './necropolis-event-deck.js';
import { keptVictoryRecovery } from './kept-impression-runtime.js';
import { buildPartyCombatSpecs } from './forest-encounter-builder.js';
import { compactEncounterHistoryEntry, compactEncounterHistory, compactMaterialInventory, getCraftedCount } from './storage-efficiency.js';
const FOREST_ID = 'forest';
const BOG_ID = 'bog-of-lost-souls';
const TOWER_ID = 'heavenly-tower';
const PLAINS_ID = 'ruined-vampiric-plains';
const HELL_ID = 'caverns-to-hell';
const DRAGON_ID = 'that-dragons-dungeon';
const NECROPOLIS_ID = 'necropolis';
const FINAL_ID = 'shadow-infused-dark-woods';
const CHECKMARK_OUTCOMES = new Set(['success', 'failure']);
const COMBAT_SOURCES = new Set(['event-card', 'checkmark-followup', 'stat-check-followup', 'boss', 'miniboss']);

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

export function createEventCards({ runId, region, depth, rng = Math.random, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, towerEvents = null, plainsEvents = null, hellEvents = null, dragonEvents = null, necropolisEvents = null, expedition = null } = {}) {
  if (region?.id === NECROPOLIS_ID && necropolisEvents?.events && expedition) return createNecropolisEventCards({ runId, depth, necropolisEvents, expedition, rng });
  if (region?.id === DRAGON_ID && dragonEvents?.events && expedition) return createDragonEventCards({ runId, depth, dragonEvents, expedition, rng });
  if (region?.id === HELL_ID && hellEvents?.events && expedition) return createHellEventCards({ runId, depth, hellEvents, expedition, rng });
  if (region?.id === PLAINS_ID && plainsEvents?.events && expedition) return createPlainsEventCards({ runId, depth, plainsEvents, expedition, rng });
  if (region?.id === TOWER_ID && towerEvents?.events && expedition) return createTowerEventCards({ runId, depth, towerEvents, expedition, rng });
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
  const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[FOREST_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),shownTrainerIds:clone(old?.shownTrainerIds||[]),trainerDecisions:clone(nextRun.trainerDecisions||{}),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.forestCleared)};
  const partyClasses=[nextRun.configuration?.permanentBaseClass,...Object.values(nextRun.adventurers||{}).map(a=>a.baseClass)].filter(Boolean);nextRun.expedition=createBogExpedition({runId:nextRun.id,regionsData,bogEvents,bogTrainers,activeVesselBaseClass:nextRun.configuration?.permanentBaseClass||null,partyBaseClasses:partyClasses,unlockedSubclasses,forcedTrainerIds,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[BOG_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}


export function createTowerExpedition({ runId, regionsData, towerEvents = null, rng = Math.random } = {}) {
  const region=getRegion(regionsData,TOWER_ID);if(!region)throw new Error('Heavenly Tower region definition is missing.');
  const depth=1,expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,regionalMechanic:clone(region.regionalMechanic||{}),completionReward:clone(region.completionReward||{onyx:900,chronicleProgress:36}),nextRegion:clone(region.nextRegion||null),fallRecoveryPending:false};
  const draw=createEventCards({runId,region,depth,rng,towerEvents,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw))expedition.usedEventIds=draw.usedEventIds;return expedition;
}
export function enterTowerRegion(slot,{regionsData,towerEvents=null,rng=Math.random,now=new Date().toISOString()}={}){
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==TOWER_ID)return{ok:false,error:'The campaign is not waiting to enter the Heavenly Tower.'};
  const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[BOG_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),shownTrainerIds:clone(old?.shownTrainerIds||[]),trainerDecisions:clone(nextRun.trainerDecisions||{}),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.bogCleared)};
  nextRun.expedition=createTowerExpedition({runId:nextRun.id,regionsData,towerEvents,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[TOWER_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.tower=nextRun.regionalMetrics.tower||{highestDepth:1,holyRobotsDefeated:0,coldRobotsDefeated:0,fireRobotsDefeated:0,psychicRobotsDefeated:0,hybridRobotsDefeated:0,buffedRobotsDefeated:0,energySpent:0,falls:0};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}


export function createPlainsExpedition({ runId, regionsData, plainsEvents = null, rng = Math.random } = {}) {
  const region=getRegion(regionsData,PLAINS_ID);if(!region)throw new Error('Ruined Vampiric Plains region definition is missing.');
  const depth=1,expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,bloodMoon:Math.max(0,Number(region.regionalMechanic?.starting||0)),bloodMoonMax:Math.max(0,Number(region.regionalMechanic?.starting||0)),regionalMechanic:clone(region.regionalMechanic||{}),completionReward:clone(region.completionReward||{onyx:1600,chronicleProgress:64}),nextRegion:clone(region.nextRegion||null),sanguineFontLifestealPct:0};
  const draw=createEventCards({runId,region,depth,rng,plainsEvents,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw))expedition.usedEventIds=draw.usedEventIds;return expedition;
}
export function enterPlainsRegion(slot,{regionsData,plainsEvents=null,rng=Math.random,now=new Date().toISOString()}={}){
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==PLAINS_ID)return{ok:false,error:'The campaign is not waiting to enter the Ruined Vampiric Plains.'};
  const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[TOWER_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.towerCleared),regionalMetrics:clone(nextRun.regionalMetrics?.tower||{})};
  nextRun.expedition=createPlainsExpedition({runId:nextRun.id,regionsData,plainsEvents,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[PLAINS_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.plains=nextRun.regionalMetrics.plains||{highestDepth:1,bloodMoonMax:0,vampireUndeadDefeated:0,highBloodWins:0,bloodZenithWins:0,bleedsApplied:0,lifestealHealing:0,fireLifestealHealing:0,poisonLifestealHealing:0,darkLifestealHealing:0,shieldBreakDamage:0,overkillDefeats:0,hpSacrificeEvents:0,minibossesDefeated:0};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}


export function createHellExpedition({ runId, regionsData, hellEvents = null, rng = Math.random } = {}) {
  const region=getRegion(regionsData,HELL_ID);if(!region)throw new Error('Caverns to Hell region definition is missing.');
  const depth=1,expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,completionReward:clone(region.completionReward||{onyx:2500,chronicleProgress:100}),nextRegion:clone(region.nextRegion||null),greedsDebt:false,hellMerchantPurchases:[]};
  const draw=createEventCards({runId,region,depth,rng,hellEvents,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw))expedition.usedEventIds=draw.usedEventIds;return expedition;
}
export function enterHellRegion(slot,{regionsData,hellEvents=null,rng=Math.random,now=new Date().toISOString()}={}){
 const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==HELL_ID)return{ok:false,error:'The campaign is not waiting to enter the Caverns to Hell.'};
 const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[PLAINS_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.plainsCleared),regionalMetrics:clone(nextRun.regionalMetrics?.plains||{})};
 nextRun.expedition=createHellExpedition({runId:nextRun.id,regionsData,hellEvents,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[HELL_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.hell=nextRun.regionalMetrics.hell||{highestDepth:1,cavernEnemiesDefeated:0,demonsDefeated:0,sinboundDefeated:0,merchantPurchases:0,gateGuardianDefeated:0,bossesDefeated:0,sinFormsWitnessed:0};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}

export function getExpeditionView(slot) {
  return slot?.campaign?.active && slot.campaign.state?.expedition
    ? clone(slot.campaign.state.expedition)
    : null;
}


export function createDragonExpedition({ runId, regionsData, dragonEvents = null, rng = Math.random } = {}) {
  const region=getRegion(regionsData,DRAGON_ID);if(!region)throw new Error('That Dragon’s Dungeon region definition is missing.');
  const depth=1,expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,completionReward:clone(region.completionReward||{onyx:3600,chronicleProgress:144}),nextRegion:clone(region.nextRegion||null),dragonCurses:[],dragonTreasuresTaken:0};
  const draw=createEventCards({runId,region,depth,rng,dragonEvents,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw))expedition.usedEventIds=draw.usedEventIds;return expedition;
}
export function enterDragonRegion(slot,{regionsData,dragonEvents=null,rng=Math.random,now=new Date().toISOString()}={}){
 const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==DRAGON_ID)return{ok:false,error:'The campaign is not waiting to enter That Dragon’s Dungeon.'};
 const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[HELL_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.hellCleared),regionalMetrics:clone(nextRun.regionalMetrics?.hell||{})};
 nextRun.expedition=createDragonExpedition({runId:nextRun.id,regionsData,dragonEvents,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[DRAGON_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.dragon=nextRun.regionalMetrics.dragon||{highestDepth:1,drakesDefeated:0,wyvernsDefeated:0,trueDragonsDefeated:0,treasuresTaken:0,cursesSurvived:0,hoardSentinelDefeated:0,leviathanHeadsDefeated:0,leviathanDefeated:0,bossesDefeated:0,elementTypesFaced:[]};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}


export function createNecropolisExpedition({ runId, regionsData, necropolisEvents = null, rng = Math.random } = {}) {
  const region=getRegion(regionsData,NECROPOLIS_ID);if(!region)throw new Error('Necropolis region definition is missing.');
  const depth=1,expedition={regionId:region.id,regionName:region.name,depth,maxDepth:Number(region.depthCount||30),introductoryBand:clone(region.introductoryBand||{start:1,end:5}),cardsPerStep:Number(region.cardsPerStep||3),state:'choosing-event',step:1,cards:[],selectedCardId:null,encounter:null,campsite:null,history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,completionReward:clone(region.completionReward||{onyx:5000,chronicleProgress:200}),nextRegion:clone(region.nextRegion||null),cultTrail:0,mirrorGlimpses:0};
  const draw=createEventCards({runId,region,depth,rng,necropolisEvents,expedition});expedition.cards=Array.isArray(draw)?draw:draw.cards;if(!Array.isArray(draw))expedition.usedEventIds=draw.usedEventIds;return expedition;
}
export function enterNecropolisRegion(slot,{regionsData,necropolisEvents=null,rng=Math.random,now=new Date().toISOString()}={}){
 const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==NECROPOLIS_ID)return{ok:false,error:'The campaign is not waiting to enter Necropolis.'};
 const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[DRAGON_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.dragonCleared),regionalMetrics:clone(nextRun.regionalMetrics?.dragon||{})};
 nextRun.expedition=createNecropolisExpedition({runId:nextRun.id,regionsData,necropolisEvents,rng});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[NECROPOLIS_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.necropolis=nextRun.regionalMetrics.necropolis||{highestDepth:1,undeadDefeated:0,cultistsDefeated:0,sacrificesWitnessed:0,mirrorGlimpses:0,executionerDefeated:0,graveColossusDefeated:0,royalOssuariesDestroyed:0,bossesDefeated:0};return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
}


export function createFinalRegionExpedition({ runId, regionsData, now = new Date().toISOString() } = {}) {
  const region=getRegion(regionsData,FINAL_ID);if(!region)throw new Error('Shadow Infused Dark Woods region definition is missing.');
  return {regionId:region.id,regionName:region.name,depth:1,maxDepth:3,introductoryBand:clone(region.introductoryBand||{start:1,end:1}),cardsPerStep:0,state:'campsite',step:1,cards:[],selectedCardId:null,encounter:null,campsite:{required:true,enteredAt:now,sourceEncounterId:null,sourceBoss:false,sourceMiniboss:false,fullHeal:true,finalPreparation:true},history:[],usedEventIds:[],shownTrainerIds:[],trainerPlan:null,completionReward:clone(region.completionReward||{onyx:7500,chronicleProgress:300}),nextRegion:null};
}
export function enterFinalRegion(slot,{regionsData,baseAbilities=null,subclassAbilities=null,progression=null,equipmentCatalog=null,now=new Date().toISOString()}={}){
 const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='awaiting-next-region'||run.regionTransition?.toRegionId!==FINAL_ID)return{ok:false,error:'The campaign is not waiting to enter the Shadow Infused Dark Woods.'};
 const next=clone(slot),nextRun=next.campaign.state,old=nextRun.expedition;nextRun.regionSummaries=nextRun.regionSummaries||{};nextRun.regionSummaries[NECROPOLIS_ID]={highestDepth:Number(old?.depth||0),history:compactEncounterHistory(old?.history||[]),battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materialsSnapshot:compactMaterialInventory(nextRun.inventory?.materials||{}),cleared:Boolean(nextRun.regionalProgress?.necropolisCleared),regionalMetrics:clone(nextRun.regionalMetrics?.necropolis||{})};
 nextRun.expedition=createFinalRegionExpedition({runId:nextRun.id,regionsData,now});nextRun.regionTransition={...nextRun.regionTransition,state:'entered',enteredAt:now};nextRun.regionBaselines=nextRun.regionBaselines||{};nextRun.regionBaselines[FINAL_ID]={battlesWon:Number(nextRun.metrics?.battlesWon||0),craftedItems:getCraftedCount(nextRun),materials:compactMaterialInventory(nextRun.inventory?.materials||{})};nextRun.regionalMetrics=nextRun.regionalMetrics||{};nextRun.regionalMetrics.finalRegion=nextRun.regionalMetrics.finalRegion||{highestDepth:1,cultLeaderDefeated:0,shadowClonesDefeated:0,mirrorFormsDefeated:0,finalBossDefeated:0};
 try{const specs=buildPartyCombatSpecs(nextRun,baseAbilities,subclassAbilities,progression,null,equipmentCatalog);for(const spec of specs){if(spec.id==='vessel')nextRun.character.currentHp=Number(spec.maxHp||1);else if(nextRun.adventurers?.[spec.id])nextRun.adventurers[spec.id].currentHp=Number(spec.maxHp||1);}nextRun.expedition.campsite.fullHealParty=specs.map(x=>({id:x.id,maxHp:Number(x.maxHp||1)}));}catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}
 return{ok:true,slot:next,expedition:clone(nextRun.expedition)};
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
    hellMerchant: Boolean(card?.hellMerchant),
    merchantId: card?.merchantId || null,
    bloodMoonAtStart: Number(run.expedition?.bloodMoon || 0),
    fogOnFailure: Number(card?.fogOnFailure || 0),
    kind: encounterKind,
    combat: encounterKind === 'combat' || source === 'checkmark-followup' || source === 'stat-check-followup' || boss || miniboss,
    noncombat: !(encounterKind === 'combat' || source === 'checkmark-followup' || source === 'stat-check-followup' || boss || miniboss),
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
  nextRun.expedition.state = card.hellMerchant ? 'hell-merchant' : (card.combat ? 'combat-pending' : 'noncombat-pending');
  return { ok: true, slot: next, encounter: clone(nextRun.expedition.encounter) };
}

function archiveEncounter(expedition, encounter) {
  expedition.history = Array.isArray(expedition.history) ? expedition.history : [];
  if (!expedition.history.some(entry => entry.id === encounter.id)) expedition.history.push(compactEncounterHistoryEntry(encounter));
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
  const followup = makeEncounter(nextRun, null, { source: 'stat-check-followup', kind: 'combat', rng });
  followup.triggeredByEncounterId = resolved.id;
  followup.triggeredByOutcome = outcome;
  followup.triggeredByDetails = details ? clone(details) : null;
  followup.triggeredByDepth = Number(details?.depth ?? nextRun.expedition.depth ?? 1);
  followup.advancesDepthOnVictory = true;
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
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};if(run.expedition?.state!=='event-result')return{ok:false,error:'No stat-check result is awaiting continuation.'};
  const next=clone(slot),ex=next.campaign.state.expedition;
  const pending=ex.pendingPostEventCombat&&typeof ex.pendingPostEventCombat==='object'?clone(ex.pendingPostEventCombat):null;
  if(pending){ex.encounter=pending;ex.pendingPostEventCombat=null;ex.state='combat-pending';return{ok:true,slot:next,encounter:clone(pending)};}
  // Very old result-only saves get the newly canonical follow-up battle as well.
  const followup=makeEncounter(next.campaign.state,null,{source:'stat-check-followup',kind:'combat'});followup.advancesDepthOnVictory=true;followup.triggeredByDetails=ex.lastEventResult?clone(ex.lastEventResult):null;followup.triggeredByDepth=Number(ex.depth||1);ex.encounter=followup;ex.state='combat-pending';return{ok:true,slot:next,encounter:clone(followup)};
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

export function resolveCombatVictory(slot, { now = new Date().toISOString(), regionsData = null, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, towerEvents = null, plainsEvents = null, hellEvents = null, dragonEvents = null, necropolisEvents = null, rng = Math.random } = {}) {
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
  if(nextRun.expedition?.regionId===TOWER_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),tower=metrics.tower||(metrics.tower={highestDepth:Number(nextRun.expedition?.depth||1),holyRobotsDefeated:0,coldRobotsDefeated:0,fireRobotsDefeated:0,psychicRobotsDefeated:0,hybridRobotsDefeated:0,buffedRobotsDefeated:0,energySpent:0,falls:0});const enemyById=new Map((nextRun.combat.actors||[]).filter(a=>a.side==='enemy').map(a=>[a.id,a]));for(const e of resolved.enemyRoster||[]){if(!e.robot)continue;const aff=e.affinities||[];if(aff.includes('Holy'))tower.holyRobotsDefeated+=1;if(aff.includes('Cold'))tower.coldRobotsDefeated+=1;if(aff.includes('Fire'))tower.fireRobotsDefeated+=1;if(aff.includes('Psychic'))tower.psychicRobotsDefeated+=1;if(e.hybrid||aff.length>1)tower.hybridRobotsDefeated+=1;const actor=enemyById.get(e.id);if((actor?.effects||[]).some(x=>!x.negative))tower.buffedRobotsDefeated+=1;}const partyIds=new Set((nextRun.combat.actors||[]).filter(a=>a.side==='party').map(a=>a.id));tower.energySpent+=Number((nextRun.combat.log||[]).reduce((sum,x)=>sum+(partyIds.has(x.actorId)?Number(x.energySpent||x.payload?.energySpent||0):0),0));}
  if(nextRun.expedition?.regionId===PLAINS_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),plains=metrics.plains||(metrics.plains={highestDepth:Number(nextRun.expedition?.depth||1),bloodMoonMax:0,vampireUndeadDefeated:0,highBloodWins:0,bloodZenithWins:0,bleedsApplied:0,lifestealHealing:0,fireLifestealHealing:0,poisonLifestealHealing:0,darkLifestealHealing:0,shieldBreakDamage:0,overkillDefeats:0,hpSacrificeEvents:0,minibossesDefeated:0});for(const e of resolved.enemyRoster||[]){if(e.vampire||e.undead)plains.vampireUndeadDefeated+=1;}const bm=Math.max(0,Number(nextRun.expedition.bloodMoon||0));plains.bloodMoonMax=Math.max(Number(plains.bloodMoonMax||0),bm);if(bm>=60)plains.highBloodWins+=1;if(bm>=80)plains.bloodZenithWins+=1;const cm=nextRun.combat.metrics||{};plains.bleedsApplied+=Number(cm.bleedsApplied||0);plains.lifestealHealing+=Number(cm.plainsLifestealHealing||0);plains.fireLifestealHealing+=Number(cm.plainsFireLifestealHealing||0);plains.poisonLifestealHealing+=Number(cm.plainsPoisonLifestealHealing||0);plains.darkLifestealHealing+=Number(cm.plainsDarkLifestealHealing||0);plains.shieldBreakDamage+=Number(cm.plainsShieldBreakDamage||0);plains.overkillDefeats+=Number(cm.plainsOverkillDefeats||0);if(resolved.miniboss)plains.minibossesDefeated+=1;}
  if(nextRun.expedition?.regionId===HELL_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),hell=metrics.hell||(metrics.hell={highestDepth:Number(nextRun.expedition?.depth||1),cavernEnemiesDefeated:0,demonsDefeated:0,sinboundDefeated:0,merchantPurchases:0,gateGuardianDefeated:0,bossesDefeated:0,sinFormsWitnessed:0});for(const e of resolved.enemyRoster||[]){if(e.cavern)hell.cavernEnemiesDefeated+=1;if(e.demon)hell.demonsDefeated+=1;if(e.sinbound)hell.sinboundDefeated+=1;}if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===10)hell.gateGuardianDefeated+=1;if(resolved.boss)hell.bossesDefeated+=1;const ser=(nextRun.combat.actors||[]).find(a=>a.enemyTemplateId==='serevakh-sevenfold-regent');if(ser)hell.sinFormsWitnessed=Math.max(Number(hell.sinFormsWitnessed||0),new Set(ser.combatMemory?.sinCycleSeen||[]).size);}
  if(nextRun.expedition?.regionId===DRAGON_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),dragon=metrics.dragon||(metrics.dragon={highestDepth:Number(nextRun.expedition?.depth||1),drakesDefeated:0,wyvernsDefeated:0,trueDragonsDefeated:0,treasuresTaken:Number(nextRun.expedition?.dragonTreasuresTaken||0),cursesSurvived:(nextRun.expedition?.dragonCurses||[]).length,hoardSentinelDefeated:0,leviathanHeadsDefeated:0,leviathanDefeated:0,bossesDefeated:0,elementTypesFaced:[]});for(const e of resolved.enemyRoster||[]){const family=String(e.dragonFamily||'').toLowerCase();if(family==='drake')dragon.drakesDefeated+=1;else if(family==='wyvern')dragon.wyvernsDefeated+=1;else if(family==='dragon')dragon.trueDragonsDefeated+=1;}if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===10)dragon.hoardSentinelDefeated+=1;if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===20){dragon.leviathanHeadsDefeated+=Math.min(4,(nextRun.combat?.actors||[]).filter(a=>a.side==='enemy'&&String(a.enemyTemplateId||'').startsWith('leviathan-')&&a.enemyTemplateId!=='leviathan-central-head'&&!a.combatMemory?.leviathanCascadeKilled&&Number(a.resources?.hp||0)<=0).length);dragon.leviathanDefeated+=1;}if(resolved.boss)dragon.bossesDefeated+=1;dragon.treasuresTaken=Math.max(Number(dragon.treasuresTaken||0),Number(nextRun.expedition?.dragonTreasuresTaken||0));dragon.cursesSurvived=Math.max(Number(dragon.cursesSurvived||0),(nextRun.expedition?.dragonCurses||[]).length);}
  if(nextRun.expedition?.regionId===NECROPOLIS_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),n=metrics.necropolis||(metrics.necropolis={highestDepth:Number(nextRun.expedition?.depth||1),undeadDefeated:0,cultistsDefeated:0,sacrificesWitnessed:0,mirrorGlimpses:0,executionerDefeated:0,graveColossusDefeated:0,royalOssuariesDestroyed:0,bossesDefeated:0});for(const e of resolved.enemyRoster||[]){if(e.undeadFodder)n.undeadDefeated+=1;if(e.cultist)n.cultistsDefeated+=1;}n.sacrificesWitnessed+=Number(nextRun.combat.metrics?.necropolisSacrifices||0);if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===10)n.executionerDefeated+=1;if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===20)n.graveColossusDefeated+=1;if(resolved.boss){n.royalOssuariesDestroyed+=Math.min(3,(nextRun.combat.actors||[]).filter(a=>String(a.enemyTemplateId||'').startsWith('royal-ossuary-')&&!a.combatMemory?.ossuaryCascadeKilled&&Number(a.resources?.hp||0)<=0).length);n.bossesDefeated+=1;}}
  if(nextRun.expedition?.regionId===FINAL_ID&&nextRun.combat){const metrics=nextRun.regionalMetrics||(nextRun.regionalMetrics={}),f=metrics.finalRegion||(metrics.finalRegion={highestDepth:Number(nextRun.expedition?.depth||1),cultLeaderDefeated:0,shadowClonesDefeated:0,mirrorFormsDefeated:0,finalBossDefeated:0});f.highestDepth=Math.max(Number(f.highestDepth||1),Number(nextRun.expedition?.depth||1));f.shadowClonesDefeated+=Number((nextRun.combat.actors||[]).filter(a=>a.enemyAi?.shadowPartyClone===true&&Number(a.resources?.hp||0)<=0).length);if(resolved.miniboss&&Number(nextRun.expedition?.depth||0)===2)f.cultLeaderDefeated+=1;if(resolved.boss){const mirror=(nextRun.combat.actors||[]).find(a=>a.enemyTemplateId==='broken-mirror');f.mirrorFormsDefeated=Math.max(Number(f.mirrorFormsDefeated||0),Math.min(8,Number(mirror?.combatMemory?.mirrorFormIndex||0)+1));f.finalBossDefeated+=1;}}


  let forestClearedNow = false;
  let bogClearedNow = false;
  let towerClearedNow = false;
  let plainsClearedNow = false;
  let hellClearedNow = false;
  let dragonClearedNow = false;
  let necropolisClearedNow = false;
  let finalClearedNow = false;
  let regionClearedNow = false;
  let completionReward = null;
  if (resolved.boss) {
    const regionId=nextRun.expedition?.regionId;
    nextRun.regionalProgress = nextRun.regionalProgress || {};
    const key=regionId===FOREST_ID?'forest':regionId===BOG_ID?'bog':regionId===TOWER_ID?'tower':regionId===PLAINS_ID?'plains':regionId===HELL_ID?'hell':regionId===DRAGON_ID?'dragon':regionId===NECROPOLIS_ID?'necropolis':regionId===FINAL_ID?'finalRegion':null;
    if(key&&!nextRun.regionalProgress[`${key}CompletionRewardApplied`]){
      const fallback=regionId===FOREST_ID?{onyx:100,chronicleProgress:4}:regionId===BOG_ID?{onyx:500,chronicleProgress:20}:regionId===TOWER_ID?{onyx:900,chronicleProgress:36}:regionId===PLAINS_ID?{onyx:1600,chronicleProgress:64}:regionId===HELL_ID?{onyx:2500,chronicleProgress:100}:regionId===DRAGON_ID?{onyx:3600,chronicleProgress:144}:regionId===NECROPOLIS_ID?{onyx:5000,chronicleProgress:200}:{onyx:7500,chronicleProgress:300};
      const reward=nextRun.expedition.completionReward||fallback,onyx=Math.max(0,Math.round(Number(reward.onyx||0))),chronicleProgress=Math.max(0,Math.round(Number(reward.chronicleProgress||0)));
      nextRun.rewards=nextRun.rewards||{carriedOnyx:0,chronicleProgress:0};nextRun.rewards.carriedOnyx=Number(nextRun.rewards.carriedOnyx||0)+onyx;nextRun.rewards.chronicleProgress=Number(nextRun.rewards.chronicleProgress||0)+chronicleProgress;
      nextRun.regionalProgress[`${key}CompletionRewardApplied`]=true;nextRun.regionalProgress[`${key}Cleared`]=true;nextRun.regionalProgress[`${key}ClearedAt`]=now;nextRun.regionalProgress[`${key}CompletionReward`]={onyx,chronicleProgress};completionReward={onyx,chronicleProgress};regionClearedNow=true;forestClearedNow=key==='forest';bogClearedNow=key==='bog';towerClearedNow=key==='tower';plainsClearedNow=key==='plains';hellClearedNow=key==='hell';dragonClearedNow=key==='dragon';necropolisClearedNow=key==='necropolis';finalClearedNow=key==='finalRegion';
    }
  }
  if(resolved.majorHaunting&&nextRun.expedition?.regionId===BOG_ID)nextRun.expedition.fogPressure=Math.max(0,Number(nextRun.expedition.fogPressure||0)-1);
  resolved.state = 'resolved';
  resolved.resolution = { type: 'victory', at: now, ...(completionReward ? { regionCompletionReward: clone(completionReward), ...(nextRun.expedition?.regionId===FOREST_ID?{forestCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===BOG_ID?{bogCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===TOWER_ID?{towerCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===PLAINS_ID?{plainsCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===HELL_ID?{hellCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===DRAGON_ID?{dragonCompletionReward:clone(completionReward)}:nextRun.expedition?.regionId===NECROPOLIS_ID?{necropolisCompletionReward:clone(completionReward)}:{finalRegionCompletionReward:clone(completionReward)}) } : {}) };
  archiveEncounter(nextRun.expedition, resolved);
  nextRun.metrics = nextRun.metrics || {};
  nextRun.metrics.battlesWon = Number(nextRun.metrics.battlesWon || 0) + 1;
  nextRun.metrics.combatsCompleted = Number(nextRun.metrics.combatsCompleted || 0) + 1;
  nextRun.expedition.encounter = null;
  nextRun.combat = null;
  if(nextRun.expedition?.regionId===FINAL_ID&&resolved.boss){nextRun.expedition.campsite=null;nextRun.expedition.state='campaign-complete';return{ok:true,slot:next,campsite:null,forestClearedNow,bogClearedNow,towerClearedNow,plainsClearedNow,hellClearedNow,dragonClearedNow,necropolisClearedNow,finalClearedNow,regionClearedNow,completionReward:completionReward?clone(completionReward):null};}

  const statCheckFollowup = resolved.source === 'stat-check-followup' || resolved.source === 'checkmark-followup' || resolved.advancesDepthOnVictory === true;
  let finalSlot = next;
  let finalRun = nextRun;
  let preparedStateAfterCampsite = null;
  let depthBeforeAdvance = Number(finalRun.expedition?.depth || 1);
  let depthAfterAdvance = depthBeforeAdvance;
  if(statCheckFollowup && regionsData){
    const advanced=advanceDepth(finalSlot,{regionsData,forestEvents,forestTrainers,bogEvents,bogTrainers,towerEvents,plainsEvents,hellEvents,dragonEvents,necropolisEvents,rng});
    if(!advanced.ok)return advanced;
    finalSlot=advanced.slot;finalRun=finalSlot.campaign.state;
    preparedStateAfterCampsite=finalRun.expedition.state;
    depthAfterAdvance=Number(finalRun.expedition?.depth||depthBeforeAdvance);
  }
  finalRun.expedition.campsite = {
    required: true,
    enteredAt: now,
    sourceEncounterId: resolved.id,
    sourceBoss: Boolean(resolved.boss),
    sourceMiniboss: Boolean(resolved.miniboss),
    defeatRecovery: clone(defeatRecovery),
    ...(statCheckFollowup?{
      statCheckFollowup:true,
      depthAdvancedBeforeCampsite:Boolean(preparedStateAfterCampsite),
      depthBeforeAdvance,
      depthAfterAdvance,
      preparedStateAfterCampsite:preparedStateAfterCampsite||null
    }:{})
  };
  finalRun.expedition.state = 'campsite';
  return { ok: true, slot: finalSlot, campsite: clone(finalRun.expedition.campsite), statCheckFollowup, depthBeforeAdvance, depthAfterAdvance, forestClearedNow, bogClearedNow, towerClearedNow, plainsClearedNow, hellClearedNow, dragonClearedNow, necropolisClearedNow, finalClearedNow, regionClearedNow, completionReward: completionReward ? clone(completionReward) : null };
}

export function continueBeyondForest(slot, { now = new Date().toISOString() } = {}) {
  const run=activeRun(slot);if(!run)return{ok:false,error:'No active campaign.'};const regionId=run.expedition?.regionId,key=regionId===FOREST_ID?'forest':regionId===BOG_ID?'bog':regionId===TOWER_ID?'tower':regionId===PLAINS_ID?'plains':regionId===HELL_ID?'hell':regionId===DRAGON_ID?'dragon':regionId===NECROPOLIS_ID?'necropolis':null;if(run.expedition?.state!=='region-boundary'||!key)return{ok:false,error:'The current region is not awaiting a boundary decision.'};if(!run.regionalProgress?.[`${key}Cleared`])return{ok:false,error:'The regional boss must be defeated before continuing.'};const next=clone(slot),nextRun=next.campaign.state,target=clone(nextRun.expedition.nextRegion||{});nextRun.regionTransition={fromRegionId:regionId,toRegionId:target.id,toRegionName:target.name,chosenAt:now,state:'awaiting-next-region'};nextRun.completedRegions=[...new Set([...(nextRun.completedRegions||[]),regionId])];nextRun.expedition.state='awaiting-next-region';nextRun.expedition.cards=[];nextRun.expedition.encounter=null;nextRun.expedition.campsite=null;return{ok:true,slot:next,transition:clone(nextRun.regionTransition)};
}

export function advanceAfterResolvedNoncombat(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, towerEvents = null, plainsEvents = null, hellEvents = null, dragonEvents = null, necropolisEvents = null, rng = Math.random } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'awaiting-next-step') return { ok: false, error: 'The expedition is not ready to advance.' };
  return advanceDepth(slot, { regionsData, forestEvents, forestTrainers, bogEvents, bogTrainers, towerEvents, plainsEvents, hellEvents, dragonEvents, necropolisEvents, rng });
}

export function leaveCampsite(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, towerEvents = null, plainsEvents = null, hellEvents = null, dragonEvents = null, necropolisEvents = null, rng = Math.random, now = new Date().toISOString() } = {}) {
  const run = activeRun(slot);
  if (!run) return { ok: false, error: 'No active campaign.' };
  if (run.expedition?.state !== 'campsite' || !run.expedition.campsite?.required) return { ok: false, error: 'No mandatory campsite is active.' };
  const next = clone(slot);
  const nextRun = next.campaign.state;
  const exhaustionRecovery = removeCampsiteExhaustion(nextRun);
  nextRun.expedition.campsite = { ...nextRun.expedition.campsite, required: false, leftAt: now, exhaustionRecovery };
  if(nextRun.expedition?.regionId===BOG_ID)nextRun.expedition.fogPressure=Math.max(0,Number(nextRun.expedition.fogPressure||0)-Number(nextRun.expedition.regionalMechanic?.safeCampReduction||1));
  const preparedState=nextRun.expedition.campsite?.preparedStateAfterCampsite;
  if(nextRun.expedition.campsite?.depthAdvancedBeforeCampsite&&preparedState){
    nextRun.expedition.campsite=null;
    nextRun.expedition.state=preparedState;
    return {ok:true,slot:next,depth:Number(nextRun.expedition.depth||1),resumedPreparedDepth:true};
  }
  return advanceDepth(next, { regionsData, forestEvents, forestTrainers, bogEvents, bogTrainers, towerEvents, plainsEvents, hellEvents, dragonEvents, necropolisEvents, rng });
}

function advanceDepth(slot, { regionsData, forestEvents = null, forestTrainers = null, bogEvents = null, bogTrainers = null, towerEvents = null, plainsEvents = null, hellEvents = null, dragonEvents = null, necropolisEvents = null, rng = Math.random } = {}) {
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
  const recoveringFromFall=Boolean(expedition.fallRecoveryPending);if(recoveringFromFall)expedition.fallRecoveryPending=false;else expedition.depth += 1;
  if(expedition.regionId===TOWER_ID){run.regionalMetrics=run.regionalMetrics||{};run.regionalMetrics.tower=run.regionalMetrics.tower||{};run.regionalMetrics.tower.highestDepth=Math.max(Number(run.regionalMetrics.tower.highestDepth||1),Number(expedition.depth||1));}
  if(expedition.regionId===HELL_ID){run.regionalMetrics=run.regionalMetrics||{};const hell=run.regionalMetrics.hell||(run.regionalMetrics.hell={highestDepth:1,cavernEnemiesDefeated:0,demonsDefeated:0,sinboundDefeated:0,merchantPurchases:0,gateGuardianDefeated:0,bossesDefeated:0,sinFormsWitnessed:0});hell.highestDepth=Math.max(Number(hell.highestDepth||1),Number(expedition.depth||1));}
  if(expedition.regionId===DRAGON_ID){run.regionalMetrics=run.regionalMetrics||{};const dragon=run.regionalMetrics.dragon||(run.regionalMetrics.dragon={highestDepth:1,drakesDefeated:0,wyvernsDefeated:0,trueDragonsDefeated:0,treasuresTaken:0,cursesSurvived:0,hoardSentinelDefeated:0,leviathanHeadsDefeated:0,leviathanDefeated:0,bossesDefeated:0,elementTypesFaced:[]});dragon.highestDepth=Math.max(Number(dragon.highestDepth||1),Number(expedition.depth||1));}
  if(expedition.regionId===NECROPOLIS_ID){run.regionalMetrics=run.regionalMetrics||{};const n=run.regionalMetrics.necropolis||(run.regionalMetrics.necropolis={highestDepth:1,undeadDefeated:0,cultistsDefeated:0,sacrificesWitnessed:0,mirrorGlimpses:0,executionerDefeated:0,graveColossusDefeated:0,royalOssuariesDestroyed:0,bossesDefeated:0});n.highestDepth=Math.max(Number(n.highestDepth||1),Number(expedition.depth||1));}
  if(expedition.regionId===FINAL_ID){run.regionalMetrics=run.regionalMetrics||{};const f=run.regionalMetrics.finalRegion||(run.regionalMetrics.finalRegion={highestDepth:1,cultLeaderDefeated:0,shadowClonesDefeated:0,mirrorFormsDefeated:0,finalBossDefeated:0});f.highestDepth=Math.max(Number(f.highestDepth||1),Number(expedition.depth||1));}
  if(expedition.regionId===PLAINS_ID){run.regionalMetrics=run.regionalMetrics||{};const plains=run.regionalMetrics.plains||(run.regionalMetrics.plains={highestDepth:1,bloodMoonMax:0,vampireUndeadDefeated:0,highBloodWins:0,bloodZenithWins:0,bleedsApplied:0,lifestealHealing:0,fireLifestealHealing:0,poisonLifestealHealing:0,darkLifestealHealing:0,shieldBreakDamage:0,overkillDefeats:0,hpSacrificeEvents:0,minibossesDefeated:0});plains.highestDepth=Math.max(Number(plains.highestDepth||1),Number(expedition.depth||1));if(!recoveringFromFall){expedition.bloodMoon=Math.max(0,Math.min(100,Number(expedition.bloodMoon||0)+Number(expedition.regionalMechanic?.travelGain||3)));expedition.bloodMoonMax=Math.max(Number(expedition.bloodMoonMax||0),Number(expedition.bloodMoon||0));plains.bloodMoonMax=Math.max(Number(plains.bloodMoonMax||0),Number(expedition.bloodMoon||0));}}
  expedition.step = Number(expedition.step || 0) + 1;
  expedition.selectedCardId = null;
  expedition.encounter = null;
  expedition.campsite = null;
  const minibossDepths = Array.isArray(region.combatStructure?.minibossDepths) ? region.combatStructure.minibossDepths.map(Number) : [Number(region.combatStructure?.minibossDepth || Math.floor(Number(region.depthCount || 30) / 2))];
  const bossDepth = Number(region.combatStructure?.bossDepth || Number(region.depthCount || 30));
  const atBossDepth = Number(expedition.depth) === bossDepth;
  const atMinibossDepth = minibossDepths.includes(Number(expedition.depth));
  const specialAlreadyCleared = (expedition.history || []).some(entry => Number(entry?.depth) === Number(expedition.depth)
    && entry?.state === 'resolved' && entry?.resolution?.type === 'victory'
    && (atBossDepth ? entry?.boss === true : atMinibossDepth ? entry?.miniboss === true : false));
  if (!recoveringFromFall && (atMinibossDepth || atBossDepth) && !specialAlreadyCleared) {
    const boss = atBossDepth;
    expedition.cards = [];
    expedition.encounter = makeEncounter(run, null, { source: boss ? 'boss' : 'miniboss', kind: 'combat', boss, miniboss: !boss, rng });
    expedition.state = 'combat-pending';
    return { ok: true, slot: next, regionBoundary: false, depth: expedition.depth, specialCombat: boss ? 'boss' : 'miniboss', encounter: clone(expedition.encounter) };
  }
  const draw = createEventCards({ runId: run.id, region, depth: expedition.depth, rng, forestEvents, forestTrainers, bogEvents, bogTrainers, towerEvents, plainsEvents, hellEvents, dragonEvents, necropolisEvents, expedition });
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
