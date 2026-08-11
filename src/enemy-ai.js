import { BASE_MAX_ENERGY } from './combat-math.js';
import { commitResolvedAiAction, endCombatTurn, getAbilityCooldown, getCombatActor, setAbilityCooldown, pendingEnergyCostAdd, consumeNextEnergyCostEffects, finalizeCombatOutcome, summonCombatActor, grantCombatShield, consumeCombatShield, syncCombatShield } from './combat-controller.js';
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
function enemyAbilityList(actor){const used=Math.max(0,Number(actor?.enemyAi?.revival?.revivalsUsed||0)),pct=hpPct(actor),mounted=!Boolean(actor?.combatMemory?.dismounted),sin=String(actor?.combatMemory?.currentSin||'');return (Array.isArray(actor?.enemyAbilities)?actor.enemyAbilities:[]).filter(a=>(!a.sinForm||a.sinForm===sin)&&Number(a.unlockAfterRevivals||0)<=used&&(!a.requiresMounted||mounted)&&(!a.requiresDismounted||!mounted)&&(a.maxHpPct==null||pct<=Number(a.maxHpPct))&&(a.minHpPct==null||pct>=Number(a.minHpPct)));}
function effectValue(actor,key){return (actor?.effects||[]).reduce((n,e)=>n+Number(e?.modifiers?.[key]||0),0);}
function enemyLifestealPct(actor,ability){const sinBonus=actor?.enemyTemplateId==='serevakh-sevenfold-regent'&&actor?.combatMemory?.currentSin==='Gluttony'?15:0;return Math.max(0,Number(ability?.lifestealPct||0)+Number(actor?.enemyAi?.bloodMoonLifestealPct||0)+effectValue(actor,'lifestealPct')+sinBonus);}
function enemyAbilityCost(actor,ability){const intrinsic=Math.max(0,Number(ability?.energyCost||0));return intrinsic+pendingEnergyCostAdd(actor,intrinsic);}
function abilityReady(actor,ability){return Number(actor.resources?.energy||0)>=enemyAbilityCost(actor,ability)&&getAbilityCooldown({actors:[actor]},actor.id,ability.id)===0;}

