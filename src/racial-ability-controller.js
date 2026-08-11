import { appendCombatLog, finalizeCombatOutcome, getAbilityCooldown, getCombatActor, setAbilityCooldown } from './combat-controller.js';
import { applyStatus, resolveDamageComponent, resolvePercentOfActualDamageHeal } from './combat-resolution.js';

function clone(v){return v==null?v:(typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v)));}
function living(a){return Number(a?.resources?.hp||0)>0;}
function enemies(combat,actor){return (combat?.actors||[]).filter(a=>a.side!==actor.side&&living(a));}
function realAllies(combat,actor){return (combat?.actors||[]).filter(a=>a.side===actor.side&&a.real&&living(a));}
function highestCoreStat(actor){return Math.max(0,...['STR','DEX','CON','INT','FTH','CHA','LCK'].map(k=>Number(actor?.stats?.[k]||0)));}
function hasHolyDragonbloodedAwakening(actor){return (actor?.keptImpressions||[]).includes('KI-267')&&String(actor?.keptImpressionChoices?.['KI-267']?.damageType||'').trim()==='Holy';}
function durationForTarget(target,turns){return {mode:'actor-turn-end',actorId:target.id,remaining:Math.max(1,Number(turns||1)),appliedTurn:Number(target.turnControl?.turnsStarted||0)};}

const ORGAN_KITS=Object.freeze({
  'furnace-lung':Object.freeze({base:11,damageType:'Fire',targetMode:'single-enemy'}),
  rime:Object.freeze({base:8,damageType:'Cold',targetMode:'all-enemies'}),
  storm:Object.freeze({base:8,damageType:'Lightning',targetMode:'up-to-two-enemies'}),
  venom:Object.freeze({base:7,damageType:'Poison',targetMode:'single-enemy'}),
  resonance:Object.freeze({base:11,damageType:'Force',targetMode:'single-enemy',unblockable:true}),
  'radiant-crucible':Object.freeze({base:9,damageType:'Holy',targetMode:'single-enemy'})
});

function withRuntime(actor,ability){
  const kit=ORGAN_KITS[ability?.organId];
  if(!kit)return null;
  const scale=1+highestCoreStat(actor)*.012;
  const radiantAwakened=ability?.organId==='radiant-crucible'&&hasHolyDragonbloodedAwakening(actor);
  const organEffectiveness=ability?.organId==='radiant-crucible'?(radiantAwakened?1:.5):1;
  return {...clone(ability),...kit,baseDamage:kit.base,organEffectiveness,radiantAwakened,scaledBaseDamage:kit.base*scale*organEffectiveness,effectiveEnergyCost:Math.max(0,Number(ability.energyCost||3)),cooldown:Math.max(0,Number(ability.cooldown||6)),tags:['racial','draconic-organ','rhazekai-organ']};
}

export function listUsableRacialAbilities(combat,actorId){
  const actor=getCombatActor(combat,actorId);if(!actor)return [];
  return (actor.racialAbilities||[]).map(a=>withRuntime(actor,a)).filter(Boolean).map(a=>({...a,cooldownRemaining:getAbilityCooldown(combat,actor.id,a.id)}));
}

function status(combat,target,source,{id,kind,turns,stacks=1}){
  return applyStatus(combat,target.id,{id,sourceActorId:source.id,negative:true,removable:true,duration:durationForTarget(target,turns),memory:{statusKind:kind,stacks},stacking:stacks>1?'stack-refresh':'refresh'});
}

function resolveOne(slot,combat,actor,target,ability,rng){
  const component={type:'damage',base:ability.scaledBaseDamage,damageType:ability.damageType,scaling:{},unblockable:Boolean(ability.unblockable)};
  return resolveDamageComponent(slot,combat,actor,target,ability,component,{rng,unblockable:Boolean(ability.unblockable)});
}

