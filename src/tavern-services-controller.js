const CORE_STATS = ['STR','DEX','CON','INT','FTH','CHA','LCK'];
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function pick(list,rng){return list.length?list[Math.floor(unit(rng)*list.length)]:null;}
function unique(values){return [...new Set((values||[]).filter(Boolean))];}
function campaignCount(slot){return Array.isArray(slot?.history?.campaigns)?slot.history.campaigns.length:0;}
export function normalizeTavernServiceState(slot){
  const next=clone(slot); next.tavernServices=next.tavernServices||{};
  next.tavernServices.mara={offerCycle:Number(next.tavernServices.mara?.offerCycle??-1),offers:Array.isArray(next.tavernServices.mara?.offers)?next.tavernServices.mara.offers:[],activeQuest:next.tavernServices.mara?.activeQuest||null};
  next.lender=next.lender||{}; next.lender.collection=unique(next.lender.collection); next.lender.selectedItemId=next.lender.selectedItemId||null;
  next.loadout=next.loadout||{}; return next;
}
function trainerCandidates(slot,account,forestTrainers,{learnOnly=false}={}){
  const base=slot?.character?.baseClass; const unlocked=new Set(account?.unlocks?.subclasses||[]);
  let entries=(forestTrainers?.entries||[]).filter(t=>t.baseClass===base);
  if(learnOnly)entries=entries.filter(t=>!unlocked.has(t.subclass));
  return entries;
}
function instantiate(template,slot,account,forestTrainers,rng,cycle){
  const q=clone(template); q.instanceId=`mara-${cycle}-${q.id}`; q.acceptedAt=null;
  if(template.objective?.type==='learn-specific-trainer'){
    const t=pick(trainerCandidates(slot,account,forestTrainers,{learnOnly:true}),rng); if(!t)return null;
    q.objective={...q.objective,trainerId:t.id,trainerName:t.name,subclass:t.subclass}; q.description=`Learn ${t.subclass} from ${t.name}.`;
  } else if(template.objective?.type==='fight-specific-trainer'){
    const t=pick(trainerCandidates(slot,account,forestTrainers),rng); if(!t)return null;
    q.objective={...q.objective,trainerId:t.id,trainerName:t.name,subclass:t.subclass}; q.description=`Fight ${t.name}, the ${t.subclass} Trainer.`;
  } else q.description=describeObjective(q.objective);
  return q;
}
export function describeObjective(o={}){
  const n=Number(o.target||0); const map={
    'reach-depth':`Reach Forest Depth ${n}.`,'win-combats':`Win ${n} Forest combats.`,'successful-checks':`Succeed at ${n} Forest stat checks.`,'craft-items':`Craft ${n} items at Campsites.`,'defeat-miniboss':'Defeat the Forest miniboss.','defeat-boss':'Defeat the Forest boss.','earn-onyx':`Earn at least ${n} carried Onyx during the campaign.`,'meet-trainer':'Encounter at least one Forest Trainer.'
  }; return map[o.type]||'Complete the listed Forest task.';
}
export function ensureMaraQuestOffers(slot,account,{tavernServices,forestTrainers,rng=Math.random,force=false}={}){
  let next=normalizeTavernServiceState(slot); if(next.campaign?.active||next.campaign?.settlement)return {ok:true,slot:next,changed:false};
  const cycle=campaignCount(next), mara=next.tavernServices.mara; if(!force&&mara.offerCycle===cycle&&mara.offers.length===Number(tavernServices?.mara?.offersAtATime||3))return {ok:true,slot:next,changed:false};
  const templates=(tavernServices?.mara?.questTemplates||[]).filter(t=>{
    if(t.requiresLearnableTrainer)return trainerCandidates(next,account,forestTrainers,{learnOnly:true}).length>0;
    return true;
  });
  const pool=[...templates], offers=[]; const count=Number(tavernServices?.mara?.offersAtATime||3);
  while(offers.length<count&&pool.length){const t=pool.splice(Math.floor(unit(rng)*pool.length),1)[0];const q=instantiate(t,next,account,forestTrainers,rng,cycle);if(q)offers.push(q);}
  if(offers.length<count)return {ok:false,error:'Mara cannot form three valid quest offers from the current account state.'};
  mara.offerCycle=cycle; mara.offers=offers; return {ok:true,slot:next,changed:true,offers:clone(offers)};
}
export function acceptMaraQuest(slot,questId,{now=new Date().toISOString()}={}){
  let next=normalizeTavernServiceState(slot); if(next.campaign?.active||next.campaign?.settlement)return {ok:false,error:'Mara quests can only be accepted between campaigns.'};
  const mara=next.tavernServices.mara;if(mara.activeQuest)return {ok:false,error:'This Vessel already has an active Mara quest.'};const q=mara.offers.find(x=>x.instanceId===questId);if(!q)return {ok:false,error:'That quest offer is not available.'};
  mara.activeQuest={...clone(q),acceptedAt:now};return {ok:true,slot:next,quest:clone(mara.activeQuest)};
}
export function abandonMaraQuest(slot){let next=normalizeTavernServiceState(slot);if(next.campaign?.active)return{ok:false,error:'An active-campaign Mara quest cannot be replaced.'};next.tavernServices.mara.activeQuest=null;return{ok:true,slot:next};}
export function forcedTrainerIdsForActiveQuest(slot){const q=slot?.tavernServices?.mara?.activeQuest;return q?.forceTrainerAppearance&&q.objective?.trainerId?[q.objective.trainerId]:[];}
function successfulChecks(run){return (run?.expedition?.history||[]).filter(e=>['checkmark','no-checkmark'].includes(e.resolution?.type)&&e.resolution?.details?.outcome==='success').length;}
function defeatedSpecial(run,key){return (run?.expedition?.history||[]).some(e=>e.resolution?.type==='victory'&&Boolean(e[key]));}
export function evaluateMaraQuest(quest,run){
  if(!quest||!run)return {complete:false,progress:0,target:0}; const o=quest.objective||{};let p=0,t=Math.max(1,Number(o.target||1));
  if(o.type==='reach-depth')p=Number(run.expedition?.depth||0);
  else if(o.type==='win-combats')p=Number(run.metrics?.battlesWon||0);
  else if(o.type==='successful-checks')p=successfulChecks(run);
  else if(o.type==='craft-items')p=(run.crafting?.crafted||[]).length;
  else if(o.type==='defeat-miniboss')p=defeatedSpecial(run,'miniboss')?1:0;
  else if(o.type==='defeat-boss')p=defeatedSpecial(run,'boss')?1:0;
  else if(o.type==='earn-onyx')p=Number(run.rewards?.carriedOnyx||0);
  else if(o.type==='meet-trainer')p=(run.expedition?.shownTrainerIds||[]).length?1:0;
  else if(o.type==='learn-specific-trainer')p=run.trainerDecisions?.[o.trainerId]==='learn'?1:0;
  else if(o.type==='fight-specific-trainer')p=run.trainerDecisions?.[o.trainerId]==='fight'?1:0;
  return {complete:p>=t,progress:p,target:t};
}
export function settleMaraQuest(slot,run){const q=slot?.tavernServices?.mara?.activeQuest;if(!q)return null;const ev=evaluateMaraQuest(q,run);return {questId:q.instanceId,label:q.label,description:q.description,...ev,status:ev.complete?'completed-pending-return':'incomplete',reward:ev.complete?clone(q.reward||{}):{onyx:0,chronicleProgress:0}};}
export function clearMaraQuestAfterCampaign(slot){const next=normalizeTavernServiceState(slot);next.tavernServices.mara.activeQuest=null;next.tavernServices.mara.offers=[];next.tavernServices.mara.offerCycle=-1;return next;}
export function lenderCandidatesFromRun(run){
  const carried=run?.inventory?.equipment||{};const history=new Set(run?.crafting?.equippedHistory||[]);return [...history].filter(id=>Number(carried?.[id]?.quantity||0)>0).sort();
}
export function selectReturnedLenderItem(slot,itemId){
  const next=clone(slot);const s=next.campaign?.settlement;if(!s)return{ok:false,error:'No campaign return is awaiting settlement.'};if(!['victory','return'].includes(s.outcome))return{ok:false,error:'Only a successful return can register a lender item.'};
  const candidates=s.lender?.candidates||[];if(!candidates.includes(itemId))return{ok:false,error:'That item was not eligible to be brought back from this campaign.'};s.lender={...(s.lender||{}),selectedItemId:itemId};return{ok:true,slot:next};
}
export function selectBorrowedLenderItem(slot,itemId,equipmentCatalog){
  let next=normalizeTavernServiceState(slot);if(next.campaign?.active||next.campaign?.settlement)return{ok:false,error:'Lender selection can only change between campaigns.'};
  if(!itemId){next.lender.selectedItemId=null;next.loadout.borrowedItem=null;return{ok:true,slot:next};}
  if(!next.lender.collection.includes(itemId))return{ok:false,error:'That item has not been registered in this Vessel’s lender collection.'};const item=(equipmentCatalog?.equipment||[]).find(e=>e.id===itemId);if(!item)return{ok:false,error:'That lender item no longer exists in the item catalogue.'};
  next.lender.selectedItemId=itemId;next.loadout.borrowedItem={id:item.id,name:item.name};return{ok:true,slot:next,item:clone(item)};
}
function successfulChecksFromHistory(hist=[]){return (hist||[]).filter(e=>['checkmark','no-checkmark'].includes(e.resolution?.type)&&e.resolution?.details?.outcome==='success').length;}
function defeatedSpecialFromHistory(hist=[],key){return (hist||[]).some(e=>e.resolution?.type==='victory'&&Boolean(e[key]));}
function materialTotal(materials={},baseline=null){let total=0;for(const [id,v] of Object.entries(materials||{})){if(String(v?.name||'').includes('SoulfireCore'))continue;const prior=baseline?Number(baseline?.[id]?.quantity||0):0;total+=Math.max(0,Number(v?.quantity||0)-prior);}return total;}
function materialDelta(materials={},baseline={},id){return Math.max(0,Number(materials?.[id]?.quantity||0)-Number(baseline?.[id]?.quantity||0));}
function filterDecisions(decisions={},ids=[]){const allowed=new Set(ids||[]),out={};for(const [id,v] of Object.entries(decisions||{}))if(allowed.has(id))out[id]=v;return out;}
export function summarizeRunAccomplishments(run){
  const current=run?.expedition||{},isBog=current.regionId==='bog-of-lost-souls',allDecisions=clone(run?.trainerDecisions||{}),regions={};
  if(isBog&&run?.regionSummaries?.forest){const f=run.regionSummaries.forest,h=f.history||[],shown=f.shownTrainerIds||[];regions.forest={highestDepth:Number(f.highestDepth||0),battlesWon:Number(f.battlesWon||0),successfulChecks:successfulChecksFromHistory(h),craftedItems:Number(f.craftedItems||0),trainerEncounters:shown.length,ordinaryMaterialsCollected:materialTotal(f.materialsSnapshot||{}),minibossDefeated:defeatedSpecialFromHistory(h,'miniboss'),bossDefeated:defeatedSpecialFromHistory(h,'boss'),forestCleared:Boolean(f.cleared),trainerDecisions:filterDecisions(allDecisions,shown),shownTrainerIds:clone(shown)};}
  const hist=current.history||[],shown=current.shownTrainerIds||[];
  if(current.regionId==='forest'){regions.forest={highestDepth:Number(current.depth||0),battlesWon:Number(run?.metrics?.battlesWon||0),successfulChecks:successfulChecksFromHistory(hist),craftedItems:(run?.crafting?.crafted||[]).length,trainerEncounters:shown.length,ordinaryMaterialsCollected:materialTotal(run?.inventory?.materials||{}),minibossDefeated:defeatedSpecialFromHistory(hist,'miniboss'),bossDefeated:defeatedSpecialFromHistory(hist,'boss'),forestCleared:Boolean(run?.regionalProgress?.forestCleared||defeatedSpecialFromHistory(hist,'boss')),trainerDecisions:filterDecisions(allDecisions,shown),shownTrainerIds:clone(shown)};}
  if(isBog){const base=run?.regionBaselines?.['bog-of-lost-souls']||{},bm=run?.regionalMetrics?.bog||{};regions['bog-of-lost-souls']={highestDepth:Number(current.depth||0),battlesWon:Math.max(0,Number(run?.metrics?.battlesWon||0)-Number(base.battlesWon||0)),successfulChecks:successfulChecksFromHistory(hist),craftedItems:Math.max(0,(run?.crafting?.crafted||[]).length-Number(base.craftedItems||0)),trainerEncounters:shown.length,ordinaryMaterialsCollected:materialTotal(run?.inventory?.materials||{},base.materials||{}),darksteelCollected:materialDelta(run?.inventory?.materials||{},base.materials||{},'darksteel-shard'),minibossDefeated:defeatedSpecialFromHistory(hist,'miniboss'),bossDefeated:defeatedSpecialFromHistory(hist,'boss'),bogCleared:Boolean(run?.regionalProgress?.bogCleared||defeatedSpecialFromHistory(hist,'boss')),trainerDecisions:filterDecisions(allDecisions,shown),shownTrainerIds:clone(shown),negativeStatusesApplied:Number(bm.negativeStatusesApplied||0),poisonStatusesApplied:Number(bm.poisonStatusesApplied||0),negativeEffectsSuffered:Number(bm.negativeEffectsSuffered||0),negativeEffectsExpired:Number(bm.negativeEffectsExpired||0),enemiesDefeatedWithTwoStatuses:Number(bm.enemiesDefeatedWithTwoStatuses||0),enemiesDefeatedWithThreeStatuses:Number(bm.enemiesDefeatedWithThreeStatuses||0),undeadSpiritsDefeated:Number(bm.undeadSpiritsDefeated||0),lesserWitchesDefeated:Number(bm.lesserWitchesDefeated||0),banditCampsDefeated:Number(bm.banditCampsDefeated||0)};}
  const forest=regions.forest||{highestDepth:0,battlesWon:0,successfulChecks:0,craftedItems:0,trainerEncounters:0,ordinaryMaterialsCollected:0,minibossDefeated:false,bossDefeated:false,forestCleared:false,trainerDecisions:{},shownTrainerIds:[]};
  return {...forest,regions,performance:clone(run?.party||[]),bogCleared:Boolean(regions['bog-of-lost-souls']?.bogCleared)};
}
function recruitConditionMet(c,a){const t=Number(c.target||1);if(c.type==='highest-depth')return a.highestDepth>=t;if(c.type==='battles-won')return a.battlesWon>=t;if(c.type==='successful-checks')return a.successfulChecks>=t;if(c.type==='crafted-items')return a.craftedItems>=t;if(c.type==='trainer-encounters')return a.trainerEncounters>=t;if(c.type==='ordinary-materials-collected')return a.ordinaryMaterialsCollected>=t;return false;}
export function awardRecruitments(account,accomplishments,tavernServices){
  const next=clone(account);next.unlocks=next.unlocks||{};const owned=new Set(next.unlocks.tavernAdventurers||[]),newIds=[];
  for(const r of tavernServices?.tavernAdventurerRecruitment?.remaining||[])if(!owned.has(r.id)&&recruitConditionMet(r.condition,accomplishments)){owned.add(r.id);newIds.push(r.id);}next.unlocks.tavernAdventurers=[...owned];return{account:next,newIds};
}