export function chooseEnemyAction(slot,{difficulty='Normal',rng=Math.random}={}){
  const combat=slot?.campaign?.state?.combat; const actor=getCombatActor(combat,combat?.currentActorId);
  if(!actor||actor.control!=='ai'||actor.side!=='enemy'||!alive(actor))return {type:'none'};
  const allAbilities=enemyAbilityList(actor);
  const abilities=allAbilities.filter(a=>abilityReady(actor,a));
  const profile=actor.enemyAi||{};
  if(profile.style==='divine-lich'){
    const currentEnergy=Math.max(0,Number(actor.resources?.energy||0));
    const maxEnergy=Math.max(1,Number(actor.resources?.maxEnergy||BASE_MAX_ENERGY));
    const partyCount=(combat.actors||[]).filter(a=>a.side==='party'&&alive(a)).length;
    const readyOffense=abilities.filter(a=>(a.components||[]).some(c=>c.type==='damage')).sort((a,b)=>Number(b.unlockAfterRevivals||0)-Number(a.unlockAfterRevivals||0)||Number(b.energyCost||0)-Number(a.energyCost||0)||String(a.id).localeCompare(String(b.id)));
    const unlockedOffense=allAbilities.filter(a=>(a.components||[]).some(c=>c.type==='damage')).sort((a,b)=>Number(b.unlockAfterRevivals||0)-Number(a.unlockAfterRevivals||0)||Number(b.energyCost||0)-Number(a.energyCost||0)||String(a.id).localeCompare(String(b.id)));
    const highestUnlocked=unlockedOffense[0]||null;
    const revelationChargeChance=Math.max(0,Math.min(100,Number(profile.revelationChargeChancePct??30)));
    if(readyOffense.length){
      const highestCost=Math.max(0,Number(highestUnlocked?.energyCost||0));
      const buildingForHigher=highestUnlocked&&highestCost>currentEnergy&&currentEnergy<maxEnergy;
      if(buildingForHigher&&unit(rng)*100<revelationChargeChance)return {type:'charge'};
      const aoe=readyOffense.find(a=>a.targetMode==='all-enemies');
      if(aoe&&partyCount>=2&&Number(aoe.energyCost||0)>=Number(readyOffense[0]?.energyCost||0)-1)return {type:'ability',ability:aoe};
      return {type:'ability',ability:readyOffense[0]};
    }
    const cheapest=Math.min(...unlockedOffense.map(a=>Number(a.energyCost||0)).filter(Number.isFinite));
    const chargeChance=Math.max(0,Math.min(100,Number(profile.chargeTowardHeavyChancePct??40)));
    if(Number.isFinite(cheapest)&&currentEnergy<cheapest&&currentEnergy<maxEnergy&&unit(rng)*100<chargeChance)return {type:'charge'};
    return {type:'basic-attack'};
  }
  if(['necropolis-cult-sacrificer','necropolis-cult-executioner'].includes(profile.style)){
    const fodder=(combat.actors||[]).filter(a=>a.side==='enemy'&&alive(a)&&a.id!==actor.id&&a.enemyAi?.necropolisFodder===true);
    const chargeBelow=Math.max(0,Number(profile.chargeBelowEnergy??2));
    const heavyChance=Math.max(0,Math.min(100,Number(profile.chargeTowardHeavyChancePct||0)));
    const currentEnergy=Math.max(0,Number(actor.resources?.energy||0));
    const futureRitual=allAbilities.some(a=>a.sacrificeRitual&&Number(a.sacrificeUndeadCount||1)<=fodder.length&&Number(a.energyCost||0)>currentEnergy&&Number(a.energyCost||0)<=chargeBelow);
    if(futureRitual&&heavyChance>0&&currentEnergy<chargeBelow&&currentEnergy<Number(actor.resources?.maxEnergy||BASE_MAX_ENERGY)&&unit(rng)*100<heavyChance)return {type:'charge'};
    const rituals=abilities.filter(a=>a.sacrificeRitual&&Number(a.sacrificeUndeadCount||1)<=fodder.length).sort((a,b)=>Number(b.sacrificeUndeadCount||1)-Number(a.sacrificeUndeadCount||1)||Number(b.energyCost||0)-Number(a.energyCost||0));
    if(rituals.length){const ability=rituals[0],count=Math.max(1,Number(ability.sacrificeUndeadCount||1));return {type:'necropolis-sacrifice',ability,fodderIds:fodder.slice(0,count).map(a=>a.id)};}
  }
  if(profile.style==='hell-serevakh'&&String(actor.combatMemory?.currentSin||'')==='Sloth'&&profile.slothUsesWaitBeforeCollapse){
    const collapse=abilities.find(a=>a.id==='serevakh-sloth-collapse');
    if(collapse&&Number(actor.combatMemory?.slothBank||0)>0)return {type:'ability',ability:collapse};
    const wait=abilities.find(a=>a.id==='serevakh-sloth-wait');
    if(wait)return {type:'ability',ability:wait};
    if(Number(actor.resources?.energy||0)<Number(actor.resources?.maxEnergy||BASE_MAX_ENERGY))return {type:'charge'};
  }
  if(profile.style==='plains-tenairah-heal-root'||profile.style==='plains-tenairah-shield-root'){const ability=abilities[0];if(ability)return {type:'ability',ability};}
  if(profile.style==='plains-tenairah-crown-root')return {type:'plains-crown-feed'};
  if(profile.style==='plains-warhorse'){
    const rider=(combat.actors||[]).find(a=>a.enemyTemplateId==='lord-varrek'&&alive(a));
    if(rider&&!(rider.effects||[]).some(e=>e.memory?.redirectTo===actor.id))return {type:'plains-warhorse-guard',riderId:rider.id};
  }
  if(profile.style==='plains-veiled-seer'){
    actor.combatMemory=actor.combatMemory||{};const mirrors=(combat.actors||[]).filter(a=>a.side==='enemy'&&a.real===false&&alive(a)&&a.summonOwnerId===actor.id&&a.enemyAi?.style==='blood-mirror');
    const cap=Math.max(1,Number(profile.mirrorCap||2)),limit=Math.max(cap,Number(profile.mirrorSummonLimit||6)),summoned=Math.max(0,Number(actor.combatMemory.mirrorsSummoned||0));
    if(mirrors.length<cap&&summoned<limit)return {type:'plains-seer-summon'};
    if(mirrors.length&&hpPct(actor)<=55)return {type:'plains-seer-consume',mirrorId:mirrors[0].id};
  }
  if(profile.style==='tower-colossus-main'){
    if(Number(actor.resources?.energy||0)>=Number(actor.resources?.maxEnergy||6))return {type:'tower-colossus-overload'};
    const arms=(combat.actors||[]).filter(a=>a.side==='enemy'&&alive(a)&&['aureofrost-left-arm','aureofrost-right-arm'].includes(a.enemyTemplateId));
    if(!arms.length)return {type:'tower-colossus-core-charge'};
    const last=actor.combatMemory?.lastEmpoweredArm;const chosen=arms.length>1?(arms.find(a=>a.id!==last)||arms[0]):arms[0];return {type:'tower-colossus-empower',armId:chosen.id};
  }
  if(profile.style==='tower-colossus-left'||profile.style==='tower-colossus-right'){
    const empowered=Boolean(actor.combatMemory?.colossusEmpowered);const wanted=profile.style==='tower-colossus-left'?(empowered?'aureofrost-left-aoe':'aureofrost-left-heal'):(empowered?'aureofrost-right-aoe':'aureofrost-right-shield');const ability=abilities.find(a=>a.id===wanted);if(ability)return {type:'ability',ability};
  } const allies=(combat.actors||[]).filter(a=>a.side==='enemy'&&alive(a));
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
  const currentEnergy=Math.max(0,Number(actor.resources?.energy||0));
  const signatureId=String(profile.maxEnergySignatureAbilityId||'');
  if(signatureId){
    const signature=abilities.find(a=>a.id===signatureId);
    const chance=Math.max(0,Math.min(100,Number(profile.maxEnergySignatureChancePct??100)));
    if(signature&&currentEnergy>=Number(signature.energyCost||0)&&unit(rng)*100<chance)return {type:'ability',ability:signature};
  }
  if(profile.preferHighestUnlockedAbilityAtMaxEnergy&&currentEnergy>=Number(profile.chargeBelowEnergy??actor.resources?.maxEnergy??BASE_MAX_ENERGY)){
    const unlocked=[...abilities].sort((a,b)=>Number(b.unlockAfterRevivals||0)-Number(a.unlockAfterRevivals||0)||Number(b.energyCost||0)-Number(a.energyCost||0));
    if(unlocked.length)return {type:'ability',ability:unlocked[0]};
  }
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
  const outcomes=[]; const sin=String(actor.combatMemory?.currentSin||'');
  for(const target of targets){
    let targetWasHit=false; let totalHpRemoved=0;
    for(const component of (ability.components||[]).filter(c=>c.type==='damage')){
      const limbEffect=(actor.effects||[]).find(e=>e.id==='ossuary-many-limbs');
      const extraLimbHits=ability.ossuaryLimbAttack?Math.max(0,Number(limbEffect?.memory?.extraLimbHits||0)):0;
      const hits=Math.max(1,Number(ability.hits||component.hits||1)+extraLimbHits);
      for(let i=0;i<hits;i++){
        const khPct=actor.enemyTemplateId==='kharvax-gatebound'?Math.max(0,3-(hpPct(actor)>75?3:hpPct(actor)>50?2:hpPct(actor)>25?1:0))*Number(ability.kharvaxBrokenChainBonusPct||0):0;
        const buffCount=(target.effects||[]).filter(e=>e&&!e.negative).length;
        const pridePct=ability.pridePunishBuffs?Math.min(32,buffCount*8):0;
        const lustPct=sin==='Lust'&&component.damageType==='Psychic'?25:0;
        const envyPct=ability.envyStatStrike?Math.min(30,Math.max(0,Number(actor.combatMemory?.envyCopiedValue||0))):0;
        const slothPct=ability.slothConsumeBank?Math.max(0,Number(actor.combatMemory?.slothBank||0))*20:0;
        const arsenalBonus=ability.royalWeaponAttack&&(actor.effects||[]).some(e=>e.id==='ossuary-royal-arsenal')?15:0;
        const finalDamagePct=(Number(ability.lowHpBonusPct||0)&&hpPct(target)<=30?Number(ability.lowHpBonusPct):0)+(Number(ability.shieldBonusPct||0)&&Number(target.resources?.shield||0)>0?Number(ability.shieldBonusPct):0)+(actor.combatMemory?.colossusEmpowered?Number(ability.colossusEmpoweredDamagePct||0):0)+khPct+pridePct+lustPct+envyPct+slothPct+arsenalBonus;
        const postFinalMultiplier=actor.enemyTemplateId==='serevakh-sevenfold-regent'&&sin==='Greed'&&actor.enemyAi?.greedsDebtActive?2:1;
        const result=resolveDamageComponent(next,combat,actor,target,ability,component,{rng,finalDamagePct,postFinalMultiplier,critChanceBonus:Number(ability.critChanceBonus||0),unblockable:Boolean(ability.unblockable)});
        outcomes.push({targetId:target.id,...result}); if(result.hit)targetWasHit=true; totalHpRemoved+=Number(result.actualHpRemoved||0);
      }
    }
    if(targetWasHit)applyDefinedEffect(combat,target,actor,ability.targetEffect);
    if(targetWasHit&&Number(ability.greedStealEnergy||0)>0){const stolen=Math.min(Number(target.resources?.energy||0),Number(ability.greedStealEnergy));target.resources.energy=Math.max(0,Number(target.resources.energy||0)-stolen);actor.resources.energy=Math.min(Number(actor.resources.maxEnergy||BASE_MAX_ENERGY),Number(actor.resources.energy||0)+stolen);outcomes.push({type:'energy-steal',targetId:target.id,amount:stolen});}
    if(targetWasHit&&Number(ability.greedStealShieldPct||0)>0){const before=syncCombatShield(target),requested=Math.max(0,Math.round(before*Number(ability.greedStealShieldPct)/100)),removed=consumeCombatShield(combat,target.id,requested).absorbed,gained=grantCombatShield(combat,actor.id,removed,{sourceActorId:target.id,abilityId:ability.id,tags:['Stolen Shield']});outcomes.push({type:'shield-steal',targetId:target.id,amount:gained,removed});}
    if(targetWasHit&&(ability.envyCopyBuff||ability.greedStealBuff)){const positive=(target.effects||[]).find(e=>e&&!e.negative&&Object.keys(e.modifiers||{}).length);if(positive){const copied={id:`${ability.envyCopyBuff?'envy':'greed'}-stolen-${positive.id||'buff'}`,negative:false,durationTurns:2,modifiers:clone(positive.modifiers||{}),memory:{statusKind:ability.envyCopyBuff?'Covetous Reflection':'Stolen Boon'}};applyDefinedEffect(combat,actor,actor,copied);if(ability.greedStealBuff)target.effects=target.effects.filter(e=>e!==positive);outcomes.push({type:ability.envyCopyBuff?'buff-copy':'buff-steal',targetId:target.id,buffId:positive.id||null});}}
    if(targetWasHit&&ability.gluttonyConsumeNegative){const negative=(target.effects||[]).find(e=>e?.negative);if(negative){target.effects=target.effects.filter(e=>e!==negative);const before=Number(actor.resources?.hp||0),amount=Math.round(Number(actor.resources?.maxHp||1)*.08);actor.resources.hp=Math.min(Number(actor.resources.maxHp||1),before+amount);outcomes.push({type:'status-consume-heal',targetId:target.id,statusId:negative.id||null,actualRestored:actor.resources.hp-before});}}
    const lsPct=enemyLifestealPct(actor,ability);if(lsPct>0&&totalHpRemoved>0)resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalHpRemoved,lsPct,{outgoingApplies:false,ability,healKind:'lifesteal',damageType:(ability.components||[]).find(c=>c.type==='damage')?.damageType||null});
  }
  if(ability.slothConsumeBank&&actor.combatMemory)actor.combatMemory.slothBank=0;
  return outcomes;
}
function executeSupportAbility(next,combat,actor,ability){
  const target=ability.targetMode==='self'?actor:ability.targetMode==='protected-ally'?protectedAlly(combat,actor):lowestHpAlly(combat,actor); const outcomes=[];
  for(const component of ability.components||[]){
    if(component.type==='heal')outcomes.push({type:'heal',targetId:target.id,...resolveHealComponent(next,combat,actor,target,ability,component)});
    if(component.type==='shield')outcomes.push({type:'shield',targetId:target.id,...resolveShieldComponent(combat,actor,target,ability,component)});
  }
  if(ability.slothBank){actor.combatMemory=actor.combatMemory||{};actor.combatMemory.slothBank=Math.min(3,Number(actor.combatMemory.slothBank||0)+1);outcomes.push({type:'sloth-bank',stacks:actor.combatMemory.slothBank});}
  return outcomes;
}
export function executeEnemyAction(slot,{difficulty='Normal',rng=Math.random}={}){
  if(!slot?.campaign?.active||!slot.campaign.state?.combat)return {ok:false,error:'No active combat.'};
  let next=clone(slot); let combat=next.campaign.state.combat; let actor=getCombatActor(combat,combat.currentActorId);
  if(!actor||actor.control!=='ai'||actor.side!=='enemy')return {ok:false,error:'The current actor is not an enemy AI combatant.'};
  if(combat.turn?.actionTaken)return {ok:false,error:'This enemy has already acted.'};
  const choice=chooseEnemyAction(next,{difficulty,rng}); let payload={};
  if(choice.type==='necropolis-sacrifice'){
    const ability=choice.ability;combat=next.campaign.state.combat;actor=getCombatActor(combat,combat.currentActorId);
    const victims=(choice.fodderIds||[]).map(id=>getCombatActor(combat,id)).filter(a=>a&&alive(a)&&a.enemyAi?.necropolisFodder===true);
    const required=Math.max(1,Number(ability.sacrificeUndeadCount||1));if(victims.length<required)return {ok:false,error:'The cult ritual no longer has enough undead to sacrifice.'};
    const intrinsicCost=Math.max(0,Number(ability.energyCost||0)),cost=enemyAbilityCost(actor,ability);if(Number(actor.resources.energy||0)<cost)return {ok:false,error:'Enemy cannot afford chosen sacrifice ritual.'};
    const sacrificed=[];for(const victim of victims.slice(0,required)){victim.combatMemory=victim.combatMemory||{};victim.combatMemory.necropolisSacrificed=true;victim.resources.hp=0;sacrificed.push(victim.id);}
    combat.metrics=combat.metrics||{};combat.metrics.necropolisSacrifices=Number(combat.metrics.necropolisSacrifices||0)+sacrificed.length;
    actor.resources.energy-=cost;consumeNextEnergyCostEffects(actor,intrinsicCost);
    let outcomes=[];if((ability.components||[]).some(c=>c.type==='damage'))outcomes=executeDamageAbility(next,combat,actor,ability,{difficulty,rng});else outcomes=executeSupportAbility(next,combat,actor,ability);
    applyDefinedEffect(combat,actor,actor,ability.selfEffect);setAbilityCooldown(combat,actor.id,ability.id,Number(ability.cooldown||0));
    const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:ability.id,name:ability.name,sacrificed,outcomes}});if(!committed.ok)return committed;const outcome=finalizeCombatOutcome(committed.slot.campaign.state.combat);
    return {ok:true,slot:committed.slot,action:{type:'necropolis-sacrifice',actorId:actor.id,abilityId:ability.id,sacrificed,outcomes},outcome};
  }
  if(choice.type==='plains-warhorse-guard'){
    const rider=getCombatActor(combat,choice.riderId);if(!rider||!alive(rider))return{ok:false,error:'The Nightblood Charger has no living rider to protect.'};rider.effects=rider.effects||[];rider.effects.push({id:`nightblood-guard-${combat.round}`,sourceActorId:actor.id,negative:false,removable:false,modifiers:{},memory:{redirectTo:actor.id,redirectHitsRemaining:1,damageReductionPct:10,statusKind:'Nightblood Intercept'},duration:null,stacking:'refresh'});const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'nightblood-intercept',name:'Nightblood Intercept',targetId:rider.id}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'plains-warhorse-guard',actorId:actor.id,riderId:rider.id}};
  }
  if(choice.type==='plains-seer-summon'){
    const party=(combat.actors||[]).filter(a=>a.side==='party'&&alive(a));if(!party.length)return{ok:false,error:'No living party member can be mirrored.'};const target=party.sort((a,b)=>hpPct(a)-hpPct(b)||a.id.localeCompare(b.id))[0],srcStats=target.stats||{},mirrorMax=Math.max(25,Math.round(Number(target.resources?.maxHp||80)*.35));const offensive=['STR','DEX','INT','CHA','LCK'].reduce((best,k)=>Number(srcStats[k]||0)>Number(srcStats[best]||0)?k:best,'STR');const psychic=['INT','CHA','LCK'].includes(offensive);const spec={id:'blood-mirror',name:`Blood Mirror of ${target.name}`,side:'enemy',control:'ai',real:false,level:Number(target.level||actor.level||20),stats:Object.fromEntries(['STR','DEX','CON','INT','FTH','CHA','LCK'].map(k=>[k,Math.max(0,Math.round(Number(srcStats[k]||0)*.7))])),maxHp:mirrorMax,maxEnergy:7,combatRole:'Summoned Blood Mirror',portraitAsset:null,enemyTemplateId:'blood-mirror',enemyAi:{style:'blood-mirror',affinities:[psychic?'Psychic':'Physical'],bloodMoonLifestealPct:Number(actor.enemyAi?.bloodMoonLifestealPct||0)},basicAttack:{name:'Reflected Wound',base:10,damageType:psychic?'Psychic':'Physical',scaling:{[offensive]:.009}},abilityIds:[],enemyAbilities:[],expReward:0,onyxReward:0,resistances:{}};const summoned=summonCombatActor(combat,spec,{ownerId:actor.id});if(!summoned.ok)return summoned;actor.combatMemory=actor.combatMemory||{};actor.combatMemory.mirrorsSummoned=Number(actor.combatMemory.mirrorsSummoned||0)+1;const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'seer-blood-mirror',name:'Blood Mirror',targetId:target.id,summonId:summoned.actor.id}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'plains-seer-summon',actorId:actor.id,targetId:target.id,summonId:summoned.actor.id}};
  }
  if(choice.type==='plains-seer-consume'){
    const mirror=getCombatActor(combat,choice.mirrorId);if(!mirror||!alive(mirror))return{ok:false,error:'No Blood Mirror is available to consume.'};mirror.resources.hp=0;const before=Number(actor.resources.hp||0),amount=Math.round(Number(actor.resources.maxHp||1)*.18);actor.resources.hp=Math.min(Number(actor.resources.maxHp||1),before+amount);const restored=actor.resources.hp-before;const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'seer-consume-mirror',name:'Consume Reflection',mirrorId:mirror.id,healing:restored}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'plains-seer-consume',actorId:actor.id,mirrorId:mirror.id,healing:restored}};
  }
  if(choice.type==='plains-crown-feed'){
    const sovereign=(combat.actors||[]).find(a=>a.enemyTemplateId==='tenairah'&&alive(a));if(!sovereign){const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'crown-root-feed',name:'Severed Crown Pulse'}});return committed.ok?{ok:true,slot:committed.slot,action:{type:'plains-crown-feed',actorId:actor.id}}:committed;}sovereign.resources.energy=Math.min(Number(sovereign.resources.maxEnergy||8),Number(sovereign.resources.energy||0)+2);sovereign.effects=sovereign.effects||[];sovereign.effects=sovereign.effects.filter(e=>e.id!=='crown-root-fed');sovereign.effects.push({id:'crown-root-fed',sourceActorId:actor.id,negative:false,removable:false,modifiers:{finalDamagePct:10},memory:{statusKind:'Crown Root Feed'},duration:{mode:'actor-turn-end',actorId:sovereign.id,remaining:1,appliedTurn:Number(sovereign.turnControl?.turnsStarted||0)},stacking:'refresh'});const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'crown-root-feed',name:'Sovereign Power Feed',targetId:sovereign.id,energyGained:2,finalDamagePct:10}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'plains-crown-feed',actorId:actor.id,targetId:sovereign.id}};
  }
  if(choice.type==='tower-colossus-empower'){
    const arm=getCombatActor(combat,choice.armId);if(!arm||!alive(arm))return {ok:false,error:'The selected Colossus arm is unavailable.'};actor.combatMemory=actor.combatMemory||{};arm.combatMemory=arm.combatMemory||{};arm.combatMemory.colossusEmpowered=true;actor.combatMemory.lastEmpoweredArm=arm.id;actor.resources.energy=Math.min(Number(actor.resources.maxEnergy||6),Number(actor.resources.energy||0)+1);const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'aureofrost-command',name:`Empower ${arm.name}`,targetId:arm.id,energyGained:1}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'tower-colossus-empower',actorId:actor.id,armId:arm.id}};
  }
  if(choice.type==='tower-colossus-core-charge'){
    actor.resources.energy=Math.min(Number(actor.resources.maxEnergy||6),Number(actor.resources.energy||0)+1);const committed=commitResolvedAiAction(next,{type:'charge',payload:{name:'Emergency Core Charge',energyGained:1}});if(!committed.ok)return committed;return{ok:true,slot:committed.slot,action:{type:'tower-colossus-core-charge',actorId:actor.id}};
  }
  if(choice.type==='tower-colossus-overload'){
    const target=chooseAggroTarget(combat,{difficulty,rng});if(!target)return{ok:false,error:'No living party target.'};const shield=Math.max(0,Number(actor.resources?.shield||0)),pct=Math.max(0,Number(actor.enemyAi?.shieldDamageConversionPct||45));actor.resources.energy=0;actor.resources.shield=0;actor.resources.shieldLayers=[];const component={type:'damage',base:22+shield*pct/100,damageType:'Holy',scaling:{STR:.010,FTH:.008,CON:.004}};const result=resolveDamageComponent(next,combat,actor,target,{id:'aureofrost-overload',name:'Aureofrost Verdict'},component,{rng});const committed=commitResolvedAiAction(next,{type:'ability',payload:{abilityId:'aureofrost-overload',name:'Aureofrost Verdict',targetId:target.id,shieldConsumed:shield,result}});if(!committed.ok)return committed;const outcome=finalizeCombatOutcome(committed.slot.campaign.state.combat);return{ok:true,slot:committed.slot,action:{type:'tower-colossus-overload',actorId:actor.id,targetId:target.id,shieldConsumed:shield,result},outcome};
  }
  if(choice.type==='charge'){
    actor.resources.energy=Math.min(Number(actor.resources.maxEnergy||BASE_MAX_ENERGY),Number(actor.resources.energy||0)+1);
    const committed=commitResolvedAiAction(next,{type:'charge',payload:{energyGained:1}}); if(!committed.ok)return committed; next=committed.slot;
    return {ok:true,slot:next,action:{type:'charge',actorId:actor.id}};
  }
  if(choice.type==='basic-attack'){
    combat=next.campaign.state.combat; actor=getCombatActor(combat,combat.currentActorId); const target=chooseAggroTarget(combat,{difficulty,rng}); if(!target)return {ok:false,error:'No living party target.'};
    const component={type:'damage',base:Number(actor.basicAttack?.base||1),damageType:actor.basicAttack?.damageType||'Physical',scaling:clone(actor.basicAttack?.scaling||{})};
    const greedDebtMultiplier=actor.enemyTemplateId==='serevakh-sevenfold-regent'&&String(actor.combatMemory?.currentSin||'')==='Greed'&&actor.enemyAi?.greedsDebtActive?2:1;
    const result=resolveDamageComponent(next,combat,actor,target,{id:`${actor.enemyTemplateId||actor.id}-basic`,name:actor.basicAttack?.name||'Basic Attack'},component,{rng,postFinalMultiplier:greedDebtMultiplier});
    const basicLs=enemyLifestealPct(actor,null);if(basicLs>0&&Number(result.actualHpRemoved||0)>0)resolvePercentOfActualDamageHeal(next,combat,actor,actor,Number(result.actualHpRemoved||0),basicLs,{outgoingApplies:false,healKind:'lifesteal',damageType:component.damageType});
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
  if(ability.colossusConsumesEmpower&&actor.combatMemory)actor.combatMemory.colossusEmpowered=false;
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