export function executeRacialAbility(slot,{abilityId,targetId,secondaryTargetId=null,rng=Math.random}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:false,error:'No active combat.'};
  const next=clone(slot),combat=next.campaign.state.combat;
  if(combat.state!=='active'||!combat.turn||combat.turn.actionTaken)return {ok:false,error:'No unused combat action is available.'};
  const actor=getCombatActor(combat,combat.turn.actorId);if(!actor||!living(actor)||actor.control!=='player')return {ok:false,error:'It is not a legal racial-action turn.'};
  const ability=listUsableRacialAbilities(combat,actor.id).find(a=>a.id===abilityId);if(!ability)return {ok:false,error:'That racial ability is not available.'};
  if(ability.cooldownRemaining>0)return {ok:false,error:`Cooldown: ${ability.cooldownRemaining} turn(s) remaining.`};
  if(Number(actor.resources?.energy||0)<ability.effectiveEnergyCost)return {ok:false,error:`Requires ${ability.effectiveEnergyCost} Energy.`};
  const enemyList=enemies(combat,actor),primary=enemyList.find(a=>a.id===targetId)||null;
  if(ability.targetMode!=='all-enemies'&&!primary)return {ok:false,error:'Choose a legal target.'};
  actor.resources.energy=Math.max(0,Number(actor.resources.energy||0)-ability.effectiveEnergyCost);
  const results=[];
  const hitTarget=t=>{const r=resolveOne(next,combat,actor,t,ability,rng);results.push({type:'damage',targetId:t.id,...r});return r;};
  if(ability.organId==='rime'){
    for(const t of [...enemyList]){const r=hitTarget(t);if(r.hit&&Number(r.actualHpRemoved||0)>0&&living(t))status(combat,t,actor,{id:`rhazekai-rime:${actor.id}`,kind:'Slow',turns:1});}
  }else if(ability.organId==='storm'){
    const first=primary;const second=enemyList.find(a=>a.id===secondaryTargetId&&a.id!==first.id)||enemyList.find(a=>a.id!==first.id)||null;
    hitTarget(first);if(second&&living(second))hitTarget(second);
  }else{
    const r=hitTarget(primary);
    if(r.hit&&living(primary)&&ability.organId==='furnace-lung')status(combat,primary,actor,{id:`rhazekai-burn:${actor.id}`,kind:'Burn',turns:2,stacks:1});
    if(r.hit&&living(primary)&&ability.organId==='venom')status(combat,primary,actor,{id:`rhazekai-poison:${actor.id}`,kind:'Poison',turns:3,stacks:2});
    if(ability.organId==='radiant-crucible'&&Number(r.actualHpRemoved||0)>0){
      const allies=realAllies(combat,actor).sort((a,b)=>(Number(a.resources.hp)/Number(a.resources.maxHp))-(Number(b.resources.hp)/Number(b.resources.maxHp))||a.id.localeCompare(b.id));
      const healTarget=allies.find(a=>a.id!==actor.id)||allies[0]||actor;
      if(healTarget&&living(healTarget)){const heal=resolvePercentOfActualDamageHeal(next,combat,actor,healTarget,Number(r.actualHpRemoved||0),40,{ability,damageType:'Holy'});results.push({type:'heal',targetId:healTarget.id,...heal});}
    }
  }
  setAbilityCooldown(combat,actor.id,ability.id,ability.cooldown);
  combat.turn.actionTaken=true;combat.turn.actionType='racial-ability';combat.turn.actionPayload={abilityId:ability.id,targetId:primary?.id||null,secondaryTargetId:secondaryTargetId||null,organId:ability.organId};combat.turn.canEndTurn=true;
  appendCombatLog(combat,{type:'racial-ability',round:combat.round,actorId:actor.id,abilityId:ability.id,abilityName:ability.name,race:actor.race,organId:ability.organId,energySpent:ability.effectiveEnergyCost,results:clone(results),at:new Date().toISOString()},{presentation:true});
  const outcome=finalizeCombatOutcome(combat);
  return {ok:true,slot:next,combat:clone(combat),ability:clone(ability),results,outcome};
}