function forestRecord(account){
  const f=account?.records?.forestAccomplishments||{};return {
    campaignsSettled:Math.max(0,Number(f.campaignsSettled||0)),highestDepth:Math.max(0,Number(f.highestDepth||0)),battlesWon:Math.max(0,Number(f.battlesWon||0)),successfulChecks:Math.max(0,Number(f.successfulChecks||0)),craftedItems:Math.max(0,Number(f.craftedItems||0)),trainerEncounters:Math.max(0,Number(f.trainerEncounters||0)),ordinaryMaterialsCollected:Math.max(0,Number(f.ordinaryMaterialsCollected||0)),minibossesDefeated:Math.max(0,Number(f.minibossesDefeated||0)),bossesDefeated:Math.max(0,Number(f.bossesDefeated||0)),forestsCleared:Math.max(0,Number(f.forestsCleared||0))
  };
}
export function recordForestAccomplishments(account,accomplishments={}){
  const next=clone(account);next.records=next.records||{};const f=forestRecord(next);
  f.campaignsSettled+=1;f.highestDepth=Math.max(f.highestDepth,Number(accomplishments.highestDepth||0));f.battlesWon+=Number(accomplishments.battlesWon||0);f.successfulChecks+=Number(accomplishments.successfulChecks||0);f.craftedItems+=Number(accomplishments.craftedItems||0);f.trainerEncounters+=Number(accomplishments.trainerEncounters||0);f.ordinaryMaterialsCollected+=Number(accomplishments.ordinaryMaterialsCollected||0);f.minibossesDefeated+=accomplishments.minibossDefeated?1:0;f.bossesDefeated+=accomplishments.bossDefeated?1:0;f.forestsCleared+=accomplishments.forestCleared?1:0;next.records.forestAccomplishments=f;return next;
}
function bogRecord(account){const b=account?.records?.bogAccomplishments||{};return{campaignsSettled:Math.max(0,Number(b.campaignsSettled||0)),highestDepth:Math.max(0,Number(b.highestDepth||0)),battlesWon:Math.max(0,Number(b.battlesWon||0)),successfulChecks:Math.max(0,Number(b.successfulChecks||0)),craftedItems:Math.max(0,Number(b.craftedItems||0)),trainerEncounters:Math.max(0,Number(b.trainerEncounters||0)),ordinaryMaterialsCollected:Math.max(0,Number(b.ordinaryMaterialsCollected||0)),darksteelCollected:Math.max(0,Number(b.darksteelCollected||0)),minibossesDefeated:Math.max(0,Number(b.minibossesDefeated||0)),bossesDefeated:Math.max(0,Number(b.bossesDefeated||0)),bogsCleared:Math.max(0,Number(b.bogsCleared||0)),negativeStatusesApplied:Math.max(0,Number(b.negativeStatusesApplied||0)),poisonStatusesApplied:Math.max(0,Number(b.poisonStatusesApplied||0)),negativeEffectsSuffered:Math.max(0,Number(b.negativeEffectsSuffered||0)),negativeEffectsExpired:Math.max(0,Number(b.negativeEffectsExpired||0)),enemiesDefeatedWithTwoStatuses:Math.max(0,Number(b.enemiesDefeatedWithTwoStatuses||0)),enemiesDefeatedWithThreeStatuses:Math.max(0,Number(b.enemiesDefeatedWithThreeStatuses||0)),undeadSpiritsDefeated:Math.max(0,Number(b.undeadSpiritsDefeated||0)),lesserWitchesDefeated:Math.max(0,Number(b.lesserWitchesDefeated||0)),banditCampsDefeated:Math.max(0,Number(b.banditCampsDefeated||0))};}
export function recordBogAccomplishments(account,a={}){const next=clone(account);next.records=next.records||{};const b=bogRecord(next);b.campaignsSettled+=1;b.highestDepth=Math.max(b.highestDepth,Number(a.highestDepth||0));for(const key of ['battlesWon','successfulChecks','craftedItems','trainerEncounters','ordinaryMaterialsCollected','darksteelCollected','negativeStatusesApplied','poisonStatusesApplied','negativeEffectsSuffered','negativeEffectsExpired','enemiesDefeatedWithTwoStatuses','enemiesDefeatedWithThreeStatuses','undeadSpiritsDefeated','lesserWitchesDefeated','banditCampsDefeated'])b[key]+=Number(a[key]||0);b.minibossesDefeated+=a.minibossDefeated?1:0;b.bossesDefeated+=a.bossDefeated?1:0;b.bogsCleared+=a.bogCleared?1:0;next.records.bogAccomplishments=b;return next;}
function regionalRequirementProgress(account,req={}){const f=forestRecord(account),b=bogRecord(account),records=account?.records||{};switch(req.type){case'highest-depth':return f.highestDepth;case'battles-won':return f.battlesWon;case'successful-checks':return f.successfulChecks;case'crafted-items':return f.craftedItems;case'ordinary-materials-collected':return f.ordinaryMaterialsCollected;case'trainer-encounters':return Math.max(f.trainerEncounters,(records.trainersEncountered||[]).length);case'trainers-fought':return (records.trainersFought||[]).length;case'trainers-learned-from':return (records.trainersLearnedFrom||[]).length;case'minibosses-defeated':return Math.max(f.minibossesDefeated,Number(records.minibossesDefeated||0));case'bosses-defeated':return Math.max(f.bossesDefeated,Number(records.bossesDefeated||0));case'forests-cleared':return Math.max(f.forestsCleared,account?.history?.forestCleared?1:0);case'bog-highest-depth':return b.highestDepth;case'bog-battles-won':return b.battlesWon;case'bog-successful-checks':return b.successfulChecks;case'bog-crafted-items':return b.craftedItems;case'bog-negative-effects-suffered':return b.negativeEffectsSuffered;case'bog-negative-effects-expired':return b.negativeEffectsExpired;case'bog-two-status-defeats':return b.enemiesDefeatedWithTwoStatuses;case'bog-three-status-defeats':return b.enemiesDefeatedWithThreeStatuses;case'bog-negative-statuses-applied':return b.negativeStatusesApplied;case'bog-poison-statuses-applied':return b.poisonStatusesApplied;case'bog-undead-spirits-defeated':return b.undeadSpiritsDefeated;case'bog-lesser-witches-defeated':return b.lesserWitchesDefeated;case'bog-bandit-camps-defeated':return b.banditCampsDefeated;case'bog-darksteel-collected':return b.darksteelCollected;case'bog-minibosses-defeated':return b.minibossesDefeated;case'bogs-cleared':return Math.max(b.bogsCleared,account?.history?.bogCleared?1:0);default:return 0;}}
export function regionalRaceUnlockState(account,entry={},regionId='forest'){const req=entry.requirement||{},target=Math.max(1,Number(req.target||1)),progress=regionalRequirementProgress(account,req);return{race:entry.race||'',regionId,regionName:regionId==='bog-of-lost-souls'?'Bog of Lost Souls':'Forest',met:progress>=target,progress,target,label:req.label||'Complete the regional requirement.',unlocked:(account?.unlocks?.races||[]).includes(entry.race)};}
export function awardRegionalRaceUnlocks(account,tavernServices){const next=clone(account);next.unlocks=next.unlocks||{};const owned=new Set(next.unlocks.races||[]),newRaces=[];const groups=tavernServices?.regionalRaceUnlocks||{};for(const list of [groups.forest||[],groups['bog-of-lost-souls']||[]])for(const entry of list){const req=entry.requirement||{},target=Math.max(1,Number(req.target||1));if(!owned.has(entry.race)&&regionalRequirementProgress(next,req)>=target){owned.add(entry.race);newRaces.push(entry.race);}}next.unlocks.races=[...owned];return{account:next,newRaces};}

