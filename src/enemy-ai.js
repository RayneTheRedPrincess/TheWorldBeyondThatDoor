import { BASE_MAX_ENERGY } from './combat-math.js';
import { commitResolvedAiAction, endCombatTurn, getAbilityCooldown, getCombatActor, setAbilityCooldown, pendingEnergyCostAdd, consumeNextEnergyCostEffects, finalizeCombatOutcome, summonCombatActor } from './combat-controller.js';
import { applyStatus, getActorDerivedCombatStats, resolveDamageComponent, resolveHealComponent, resolvePercentOfActualDamageHeal, resolveShieldComponent } from './combat-resolution.js';

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function unit(rng){const n=Number(rng());return Number.isFinite(n)?Math.min(.999999999,Math.max(0,n)):0;}
function alive(a){return Number(a?.resources?.hp||0)>0;}
function hpPct(a){return Number(a?.resources?.maxHp||0)>0?Number(a.resources.hp||0)/Number(a.resources.maxHp)*100:0;}
function weightedPick(entries,rng){const total=entries.reduce((s,e)=>s+e.weight,0);if(total<=0)return entries[0]?.actor||null;let r=unit(rng)*total;for(const e of entries){r-=e.weight;if(r<0)return e.actor;}return entries.at(-1)?.actor||null;}
function isSupport(actor){const role=String(actor?.combatRole||'').toLowerCase();return role.includes('support')||role.includes('healer')||['Cleric','Bard','Paladin','Druid'].includes(actor?.baseClass);}

export function chooseAggroTarget(combat,{difficulty='Normal',rng=Math.random}={}){
  const party=(combat?.actors||[]).filter(a=>a.side==='party'&&alive(a)); if(!party.length)return null;
  if(String(difficulty)==='Mean'){
    const vulnerable=party.filter(a=>isSupport(a)&&hpPct(a)<=35).sort((a,b)=>hpPct(a)-hpPct(b)||a.id.localeCompare(b.id));
    if(vulnerable.length)return vulnerable[0];
  }
  const weighted=party.map(actor=>({actor,weight:Math.max(.15,Number(getActorDerivedCombatStats(actor).aggroMultiplier||1))}));
  return weightedPick(weighted,rng);
}
function lowestHpAlly(combat,source){return (combat.actors||[]).filter(a=>a.side===source.side&&alive(a)).sort((a,b)=>hpPct(a)-hpPct(b)||a.id.localeCompare(b.id))[0]||source;}
function protectedAlly(combat,source){const wanted=String(source?.enemyAi?.protectedAllyTemplateId||'');return wanted?(combat.actors||[]).find(a=>a.side===source.side&&alive(a)&&a.enemyTemplateId===wanted)||lowestHpAlly(combat,source):lowestHpAlly(combat,source);}
function durationFor(target,turns){return {mode:'actor-turn-end',actorId:target.id,remaining:Number(turns||1),appliedTurn:Number(target.turnControl?.turnsStarted||0)};}
function applyDefinedEffect(combat,target,source,effect){if(!effect)return;applyStatus(combat,target.id,{id:effect.id,sourceActorId:source.id,negative:Boolean(effect.negative),modifiers:clone(effect.modifiers||{}),memory:clone(effect.memory||{}),removable:effect.removable!==false,duration:durationFor(target,effect.durationTurns||1),stacking:effect.stacking||'refresh'});}
function enemyAbilityList(actor){return Array.isArray(actor?.enemyAbilities)?actor.enemyAbilities:[];}
function enemyAbilityCost(actor,ability){const intrinsic=Math.max(0,Number(ability?.energyCost||0));return intrinsic+pendingEnergyCostAdd(actor,intrinsic);}
function abilityReady(actor,ability){return Number(actor.resources?.energy||0)>=enemyAbilityCost(actor,ability)&&getAbilityCooldown({actors:[actor]},actor.id,ability.id)===0;}

