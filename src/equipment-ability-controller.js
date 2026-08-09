import { appendCombatLog, finalizeCombatOutcome, getAbilityCooldown, getCombatActor, setAbilityCooldown } from './combat-controller.js';
import { resolveDamageComponent, resolveHealComponent, resolveShieldComponent } from './combat-resolution.js';

function clone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function living(actor){return Number(actor?.resources?.hp||0)>0;}
function actorAbilities(actor){return Array.isArray(actor?.equipmentAbilities)?actor.equipmentAbilities:[];}
function legalTargets(combat,actor,mode){
  if(mode==='single-enemy')return (combat.actors||[]).filter(a=>a.side!==actor.side&&living(a));
  if(mode==='single-ally')return (combat.actors||[]).filter(a=>a.side===actor.side&&living(a));
  if(mode==='self')return [actor].filter(living);
  return [];
}
export function listUsableEquipmentAbilities(combat,actorId){
  const actor=getCombatActor(combat,actorId);if(!actor)return [];
  return actorAbilities(actor).map(ability=>({...clone(ability),cooldownRemaining:getAbilityCooldown(combat,actor.id,ability.id),effectiveEnergyCost:Math.max(0,Number(ability.energyCost||0))}));
}
export function executeEquipmentAbility(slot,{abilityId,targetId,rng=Math.random,allowAi=false}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:false,error:'No active combat.'};
  const next=clone(slot),combat=next.campaign.state.combat;
  if(combat.state!=='active'||!combat.turn||combat.turn.actionTaken)return {ok:false,error:'No unused combat action is available.'};
  const actor=getCombatActor(combat,combat.turn.actorId);if(!actor||!living(actor)||(!allowAi&&actor.control!=='player'))return {ok:false,error:'It is not a legal equipment-action turn.'};
  const ability=actorAbilities(actor).find(a=>a.id===abilityId);if(!ability)return {ok:false,error:'That equipment ability is not currently granted by this combatant’s loadout.'};
  const cooldown=getAbilityCooldown(combat,actor.id,ability.id);if(cooldown>0)return {ok:false,error:`Cooldown: ${cooldown} turn(s) remaining.`};
  const energyCost=Math.max(0,Number(ability.energyCost||0));if(Number(actor.resources?.energy||0)<energyCost)return {ok:false,error:`Requires ${energyCost} Energy.`};
  const targets=legalTargets(combat,actor,ability.targetMode),target=targets.find(a=>a.id===targetId)||null;
  if(targets.length&&!target)return {ok:false,error:'Choose a legal target.'};
  actor.resources.energy=Math.max(0,Number(actor.resources.energy||0)-energyCost);
  const results=[];
  for(const component of ability.components||[]){
    if(component.type==='damage'&&target){const r=resolveDamageComponent(next,combat,actor,target,ability,component,{rng});results.push({type:'damage',targetId:target.id,...r});}
    if(component.type==='heal'&&target){const r=resolveHealComponent(next,combat,actor,target,ability,component,{rng});results.push({type:'heal',targetId:target.id,...r});}
    if(component.type==='shield'&&target){const r=resolveShieldComponent(combat,actor,target,ability,component);results.push({type:'shield',targetId:target.id,...r});}
  }
  setAbilityCooldown(combat,actor.id,ability.id,Math.max(0,Number(ability.cooldown||0)));
  combat.turn.actionTaken=true;combat.turn.actionType='equipment-ability';combat.turn.actionPayload={abilityId:ability.id,targetId:target?.id||null,sourceItemId:ability.sourceItemId||null};combat.turn.canEndTurn=true;
  appendCombatLog(combat,{type:'equipment-ability',round:combat.round,actorId:actor.id,abilityId:ability.id,abilityName:ability.name,sourceItemId:ability.sourceItemId||null,sourceItemName:ability.sourceItemName||null,energySpent:energyCost,results:clone(results),at:new Date().toISOString()},{presentation:true});
  const outcome=finalizeCombatOutcome(combat);
  return {ok:true,slot:next,combat:clone(combat),ability:clone(ability),results,outcome};
}
