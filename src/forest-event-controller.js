import { combinedCharacterStats, maxHpFor } from './character-progression.js';
import { aggregateEquipmentEffects, applyEquipmentCoreStats } from './equipment-controller.js';
import { applyKeptPreCombatStats, keptMaxHpMultiplier } from './kept-impression-state.js';
import { resolveNoncombatCheckmark, resolveNoncombatWithoutCheckmark } from './expedition-controller.js';

const CORE_STATS=['STR','DEX','CON','INT','FTH','CHA','LCK'];
function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function currentCard(run){const ex=run?.expedition;return (ex?.cards||[]).find(c=>c.id===ex.selectedCardId)||null;}
function getTrainer(catalog,id){return (catalog?.entries||[]).find(t=>t.id===id)||null;}

function participantState(run,id){
  if(id==='vessel')return {kind:'vessel',state:run.character,name:run.party?.find(p=>p.id==='vessel')?.name||'Otherworlder',baseClass:run.configuration?.effectiveBaseClass||null,subclass:run.configuration?.effectiveSubclass||null,race:run.configuration?.race,equipment:run.configuration?.equipment||{},keptImpressions:run.configuration?.keptImpressions||[],keptChoices:run.configuration?.keptImpressionChoices||{},classless:Boolean(run.configuration?.classless)};
  const a=run.adventurers?.[id]; if(!a)return null;
  return {kind:'tavern-adventurer',state:a,name:a.name,baseClass:a.baseClass,subclass:a.subclass,race:null,equipment:a.equipment||{},keptImpressions:a.keptImpressions||[],keptChoices:a.keptImpressionChoices||{},classless:false};
}
function statsForParticipant(run,id,equipmentCatalog){
  const p=participantState(run,id); if(!p)return null;
  const raw=combinedCharacterStats(p.state||{}); let eq={ok:true,coreStats:{},modifiers:{},resistances:{}};
  if(equipmentCatalog){eq=aggregateEquipmentEffects(p.equipment,equipmentCatalog,{baseClass:p.baseClass||run.configuration?.permanentBaseClass,classless:p.classless});if(!eq.ok)return null;}
  const equipped=applyEquipmentCoreStats(raw,eq); return applyKeptPreCombatStats(equipped,p.subclass,p.keptImpressions,p.keptChoices);
}
function maxHpForParticipant(run,id,equipmentCatalog,progression){
  const p=participantState(run,id); const stats=statsForParticipant(run,id,equipmentCatalog); if(!p||!stats)return 1;
  const level=Math.max(1,Number(p.state?.level||1)); return Math.max(1,Math.round(maxHpFor({level,con:Number(stats.CON||0),progression})*keptMaxHpMultiplier(p.keptImpressions)));
}
function contextBonus(run,participantId,check){
  const p=participantState(run,participantId); if(!p)return {race:0,kept:0,total:0};
  const race=Number(check?.raceBonuses?.[p.race]||0); let kept=0; const map=check?.keptImpressionBonuses||{};
  for(const id of p.keptImpressions||[])kept+=Number(map[id]||0);
  return {race,kept,total:race+kept};
}
export function calculateForestCheck({run,participantId,check,equipmentCatalog}={}){
  if(!check||!CORE_STATS.includes(check.stat))return null; const stats=statsForParticipant(run,participantId,equipmentCatalog); if(!stats)return null;
  const relevant=Math.max(0,Number(stats[check.stat]||0)); const totalStats=Math.max(1,CORE_STATS.reduce((n,s)=>n+Math.max(0,Number(stats[s]||0)),0));
  const coreModifier=Math.floor(relevant/2); const specializationModifier=Math.floor(8*relevant/totalStats); const contextual=contextBonus(run,participantId,check); const modifier=coreModifier+specializationModifier+contextual.total; const dc=Number(check.dc||10);
  let successes=0; for(let roll=1;roll<=20;roll++)if(roll+modifier>=dc)successes++;
  return {stat:check.stat,relevantStat:relevant,totalCoreStats:totalStats,coreModifier,specializationModifier,raceModifier:contextual.race,keptModifier:contextual.kept,modifier,dc,successChancePct:successes*5};
}
export function getForestCheckParticipants(run,card,equipmentCatalog){
  if(!card?.check)return[]; const ids=['vessel',...Object.keys(run?.adventurers||{})];
  return ids.map(id=>{const p=participantState(run,id);if(p&&Number.isFinite(Number(p.state?.currentHp))&&Number(p.state.currentHp)<=0)return null;const calc=calculateForestCheck({run,participantId:id,check:card.check,equipmentCatalog});return p&&calc?{id,name:p.name,...calc}:null;}).filter(Boolean).sort((a,b)=>b.successChancePct-a.successChancePct||b.relevantStat-a.relevantStat||a.name.localeCompare(b.name));
}
function addInventoryMaterial(run,id,qty,crafting){if(!id||qty<=0)return;const def=(crafting?.materials||[]).find(m=>m.id===id);run.inventory=run.inventory||{};run.inventory.materials=run.inventory.materials||{};const cur=run.inventory.materials[id]||{name:def?.name||id,quantity:0};cur.quantity=Number(cur.quantity||0)+qty;run.inventory.materials[id]=cur;}
function addFood(run,id,qty,catalog){if(!id||qty<=0)return;const def=(catalog?.consumables||[]).find(c=>c.id===id);run.inventory=run.inventory||{};run.inventory.consumables=run.inventory.consumables||{};const cur=run.inventory.consumables[id]||{name:def?.name||id,quantity:0};cur.quantity=Number(cur.quantity||0)+qty;run.inventory.consumables[id]=cur;}
function adjustHp(run,participantId,pct,equipmentCatalog,progression){const p=participantState(run,participantId);if(!p||!pct)return 0;const max=maxHpForParticipant(run,participantId,equipmentCatalog,progression);const before=Number.isFinite(Number(p.state.currentHp))?Number(p.state.currentHp):max;const amount=Math.round(max*Math.abs(Number(pct))/100);const after=pct>0?Math.min(max,before+amount):Math.max(1,before-amount);p.state.currentHp=after;return after-before;}
function applyOutcomeEffects(next,participantId,effect,{equipmentCatalog,forestCrafting,progression}={}){
  const run=next.campaign.state; const applied={}; if(!effect)return applied;
  const onyx=Math.max(0,Number(effect.onyx||0)); if(onyx){run.rewards.carriedOnyx=Number(run.rewards.carriedOnyx||0)+onyx;run.rewards.chronicleProgress=Number(run.rewards.chronicleProgress||0)+onyx/25;applied.onyx=onyx;applied.chronicleProgress=onyx/25;}
  const loss=Math.max(0,Number(effect.onyxLoss||0)); if(loss){const before=Number(run.rewards.carriedOnyx||0);run.rewards.carriedOnyx=Math.max(0,before-loss);applied.onyxLost=before-run.rewards.carriedOnyx;}
  if(effect.materialId){const q=Math.max(0,Number(effect.materialQuantity||1));addInventoryMaterial(run,effect.materialId,q,forestCrafting);applied.material={id:effect.materialId,quantity:q};}
  if(effect.foodId){const q=Math.max(0,Number(effect.foodQuantity||1));addFood(run,effect.foodId,q,equipmentCatalog);applied.food={id:effect.foodId,quantity:q};}
  if(effect.healPct){applied.hpChange=(applied.hpChange||0)+adjustHp(run,participantId,Number(effect.healPct),equipmentCatalog,progression);}
  if(effect.hpLossPct){applied.hpChange=(applied.hpChange||0)+adjustHp(run,participantId,-Number(effect.hpLossPct),equipmentCatalog,progression);}
  if(effect.flag){run.eventFlags=run.eventFlags||{};run.eventFlags[effect.flag]=true;applied.flag=effect.flag;}
  return applied;
}
export function resolveForestEventCheck(slot,{participantId,rng=Math.random,equipmentCatalog=null,forestCrafting=null,progression=null}={}){
  if(!slot?.campaign?.active||!slot.campaign.state)return{ok:false,error:'No active campaign.'}; const run=slot.campaign.state; const ex=run.expedition;
  if(ex?.state!=='noncombat-pending'||!ex.encounter?.noncombat)return{ok:false,error:'No noncombat check is pending.'}; const card=currentCard(run);
  if(!card||card.trainer||!card.check)return{ok:false,error:'The selected event is not a stat-check event.'};
  const calc=calculateForestCheck({run,participantId,check:card.check,equipmentCatalog}); if(!calc)return{ok:false,error:'That real party member cannot attempt this check.'};
  const roll=Math.floor(unit(rng)*20)+1; const total=roll+calc.modifier; const success=total>=calc.dc; const criticalSuccess=roll===20&&success; const criticalFailure=roll===1&&!success;
  let next=clone(slot); const eventDef=card.eventId; // card carries the outcome payload injected by expedition selection
  const payload=ex.encounter.eventPayload||{}; const base=success?payload.success:payload.failure; const critical=criticalSuccess?payload.criticalSuccess:(criticalFailure?payload.criticalFailure:null);
  const applied=[applyOutcomeEffects(next,participantId,base,{equipmentCatalog,forestCrafting,progression}),applyOutcomeEffects(next,participantId,critical,{equipmentCatalog,forestCrafting,progression})];
  const details={eventId:eventDef,participantId,stat:calc.stat,relevantStat:calc.relevantStat,dc:calc.dc,roll,modifier:calc.modifier,total,successChancePct:calc.successChancePct,outcome:success?'success':'failure',criticalSuccess,criticalFailure,applied};
  const routed=card.checkmark?resolveNoncombatCheckmark(next,success?'success':'failure',{rng,details}):resolveNoncombatWithoutCheckmark(next,{note:success?'success':'failure',details});
  if(!routed.ok)return routed; routed.result=details; return routed;
}