export function chooseEnemyAction(slot,{difficulty='Normal',rng=Math.random}={}){
  const combat=slot?.campaign?.state?.combat; const actor=getCombatActor(combat,combat?.currentActorId);
  if(!actor||actor.control!=='ai'||actor.side!=='enemy'||!alive(actor))return {type:'none'};
  const abilities=enemyAbilityList(actor).filter(a=>abilityReady(actor,a));
  const profile=actor.enemyAi||{}; const allies=(combat.actors||[]).filter(a=>a.side==='enemy'&&alive(a));
  const summon=abilities.find(a=>a.targetMode==='summon'&&a.summonTemplateId);
  if(summon){const cap=Math.max(1,Number(summon.summonCap||profile.summonCap||1));const living=(combat.actors||[]).filter(a=>a.real===false&&a.side==='enemy'&&alive(a)&&a.summonOwnerId===actor.id).length;if(living<cap)return {type:'ability',ability:summon};}
  const healTarget=protectedAlly(combat,actor);
  const heal=abilities.find(a=>['lowest-hp-ally','protected-ally'].includes(a.targetMode)&&(a.components||[]).some(c=>c.type==='heal')&&hpPct(a.targetMode==='protected-ally'?healTarget:lowestHpAlly(combat,actor))<=Number(profile.healThresholdPct||70));
  if(heal)return {type:'ability',ability:heal};
  const allyShieldTarget=protectedAlly(combat,actor);
  const allyShield=abilities.find(a=>['lowest-hp-ally','protected-ally'].includes(a.targetMode)&&(a.components||[]).some(c=>c.type==='shield')&&allyShieldTarget&&Number((a.targetMode==='protected-ally'?allyShieldTarget:lowestHpAlly(combat,actor)).resources?.shield||0)<=0&&hpPct(a.targetMode==='protected-ally'?allyShieldTarget:lowestHpAlly(combat,actor))<=Number(profile.shieldThresholdPct||85));
  if(allyShield)return {type:'ability',ability:allyShield};
  const shield=abilities.find(a=>a.targetMode==='self'&&(a.components||[]).some(c=>c.type==='shield')&&hpPct(actor)<=Number(profile.shieldThresholdPct||75)&&Number(actor.resources?.shield||0)<=0);
  if(shield)return {type:'ability',ability:shield};
  const chargeBelow=Number(profile.chargeBelowEnergy ?? 2);
  const heavyChargeChance=Math.max(0,Math.min(100,Number(profile.chargeTowardHeavyChancePct||0)));
  if(heavyChargeChance>0&&Number(actor.resources?.energy||0)<chargeBelow&&Number(actor.resources?.energy||0)<Number(actor.resources?.maxEnergy||BASE_MAX_ENERGY)&&unit(rng)*100<heavyChargeChance)return {type:'charge'};
  const aoe=abilities.filter(a=>a.targetMode==='all-enemies').sort((a,b)=>Number(b.energyCost)-Number(a.energyCost))[0];
  if(aoe&&(combat.actors||[]).filter(a=>a.side==='party'&&alive(a)).length>=2)return {type:'ability',ability:aoe};
  const offensive=abilities.filter(a=>(a.components||[]).some(c=>c.type==='damage')).sort((a,b)=>Number(b.energyCost)-Number(a.energyCost)||String(a.id).localeCompare(String(b.id)))[0];
  if(offensive)return {type:'ability',ability:offensive};
  if(Number(actor.resources?.energy||0)<chargeBelow&&Number(actor.resources?.energy||0)<Number(actor.resources?.maxEnergy||BASE_MAX_ENERGY))return {type:'charge'};
  return {type:'basic-attack'};
}