export function keptImpressionShopRequirementState(account,offer={}){const req=offer.requirement||{},target=Math.max(1,Number(req.target||1)),progress=regionalRequirementProgress(account,req),region=offer.region==='bog-of-lost-souls'?'Bog':'Forest';return{met:progress>=target,progress,target,label:req.label||`Complete the listed ${region} requirement.`,region};}
export function purchaseKeptImpressionBoon(account,keptId,{tavernServices,keptEntries=[]}={}){
  const offer=(tavernServices?.keptImpressionShop?.offers||[]).find(x=>x.keptId===keptId);if(!offer)return {ok:false,error:'That Kept Impression is not currently offered for purchase.'};
  const entry=(keptEntries||[]).find(x=>x.id===keptId);if(!entry)return {ok:false,error:'That Kept Impression no longer exists in the canonical catalogue.'};
  const next=clone(account);next.unlocks=next.unlocks||{};const owned=new Set(next.unlocks.keptImpressions||[]);if(owned.has(keptId))return {ok:false,error:'That Kept Impression is already kept by this account.'};
  const requirement=keptImpressionShopRequirementState(next,offer);if(!requirement.met)return {ok:false,error:`${requirement.region} requirement not met: ${requirement.label} (${Math.min(requirement.progress,requirement.target)} / ${requirement.target}).`};
  const cost=Math.max(0,Math.trunc(Number(offer.onyxCost||0)));const balance=Math.max(0,Math.trunc(Number(next.currencies?.onyx||0)));if(balance<cost)return {ok:false,error:`Not enough Onyx. ${entry.name} costs ${cost} Onyx.`};
  next.currencies={...(next.currencies||{}),onyx:balance-cost};owned.add(keptId);next.unlocks.keptImpressions=[...owned];return {ok:true,account:next,entry,offer:clone(offer),remainingOnyx:balance-cost};
}

export function buildRecords(account,slot,tavernAdventurers){
  const campaigns=slot?.history?.campaigns||[];const records=account?.records||{},forest=forestRecord(account),bog=bogRecord(account);const recruited=new Set(account?.unlocks?.tavernAdventurers||[]);return {campaignsCompleted:campaigns.length,victories:campaigns.filter(c=>c.outcome==='victory'||c.outcome==='return').length,defeats:campaigns.filter(c=>c.outcome==='defeat').length,highestForestDepth:forest.highestDepth,highestBogDepth:bog.highestDepth,forestCleared:Boolean(account?.history?.forestCleared),bogCleared:Boolean(account?.history?.bogCleared),bossesDefeated:Number(records.bossesDefeated||0),minibossesDefeated:Number(records.minibossesDefeated||0),trainersEncountered:unique(records.trainersEncountered),trainersFought:unique(records.trainersFought),trainersLearnedFrom:unique(records.trainersLearnedFrom),subclassesDiscovered:(account?.unlocks?.subclasses||[]).length,tavernAdventurersRecruited:recruited.size,tavernAdventurerTotal:(tavernAdventurers?.entries||[]).length,notableCombat:clone(records.notableCombat||{})};
}