export function chooseTrainerFight(slot,{trainerId}={}){
  if(!slot?.campaign?.active||!slot.campaign.state)return{ok:false,error:'No active campaign.'}; const next=clone(slot),run=next.campaign.state,ex=run.expedition,card=currentCard(run);
  if(ex?.state!=='noncombat-pending'||!card?.trainer||card.trainerId!==trainerId)return{ok:false,error:'That Trainer is not the current encounter.'};
  run.trainerDecisions=run.trainerDecisions||{}; if(run.trainerDecisions[trainerId])return{ok:false,error:'That Trainer encounter has already been decided.'};
  run.trainerDecisions[trainerId]='fight'; ex.encounter={...ex.encounter,source:'trainer',trainerId,combat:true,noncombat:false,state:'pending',resolution:null}; ex.state='combat-pending';
  return{ok:true,slot:next};
}
export function learnFromTrainer(slot,account,{trainerId,forestTrainers}={}){
  if(!slot?.campaign?.active||!slot.campaign.state)return{ok:false,error:'No active campaign.'}; const run=slot.campaign.state,ex=run.expedition,card=currentCard(run),trainer=getTrainer(forestTrainers,trainerId);
  if(ex?.state!=='noncombat-pending'||!card?.trainer||card.trainerId!==trainerId||!trainer)return{ok:false,error:'That Trainer is not the current encounter.'};
  const next=clone(slot); next.campaign.state.trainerDecisions=next.campaign.state.trainerDecisions||{}; if(next.campaign.state.trainerDecisions[trainerId])return{ok:false,error:'That Trainer encounter has already been decided.'}; next.campaign.state.trainerDecisions[trainerId]='learn';
  const nextAccount=clone(account||{}); nextAccount.unlocks=nextAccount.unlocks||{}; const prior=new Set(nextAccount.unlocks.subclasses||[]); const alreadyUnlocked=prior.has(trainer.subclass); prior.add(trainer.subclass); nextAccount.unlocks.subclasses=[...prior];
  const details={type:'trainer-learn',trainerId,trainerName:trainer.name,subclass:trainer.subclass,alreadyUnlocked}; const routed=resolveNoncombatWithoutCheckmark(next,{note:`Learned ${trainer.subclass}`,details}); if(!routed.ok)return routed;
  return{ok:true,slot:routed.slot,account:nextAccount,trainer:clone(trainer),alreadyUnlocked};
}