function executeDamageAbility(next,combat,actor,ability,{difficulty,rng}){
  const party=(combat.actors||[]).filter(a=>a.side==='party'&&alive(a));
  const targets=ability.targetMode==='all-enemies'?party:[chooseAggroTarget(combat,{difficulty,rng})].filter(Boolean);
  const outcomes=[];
  for(const target of targets){
    let targetWasHit=false; let totalHpRemoved=0;
    for(const component of (ability.components||[]).filter(c=>c.type==='damage')){
      const hits=Math.max(1,Number(ability.hits||component.hits||1));
      for(let i=0;i<hits;i++){
        const finalDamagePct=(Number(ability.lowHpBonusPct||0)&&hpPct(target)<=30?Number(ability.lowHpBonusPct):0)+(Number(ability.shieldBonusPct||0)&&Number(target.resources?.shield||0)>0?Number(ability.shieldBonusPct):0);
        const result=resolveDamageComponent(next,combat,actor,target,ability,component,{rng,finalDamagePct,critChanceBonus:Number(ability.critChanceBonus||0),unblockable:Boolean(ability.unblockable)});
        outcomes.push({targetId:target.id,...result}); if(result.hit)targetWasHit=true; totalHpRemoved+=Number(result.actualHpRemoved||0);
      }
    }
    if(targetWasHit)applyDefinedEffect(combat,target,actor,ability.targetEffect);
    if(Number(ability.lifestealPct||0)>0&&totalHpRemoved>0)resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalHpRemoved,Number(ability.lifestealPct),{outgoingApplies:false});
  }
  return outcomes;
}
function executeSupportAbility(next,combat,actor,ability){
  const target=ability.targetMode==='self'?actor:ability.targetMode==='protected-ally'?protectedAlly(combat,actor):lowestHpAlly(combat,actor); const outcomes=[];
  for(const component of ability.components||[]){
    if(component.type==='heal')outcomes.push({type:'heal',targetId:target.id,...resolveHealComponent(next,combat,actor,target,ability,component)});
    if(component.type==='shield')outcomes.push({type:'shield',targetId:target.id,...resolveShieldComponent(combat,actor,target,ability,component)});
  }
  return outcomes;
}
export function executeEnemyAction(slot,{difficulty='Normal',rng=Math.random}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:false,error:'No active combat.'};
  let next=clone(slot); let combat=next.campaign.state.combat; let actor=getCombatActor(combat,combat.currentActorId);
  if(!actor||actor.control!=='ai'||actor.side!=='enemy')return {ok:false,error:'The current actor is not an enemy AI combatant.'};
  if(combat.turn?.actionTaken)return {ok:false,error:'This enemy has already acted.'};
  const choice=chooseEnemyAction(next,{difficulty,rng}); let payload={};
  if(choice.type==='charge'){
    actor.resources.energy=Math.min(Number(actor.resources.maxEnergy||BASE_MAX_ENERGY),Number(actor.resources.energy||0)+1);
    const committed=commitResolvedAiAction(next,{type:'charge',payload:{energyGained:1}}); if(!committed.ok)return committed; next=committed.slot;
    return {ok:true,slot:next,action:{type:'charge',actorId:actor.id}};
  }
  if(choice.type==='basic-attack'){
    combat=next.campaign.state.combat; actor=getCombatActor(combat,combat.currentActorId); const target=chooseAggroTarget(combat,{difficulty,rng}); if(!target)return {ok:false,error:'No living party target.'};
    const component={type:'damage',base:Number(actor.basicAttack?.base||1),damageType:actor.basicAttack?.damageType||'Physical',scaling:clone(actor.basicAttack?.scaling||{})};
    const result=resolveDamageComponent(next,combat,actor,target,{id:`${actor.enemyTemplateId||actor.id}-basic`,name:actor.basicAttack?.name||'Basic Attack'},component,{rng});
    const committed=commitResolvedAiAction(next,{type:'basic-attack',payload:{targetId:target.id,name:actor.basicAttack?.name||'Basic Attack',result}}); if(!committed.ok)return committed;
    const outcome=finalizeCombatOutcome(committed.slot.campaign.state.combat);
    return {ok:true,slot:committed.slot,action:{type:'basic-attack',actorId:actor.id,targetId:target.id,result},outcome};
  }
  const ability=choice.ability; combat=next.campaign.state.combat; actor=getCombatActor(combat,combat.currentActorId);
  const intrinsicCost=Math.max(0,Number(ability.energyCost||0)),cost=enemyAbilityCost(actor,ability); if(Number(actor.resources.energy||0)<cost)return {ok:false,error:'Enemy cannot afford chosen ability.'};
  actor.resources.energy-=cost;consumeNextEnergyCostEffects(actor,intrinsicCost);
  let outcomes=[];
  if(ability.targetMode==='summon'){
    const template=(actor.enemyAi?.summonTemplates||[]).find(t=>t.id===ability.summonTemplateId);
    if(template){const summoned=summonCombatActor(combat,{...clone(template),side:'enemy',control:'ai'},{ownerId:actor.id});if(summoned.ok)outcomes=[{type:'summon',summonId:summoned.actor.id,name:summoned.actor.name}];}
  } else if((ability.components||[]).some(c=>c.type==='damage')) outcomes=executeDamageAbility(next,combat,actor,ability,{difficulty,rng});
  else outcomes=executeSupportAbility(next,combat,actor,ability);
  applyDefinedEffect(combat,actor,actor,ability.selfEffect);
  setAbilityCooldown(combat,actor.id,ability.id,Number(ability.cooldown||0));
  const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:ability.id,name:ability.name,outcomes}}); if(!committed.ok)return committed;
  const outcome=finalizeCombatOutcome(committed.slot.campaign.state.combat);
  return {ok:true,slot:committed.slot,action:{type:'ability',actorId:actor.id,abilityId:ability.id,outcomes},outcome};
}
export function resolveEnemyTurn(slot,{difficulty='Normal',rng=Math.random,now=new Date().toISOString()}={}){
  const acted=executeEnemyAction(slot,{difficulty,rng}); if(!acted.ok)return acted;
  if(acted.slot?.campaign?.state?.combat?.state==='complete')return {ok:true,slot:acted.slot,action:acted.action,outcome:acted.slot.campaign.state.combat.outcome||acted.outcome||null};
  const ended=endCombatTurn(acted.slot,{now}); if(!ended.ok)return ended;
  return {ok:true,slot:ended.slot,action:acted.action,outcome:ended.outcome||null};
}
export function resolveConsecutiveEnemyTurns(slot,{difficulty='Normal',rng=Math.random,maxTurns=12}={}){
  let next=clone(slot); const actions=[];
  for(let i=0;i<maxTurns;i++){
    const combat=next?.campaign?.state?.combat; if(!combat||combat.state==='complete')break;
    const actor=getCombatActor(combat,combat.currentActorId); if(!actor||actor.control!=='ai'||actor.side!=='enemy')break;
    const step=resolveEnemyTurn(next,{difficulty,rng}); if(!step.ok)return step; next=step.slot; actions.push(step.action); if(step.outcome)return {ok:true,slot:next,actions,outcome:step.outcome};
  }
  return {ok:true,slot:next,actions,outcome:next?.campaign?.state?.combat?.outcome||null};
}
