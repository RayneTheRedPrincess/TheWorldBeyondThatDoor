import { getCombatActor, setAbilityCooldown, getAbilityCooldown, addCombatEffect, removeOneNegativeCombatEffect, pendingEnergyCostAdd, consumeNextEnergyCostEffects } from './combat-controller.js';
import { keptEnergyCost, keptCooldown } from './kept-impression-state.js';
import { keptBeforeAction, keptEnergySpent, keptOnNegativeRemoved } from './kept-impression-runtime.js';
import { resolveDamageComponent, resolveHealComponent, resolveShieldComponent, resolvePercentOfActualDamageHeal, hasNegativeEffect, applyStatus } from './combat-resolution.js';
import { gainResource, resourceValue, spendResource, setResourceValue } from './base-class-state.js';
import { isBaseResourceActive } from './subclass-state.js';

function clone(value) { return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
function living(actor) { return Number(actor?.resources?.hp || 0) > 0; }
function abilityList(catalog) { return Array.isArray(catalog?.abilities) ? catalog.abilities : Array.isArray(catalog) ? catalog : []; }
export function findBaseAbility(catalog, abilityId) { return abilityList(catalog).find(a => a.id === abilityId) || null; }
export function baseAbilityIdsForClass(catalog, baseClass) { return abilityList(catalog).filter(a => a.baseClass === baseClass).sort((a,b)=>a.slot-b.slot).map(a=>a.id); }

function actorHasAbility(actor, ability) {
  if (actor.baseClass === ability.baseClass) return true;
  return Array.isArray(actor.abilityIds) && actor.abilityIds.includes(ability.id);
}

function intrinsicEnergyCost(actor, ability) {
  let cost = Math.max(0, Number(ability?.energyCost || 0));
  if (actor.baseClass === 'Sorcerer' && ability.baseClass === 'Sorcerer' && resourceValue(actor) >= 4 && cost > 0) cost += 1;
  return cost;
}
function effectiveEnergyCost(actor, ability) {
  const intrinsic = intrinsicEnergyCost(actor, ability);
  return keptEnergyCost(actor, ability, intrinsic + pendingEnergyCostAdd(actor, intrinsic));
}

function resourceRequirement(actor, ability) {
  const req = ability.resourceCost;
  if (!req) return { ok: true, amount: 0 };
  const value = resourceValue(actor);
  return value >= Number(req.amount || 0) ? { ok: true, amount: Number(req.amount || 0) } : { ok: false, amount: Number(req.amount || 0), value };
}

function targetCandidates(combat, source, mode) {
  const allies = combat.actors.filter(a => a.side === source.side && living(a));
  const enemies = combat.actors.filter(a => a.side !== source.side && living(a));
  if (mode === 'single-enemy') return enemies;
  if (mode === 'single-ally') return allies.filter(a => a.id !== source.id);
  if (mode === 'ally-or-self' || mode === 'two-allies') return allies;
  if (mode === 'self') return [source];
  return [];
}

export function getAbilityAvailability(combat, actorId, ability, { targets = {}, form = null } = {}) {
  const actor = getCombatActor(combat, actorId);
  if (!actor || !living(actor)) return { ok: false, reason: 'The combatant cannot act.' };
  if (!ability) return { ok: false, reason: 'Unknown ability.' };
  if (!actorHasAbility(actor, ability)) return { ok: false, reason: 'This combatant does not know that ability.' };
  if (Number(actor.level || 0) < Number(ability.level || 0)) return { ok: false, reason: `Unlocks at Character Level ${ability.level}.` };
  if (getAbilityCooldown(combat, actor.id, ability.id) > 0) return { ok: false, reason: `Cooldown: ${getAbilityCooldown(combat, actor.id, ability.id)} turn(s) remaining.` };
  if (ability.requirements?.weaponType && actor.weaponType !== ability.requirements.weaponType) return { ok: false, reason: `${ability.requirements.weaponType} required.` };
  const energyCost = effectiveEnergyCost(actor, ability);
  if (Number(actor.resources.energy || 0) < energyCost) return { ok: false, reason: `Requires ${energyCost} Energy.` };
  const resource = resourceRequirement(actor, ability);
  if (!resource.ok) return { ok: false, reason: `Requires ${resource.amount} ${ability.resourceCost.resource}.` };
  if (ability.resourceCost?.resource === 'Quarry Marks' && actor.classState?.quarry?.targetId !== targets.primary) return { ok: false, reason: 'Quarry Marks can only be spent on the current Quarry.' };
  if (actor.classState?.baseClass === 'Druid' && ability.baseClass === 'Druid' && !actor.classState?.form && ability.name !== 'Turn the Cycle') return { ok: false, reason: 'Choose a starting Druid Form first.' };
  if (ability.targetMode === 'single-enemy' || ability.targetMode === 'single-ally' || ability.targetMode === 'ally-or-self') {
    const id = targets.primary;
    if (!id || !targetCandidates(combat, actor, ability.targetMode).some(a => a.id === id)) return { ok: false, reason: 'Choose a legal target.' };
  }
  if (ability.targetMode === 'two-allies') {
    if (!targets.shield || !targets.heal) return { ok: false, reason: 'Choose the Shield target and Heal target.' };
    const legal = new Set(targetCandidates(combat, actor, 'two-allies').map(a=>a.id));
    if (!legal.has(targets.shield) || !legal.has(targets.heal)) return { ok: false, reason: 'Choose legal ally targets.' };
  }
  if (ability.targetMode === 'choose-form') {
    if (!['Fang','Grove','Bloom'].includes(form)) return { ok: false, reason: 'Choose Fang, Grove, or Bloom Form.' };
    if (actor.classState?.form === form) return { ok: false, reason: 'Choose either other Form.' };
  }
  return { ok: true, energyCost };
}

function durationUntilTurnStart(actorId) { return { mode: 'actor-turn-start', actorId }; }
function durationForTurns(actor, turns) { return { mode: 'actor-turn-end', actorId: actor.id, remaining: turns, appliedTurn: Number(actor.turnControl?.turnsStarted || 0) }; }
function addStatus(combat, target, source, id, modifiers, { negative=false, turns=null, untilTurnStartActorId=null, memory={} } = {}) {
  const duration = untilTurnStartActorId ? durationUntilTurnStart(untilTurnStartActorId) : turns ? durationForTurns(target, turns) : null;
  applyStatus(combat, target.id, { id, sourceActorId: source.id, negative, modifiers, duration, memory, stacking:'refresh' });
}
function consumeEffect(actor, id) {
  const index = (actor.effects || []).findIndex(effect => effect.id === id);
  if (index < 0) return null;
  return actor.effects.splice(index,1)[0];
}
function lowestHpAlly(combat, source, { realOnly=false }={}) {
  const allies = combat.actors.filter(a => a.side === source.side && living(a) && (!realOnly || a.real));
  allies.sort((a,b) => (a.resources.hp/a.resources.maxHp) - (b.resources.hp/b.resources.maxHp) || a.id.localeCompare(b.id));
  return allies[0] || null;
}
function gainOnce(actor, bucket, flag, amount=1) {
  const flags = actor.classState?.[bucket];
  if (!flags || flags[flag]) return false;
  gainResource(actor, amount); flags[flag]=true; return true;
}

export function triggerAbilityUseResource(actor, ability, energySpent) {
  if (!isBaseResourceActive(actor, ability.baseClass) || !actor.classState) return;
  if (actor.classState?.baseClass === 'Mage' && energySpent >= 1) gainOnce(actor,'turnFlags','arcaneFromEnergy',1);
  if (actor.classState?.baseClass === 'Sorcerer' && energySpent >= 1) gainOnce(actor,'turnFlags','redlineFromEnergy',1);
}

export function triggerOnDamage(actor, target, ability, result) {
  if (!result.hit || !isBaseResourceActive(actor, ability.baseClass) || !actor.classState) return;
  const actual = Number(result.actualHpRemoved || 0);
  if (actor.classState?.baseClass === 'Warrior') gainOnce(actor,'turnFlags','pressureFromDamage',1);
  if (actor.classState?.baseClass === 'Rogue' && result.critical) gainOnce(actor,'turnFlags','openingFromCrit',1);
  if (actor.classState?.baseClass === 'Brawler') {
    const generated = Number(actor.classState.turnFlags.impactHitsGenerated || 0);
    if (generated < 2) { gainResource(actor,1); actor.classState.turnFlags.impactHitsGenerated = generated + 1; }
  }
  if (actor.classState?.baseClass === 'Mage' && result.critical) gainOnce(actor,'turnFlags','arcaneFromCrit',1);
  if (actor.classState?.baseClass === 'Cleric' && result.critical) gainOnce(actor,'turnFlags','graceFromCrit',1);
  if (actor.classState?.baseClass === 'Ranger') {
    const q = actor.classState.quarry || (actor.classState.quarry={targetId:null});
    if (q.targetId !== target.id) { q.targetId = target.id; setResourceValue(actor,0); }
    gainOnce(actor,'turnFlags','quarryFromDamage',1);
    if (result.critical) gainOnce(actor,'turnFlags','quarryFromCrit',1);
  }
  if (actor.classState?.baseClass === 'Bard') gainOnce(actor,'turnFlags','resonanceOffense',1);
  if (actor.classState?.baseClass === 'Sorcerer' && result.critical) gainOnce(actor,'turnFlags','redlineFromCrit',1);
  if (actor.classState?.baseClass === 'Paladin' && actual > 0) gainOnce(actor,'turnFlags','convictionFromDamage',1);
  if (actor.classState?.baseClass === 'Druid' && actor.classState.form === 'Fang') gainOnce(actor,'turnFlags','cycleFromFormAction',1);
}

export function triggerOnSupport(actor, ability, { actualHealing=0, shieldGranted=0 }={}) {
  if (!isBaseResourceActive(actor, ability.baseClass) || !actor.classState) return;
  if (actor.classState?.baseClass === 'Cleric' && (actualHealing > 0 || shieldGranted > 0)) gainOnce(actor,'turnFlags','graceFromSupport',1);
  if (actor.classState?.baseClass === 'Bard' && (actualHealing > 0 || shieldGranted > 0)) gainOnce(actor,'turnFlags','resonanceSupport',1);
  if (actor.classState?.baseClass === 'Warlock' && actualHealing > 0) gainOnce(actor,'turnFlags','covenantFromHealing',1);
  if (actor.classState?.baseClass === 'Druid') {
    if (actor.classState.form === 'Grove' && shieldGranted > 0) gainOnce(actor,'turnFlags','cycleFromFormAction',1);
    if (actor.classState.form === 'Bloom' && actualHealing > 0) gainOnce(actor,'turnFlags','cycleFromFormAction',1);
  }
}

export function triggerOnDebuff(actor, ability) {
  if (!isBaseResourceActive(actor, ability.baseClass) || !actor.classState) return;
  if (actor.classState?.baseClass === 'Bard') gainOnce(actor,'turnFlags','resonanceOffense',1);
  if (actor.classState?.baseClass === 'Warlock') gainOnce(actor,'turnFlags','covenantFromDebuff',1);
}

function specialPreDamage(actor, target, ability) {
  let finalDamagePct = 0, critChanceBonus = 0, critDamageBonus = 0, unblockable = false;
  const specials = new Set(ability.special || []);
  if (specials.has('exploit-weakness') && hasNegativeEffect(target)) finalDamagePct += 20;
  if (specials.has('hammerfist') && resourceValue(actor) > 0) { spendResource(actor,1); finalDamagePct += 20; }
  if (specials.has('pressure-break') && resourceValue(actor) >= 5) finalDamagePct += 20;
  if (specials.has('relentless-pursuit') && actor.classState?.quarry?.targetId === target.id) finalDamagePct += resourceValue(actor) * 5;
  if (specials.has('unbound-burst')) finalDamagePct += resourceValue(actor) * 5;
  if (specials.has('collect-the-debt') && hasNegativeEffect(target)) finalDamagePct += 15;
  if (specials.has('righteous-blow') && actor.combatMemory?.enemyDamagedAllySinceLastOwnTurn?.[target.id]) finalDamagePct += 15;
  return { finalDamagePct, critChanceBonus, critDamageBonus, unblockable };
}

function applyOnHitSpecial(combat, actor, target, ability, result) {
  if (!result.hit) return;
  const s = new Set(ability.special || []);
  if (s.has('break-line')) { addStatus(combat,target,actor,'warrior-break-line',{blockChancePct:-10,blockedDamageReductionPct:-10},{negative:true,turns:2}); triggerOnDebuff(actor,ability); }
  if (s.has('frost-pin') || s.has('hamstring-shot')) { addStatus(combat,target,actor,`${ability.id}-dodge-down`,{dodgeChancePct:-10},{negative:true,turns:2}); triggerOnDebuff(actor,ability); }
  if (s.has('radiant-rebuke')) { addStatus(combat,target,actor,'cleric-radiant-rebuke',{finalDamagePct:-5},{negative:true,untilTurnStartActorId:target.id}); triggerOnDebuff(actor,ability); }
  if (s.has('force-pulse')) { addStatus(combat,target,actor,'sorcerer-force-pulse',{blockChancePct:-10},{negative:true,turns:2}); triggerOnDebuff(actor,ability); }
  if (s.has('dissonant-chord') || s.has('binding-clause')) { addStatus(combat,target,actor,ability.id,{finalDamagePct:-10},{negative:true,turns:2}); triggerOnDebuff(actor,ability); }
}

function specialNonDamage(combat, actor, target, ability) {
  const s = new Set(ability.special || []);
  if (s.has('brace')) addStatus(combat,actor,actor,'warrior-brace',{blockChancePct:15,blockedDamageReductionPct:15},{untilTurnStartActorId:actor.id});
  if (s.has('off-balance')) { addStatus(combat,target,actor,'rogue-feint',{dodgeChancePct:-10,blockChancePct:-10},{negative:true,turns:2}); triggerOnDebuff(actor,ability); }
  if (s.has('slipstep')) { addStatus(combat,actor,actor,'rogue-slipstep-dodge',{dodgeChancePct:15},{untilTurnStartActorId:actor.id}); addStatus(combat,actor,actor,'rogue-slipstep-crit',{},{turns:2,memory:{nextRogueDamageCritBonus:10}}); }
  if (s.has('tight-guard')) addStatus(combat,actor,actor,'brawler-tight-guard',{blockChancePct:12,dodgeChancePct:12},{untilTurnStartActorId:actor.id,memory:{triggered:false}});
  if (s.has('sidestep')) { addStatus(combat,actor,actor,'ranger-sidestep-dodge',{dodgeChancePct:15},{untilTurnStartActorId:actor.id}); addCombatEffect(combat,actor.id,{id:'ranger-sidestep-crit',sourceActorId:actor.id,negative:false,modifiers:{},duration:null,memory:{nextRangerAttackCritBonus:10},stacking:'refresh'}); }
  if (s.has('encouraging-verse')) addStatus(combat,target,actor,'bard-encouraging-verse',{finalDamagePct:5},{untilTurnStartActorId:target.id});
  if (s.has('sanctuary-mark')) addStatus(combat,target,actor,'cleric-sanctuary-mark',{incomingDamagePct:-10},{untilTurnStartActorId:actor.id});
}

function nextAttackCritBonus(actor, ability) {
  let bonus=0;
  if (ability.baseClass === 'Rogue' && ability.components.some(c=>c.type==='damage')) {
    const effect=consumeEffect(actor,'rogue-slipstep-crit'); if (effect) bonus += Number(effect.memory?.nextRogueDamageCritBonus || 0);
  }
  if (ability.baseClass === 'Ranger' && ability.components.some(c=>c.type==='damage')) {
    const effect=consumeEffect(actor,'ranger-sidestep-crit'); if (effect) bonus += Number(effect.memory?.nextRangerAttackCritBonus || 0);
  }
  return bonus;
}

function spendAbilityResourceAfter(actor, ability, preResource) {
  if (!ability.resourceCost) return 0;
  let amount = Number(ability.resourceCost.amount || 0);
  if (ability.special?.includes('pressure-break') && preResource >= 5) amount = 5;
  spendResource(actor, amount);
  return amount;
}

function heavyMomentumState(actor, ability) {
  return actor.baseClass === 'Brawler' && ability.baseClass === 'Brawler' && ability.components.some(c=>c.type==='damage') && resourceValue(actor) >= 4;
}

export function chooseDruidStartingForm(slot, actorId, form) {
  if (!slot?.campaign?.state?.combat) return {ok:false,error:'No active combat.'};
  if (!['Fang','Grove','Bloom'].includes(form)) return {ok:false,error:'Choose Fang, Grove, or Bloom Form.'};
  const next=clone(slot); const actor=getCombatActor(next.campaign.state.combat,actorId);
  if (!actor || actor.classState?.baseClass!=='Druid') return {ok:false,error:'That combatant does not have the Druid resource system.'};
  if (Number(actor.turnControl?.turnsStarted || 0)>1 || next.campaign.state.combat.turn?.actionTaken) return {ok:false,error:'Starting Form must be chosen before the Druid acts.'};
  if (actor.classState.form) return {ok:false,error:'Starting Form is already chosen.'};
  actor.classState.form=form; setResourceValue(actor,0);
  return {ok:true,slot:next,form};
}

export function executeBaseAbility(slot, { abilityId, catalog, targets = {}, form = null, rng = Math.random } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok:false, error:'No active combat.' };
  const next=clone(slot); const combat=next.campaign.state.combat;
  if (combat.state!=='active' || !combat.turn || combat.turn.actionTaken) return {ok:false,error:'No unused combat action is available.'};
  const actor=getCombatActor(combat,combat.turn.actorId);
  if (!actor) return {ok:false,error:'Current combatant is missing.'};
  const ability=findBaseAbility(catalog,abilityId);
  const available=getAbilityAvailability(combat,actor.id,ability,{targets,form});
  if (!available.ok) return {ok:false,error:available.reason};
  const preResource=resourceValue(actor);
  const heavyMomentum=heavyMomentumState(actor,ability);
  const intrinsicCost=intrinsicEnergyCost(actor,ability);
  keptBeforeAction({combat,actor,ability});
  actor.resources.energy=Math.max(0,Number(actor.resources.energy||0)-available.energyCost);
  consumeNextEnergyCostEffects(actor,intrinsicCost);
  keptEnergySpent({slot:next,combat,actor,ability,amount:available.energyCost,rng});
  triggerAbilityUseResource(actor,ability,available.energyCost);
  const primary=targets.primary ? getCombatActor(combat,targets.primary) : null;
  const extraCrit=nextAttackCritBonus(actor,ability);
  const results=[];
  let totalActualDamage=0, totalActualHealing=0, totalShield=0;

  // Abilities that are purely status/form are resolved here.
  if (!ability.components.length) {
    if (ability.special?.includes('turn-the-cycle')) { actor.classState.form=form; setResourceValue(actor,0); results.push({type:'form',form}); }
    else specialNonDamage(combat,actor,primary,ability);
  }

  for (const component of ability.components) {
    if (component.type==='damage') {
      const targetList = ability.targetMode==='all-enemies-and-allies' ? combat.actors.filter(a=>a.side!==actor.side && living(a)) : [primary].filter(Boolean);
      const hits=Math.max(1,Number(component.hits||1));
      for (const target of targetList) for (let hitIndex=0;hitIndex<hits;hitIndex++) {
        const pre=specialPreDamage(actor,target,ability);
        if (heavyMomentum) pre.finalDamagePct += 15;
        const r=resolveDamageComponent(next,combat,actor,target,ability,component,{rng, ...pre, critChanceBonus:pre.critChanceBonus+extraCrit, confluence:ability.special?.includes('confluence')});
        results.push({type:'damage',targetId:target.id,hitIndex,...r}); totalActualDamage+=Number(r.actualHpRemoved||0);
        triggerOnDamage(actor,target,ability,r); applyOnHitSpecial(combat,actor,target,ability,r);
      }
    }
    if (component.type==='heal') {
      let targetList=[];
      if (ability.targetMode==='all-allies' || ability.targetMode==='all-enemies-and-allies') targetList=combat.actors.filter(a=>a.side===actor.side && living(a));
      else if (component.targetKey==='lowest-ally') targetList=[lowestHpAlly(combat,actor)].filter(Boolean);
      else if (ability.targetMode==='two-allies') targetList=[getCombatActor(combat,targets[component.targetKey])].filter(Boolean);
      else targetList=[primary].filter(Boolean);
      for (const target of targetList) {
        let finalHealingPct=0;
        if (ability.special?.includes('lay-on-hands') && Number(target.resources.hp)/Number(target.resources.maxHp)<0.4) finalHealingPct+=20;
        const r=resolveHealComponent(next,combat,actor,target,ability,component,{rng,finalHealingPct,confluence:ability.special?.includes('confluence')});
        results.push({type:'heal',targetId:target.id,...r}); totalActualHealing+=Number(r.actualRestored||0); triggerOnSupport(actor,ability,{actualHealing:r.actualRestored});
        if (ability.special?.includes('benediction')) { const removed=removeOneNegativeCombatEffect(combat,target.id); if(removed)keptOnNegativeRemoved({slot:next,combat,source:actor,target,effect:removed}); }
      }
    }
    if (component.type==='shield') {
      let targetList=[];
      if (ability.targetMode==='all-allies') targetList=combat.actors.filter(a=>a.side===actor.side && living(a));
      else if (component.targetKey==='self') targetList=[actor];
      else if (ability.targetMode==='two-allies') targetList=[getCombatActor(combat,targets[component.targetKey])].filter(Boolean);
      else if (ability.targetMode==='self') targetList=[actor];
      else targetList=[primary].filter(Boolean);
      for (const target of targetList) {
        const r=resolveShieldComponent(combat,actor,target,ability,component,{confluence:ability.special?.includes('confluence')});
        results.push({type:'shield',targetId:target.id,...r}); totalShield+=Number(r.amount||0); triggerOnSupport(actor,ability,{shieldGranted:r.amount});
      }
    }
  }

  // Special post-resolution components based on actual damage.
  if (ability.special?.includes('leeching-word') && totalActualDamage>0) {
    const r=resolvePercentOfActualDamageHeal(next,combat,actor,actor,totalActualDamage,20); results.push({type:'heal-from-damage',targetId:actor.id,...r}); triggerOnSupport(actor,ability,{actualHealing:r.actualRestored});
  }
  if (ability.special?.includes('collect-the-debt') && totalActualDamage>0) {
    const ally=lowestHpAlly(combat,actor,{realOnly:true}); if (ally) { const r=resolvePercentOfActualDamageHeal(next,combat,actor,ally,totalActualDamage,35); results.push({type:'heal-from-damage',targetId:ally.id,...r}); triggerOnSupport(actor,ability,{actualHealing:r.actualRestored}); }
  }
  if (ability.special?.includes('gracebound-judgment') && primary && hasNegativeEffect(primary)) {
    const ally=lowestHpAlly(combat,actor); if (ally) { const comp={base:5,scaling:{FTH:.012,CHA:.008}}; const r=resolveHealComponent(next,combat,actor,ally,ability,comp,{rng}); results.push({type:'conditional-heal',targetId:ally.id,...r}); triggerOnSupport(actor,ability,{actualHealing:r.actualRestored}); }
  }
  if (ability.special?.includes('convictions-answer')) {
    const ally=lowestHpAlly(combat,actor,{realOnly:true}); if (ally) { const comp={base:8,scaling:{FTH:.014,STR:.010}}; const r=resolveHealComponent(next,combat,actor,ally,ability,comp,{rng}); results.push({type:'answer-heal',targetId:ally.id,...r}); triggerOnSupport(actor,ability,{actualHealing:r.actualRestored}); }
  }
  if (ability.special?.includes('encouraging-verse') && primary) specialNonDamage(combat,actor,primary,ability);
  if (ability.special?.includes('sanctuary-mark') && primary) specialNonDamage(combat,actor,primary,ability);
  if (ability.special?.includes('wild-guard')) { /* crit bonus is derived from its surviving shield layer */ }
  if (ability.special?.includes('hold-fast')) { /* aggro metadata is retained on its shield layer for later AI */ }

  const spentResource=spendAbilityResourceAfter(actor,ability,preResource);
  if (heavyMomentum && preResource>=4 && !(spentResource>=preResource)) setResourceValue(actor,Math.max(0,resourceValue(actor)-1));
  setAbilityCooldown(combat,actor.id,ability.id,keptCooldown(actor,ability,ability.cooldown));
  combat.turn.actionTaken=true; combat.turn.actionType='ability'; combat.turn.actionPayload={abilityId:ability.id,targets:clone(targets),form}; combat.turn.canEndTurn=true;
  combat.log.push({type:'ability',round:combat.round,actorId:actor.id,abilityId:ability.id,energySpent:available.energyCost,resourceSpent:spentResource,results:clone(results),at:new Date().toISOString()});
  return {ok:true,slot:next,combat:clone(combat),ability:clone(ability),results};
}

export function listUsableBaseAbilities(combat, actorId, catalog) {
  const actor=getCombatActor(combat,actorId); if(!actor) return [];
  return abilityList(catalog).filter(a=>actorHasAbility(actor,a) && Number(actor.level||0)>=Number(a.level||0)).sort((a,b)=>a.level-b.level || a.slot-b.slot).map(a=>({
    ...clone(a), cooldownRemaining:getAbilityCooldown(combat,actor.id,a.id), effectiveEnergyCost:effectiveEnergyCost(actor,a), resourceAvailable:resourceValue(actor), resourceRequired:Number(a.resourceCost?.amount||0)
  }));
}
