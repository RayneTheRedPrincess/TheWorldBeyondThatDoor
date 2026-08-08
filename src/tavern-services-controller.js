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
export function summarizeRunAccomplishments(run){
  const hist=run?.expedition?.history||[];let ordinaryMaterials=0;for(const v of Object.values(run?.inventory?.materials||{})){if(String(v?.name||'').includes('SoulfireCore'))continue;ordinaryMaterials+=Number(v?.quantity||0);}
  return {highestDepth:Number(run?.expedition?.depth||0),battlesWon:Number(run?.metrics?.battlesWon||0),successfulChecks:successfulChecks(run),craftedItems:(run?.crafting?.crafted||[]).length,trainerEncounters:(run?.expedition?.shownTrainerIds||[]).length,ordinaryMaterialsCollected:ordinaryMaterials,minibossDefeated:defeatedSpecial(run,'miniboss'),bossDefeated:defeatedSpecial(run,'boss'),forestCleared:Boolean(run?.regionalProgress?.forestCleared||defeatedSpecial(run,'boss')),trainerDecisions:clone(run?.trainerDecisions||{}),shownTrainerIds:clone(run?.expedition?.shownTrainerIds||[]),performance:clone(run?.party||[])};
}
function recruitConditionMet(c,a){const t=Number(c.target||1);if(c.type==='highest-depth')return a.highestDepth>=t;if(c.type==='battles-won')return a.battlesWon>=t;if(c.type==='successful-checks')return a.successfulChecks>=t;if(c.type==='crafted-items')return a.craftedItems>=t;if(c.type==='trainer-encounters')return a.trainerEncounters>=t;if(c.type==='ordinary-materials-collected')return a.ordinaryMaterialsCollected>=t;return false;}
export function awardRecruitments(account,accomplishments,tavernServices){
  const next=clone(account);next.unlocks=next.unlocks||{};const owned=new Set(next.unlocks.tavernAdventurers||[]),newIds=[];
  for(const r of tavernServices?.tavernAdventurerRecruitment?.remaining||[])if(!owned.has(r.id)&&recruitConditionMet(r.condition,accomplishments)){owned.add(r.id);newIds.push(r.id);}next.unlocks.tavernAdventurers=[...owned];return{account:next,newIds};
}
export function buildRecords(account,slot,tavernAdventurers){
  const campaigns=slot?.history?.campaigns||[];const records=account?.records||{};const recruited=new Set(account?.unlocks?.tavernAdventurers||[]);return {campaignsCompleted:campaigns.length,victories:campaigns.filter(c=>c.outcome==='victory'||c.outcome==='return').length,defeats:campaigns.filter(c=>c.outcome==='defeat').length,highestForestDepth:Math.max(0,...campaigns.map(c=>Number(c.highestDepth||0))),forestCleared:Boolean(account?.history?.forestCleared),bossesDefeated:Number(records.bossesDefeated||0),minibossesDefeated:Number(records.minibossesDefeated||0),trainersEncountered:unique(records.trainersEncountered),trainersFought:unique(records.trainersFought),trainersLearnedFrom:unique(records.trainersLearnedFrom),subclassesDiscovered:(account?.unlocks?.subclasses||[]).length,tavernAdventurersRecruited:recruited.size,tavernAdventurerTotal:(tavernAdventurers?.entries||[]).length,notableCombat:clone(records.notableCombat||{})};
}
