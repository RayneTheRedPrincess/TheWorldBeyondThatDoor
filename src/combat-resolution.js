import { baseDerivedStats, scaledBaseAmount, resolveCritical, rollPercent, capDodgeChance, capBlockChance, mitigateBlockedDamage, applyDamageReduction, applyHealingModifiers, roundFinal } from './combat-math.js';
import { getCombatActor, grantCombatShield, consumeCombatShield, addCombatEffect, syncCombatShield } from './combat-controller.js';
import { gainResource, resourceValue } from './base-class-state.js';
import { subclassPassiveModifiers, recordSubclassDefenseEvent, recordSubclassShieldAbsorb, recordSubclassDamageDealt, recordSubclassEnemyDefeated, recordSubclassHeal, gainSubclassResource, isSubclassResourceActive } from './subclass-state.js';
import { effectiveKeptStats, keptGlobalModifiers, keptResistanceBonus, keptLifestealPct, keptDamageType, keptScaling, keptDamageTypeFinalBonus } from './kept-impression-state.js';
import { resolveScriptedEnemyLethal } from './enemy-special-mechanics.js';
import { keptBeforeDamage, keptAfterDamage, keptBeforeHeal, keptAfterHeal, keptBeforeShield, keptAfterShield, keptOnDefense, keptOnShieldAbsorb, keptOnActorDefeated, keptOnStatusApplied, keptAfterLifesteal, keptAfterBloodknuckleTriggeredHeal } from './kept-impression-runtime.js';

function alive(actor) { return Number(actor?.resources?.hp || 0) > 0; }

function sumEffect(actor, key, predicate = null) {
  return (actor?.effects || []).reduce((sum, effect) => {
    if (predicate && !predicate(effect)) return sum;
    return sum + Number(effect?.modifiers?.[key] || 0);
  }, 0);
}

function hasShieldFromAbility(actor, abilityId) {
  return (actor?.resources?.shieldLayers || []).some(layer => layer.abilityId === abilityId && Number(layer.amount || 0) > 0);
}

function classPassiveModifiers(actor, { ability = null, target = null, componentType = null, confluence = false } = {}) {
  const sameFamily = ability && actor?.baseClass === ability.baseClass;
  if (!sameFamily) return { finalDamagePct: 0, critChancePct: 0, critDamagePct: 0, outgoingHealingPct: 0, shieldStrengthPct: 0, blockChancePct: 0 };
  const value = resourceValue(actor);
  const out = { finalDamagePct: 0, critChancePct: 0, critDamagePct: 0, outgoingHealingPct: 0, shieldStrengthPct: 0, blockChancePct: 0 };
  if (actor.baseClass === 'Warrior' && value >= 5) { out.finalDamagePct += 10; out.blockChancePct += 10; }
  if (actor.baseClass === 'Rogue' && value >= 4) out.critChancePct += 10;
  if (actor.baseClass === 'Mage' && value >= 5) out.critDamagePct += 10;
  if (actor.baseClass === 'Cleric' && value >= 4) { out.outgoingHealingPct += 10; out.finalDamagePct += 10; }
  if (actor.baseClass === 'Ranger' && actor.classState?.quarry?.targetId === target?.id && value >= 4) { out.critChancePct += 10; out.finalDamagePct += 10; }
  if (actor.baseClass === 'Bard' && value >= 4) { out.finalDamagePct += 10; out.outgoingHealingPct += 10; out.shieldStrengthPct += 10; }
  if (actor.baseClass === 'Sorcerer') {
    out.finalDamagePct += value * 3;
    out.critDamagePct += value * 3;
    if (value >= 4) out.critChancePct += 10;
  }
  if (actor.baseClass === 'Warlock' && value >= 4) {
    if (componentType === 'damage' && ability.components?.some(c => c.damageType === 'Dark')) out.finalDamagePct += 10;
    out.outgoingHealingPct += 10;
  }
  if (actor.baseClass === 'Paladin' && value >= 5) { out.finalDamagePct += 10; out.outgoingHealingPct += 10; out.shieldStrengthPct += 10; }
  if (actor.baseClass === 'Druid') {
    const form = actor.classState?.form;
    const complete = value >= 3;
    if (confluence) {
      // Confluence receives the three printed Form bonuses simultaneously; it does not invent Complete versions for inactive Forms.
      out.finalDamagePct += 10; out.shieldStrengthPct += 10; out.blockChancePct += 5; out.outgoingHealingPct += 12;
    } else {
      if (form === 'Fang') out.finalDamagePct += complete ? 15 : 10;
      if (form === 'Grove') { out.shieldStrengthPct += complete ? 15 : 10; out.blockChancePct += complete ? 8 : 5; }
      if (form === 'Bloom') out.outgoingHealingPct += complete ? 18 : 12;
    }
  }
  if (actor.baseClass === 'Sorcerer' && hasShieldFromAbility(actor, 'sorcerer-wild-guard')) out.critChancePct += 10;
  return out;
}

export function getActorDerivedCombatStats(actor, context = {}) {
  const base = baseDerivedStats(effectiveKeptStats(actor));
  const passive = classPassiveModifiers(actor, context);
  const sub = subclassPassiveModifiers(actor, context);
  const kept = keptGlobalModifiers(actor, context);
  const equipment = actor?.equipmentModifiers || {};
  const aggroMultiplier = sub.aggroMultiplierOverride == null ? base.aggroMultiplier : Number(sub.aggroMultiplierOverride);
  let contextualDodge=0, contextualBlock=0, contextualCrit=0, contextualIncomingDamage=0, contextualIncomingHealing=0, contextualFinalDamage=0, contextualShieldStrength=0, contextualEnergyGain=0;
  if(actor?.enemyTemplateId==='kharvax-gatebound'){
    const max=Math.max(1,Number(actor.resources?.maxHp||1)),pct=Math.max(0,Number(actor.resources?.hp||0))/max*100;
    const chains=pct>75?3:pct>50?2:pct>25?1:0; actor.combatMemory=actor.combatMemory||{}; actor.combatMemory.hellchains=chains;
    if(chains===3)contextualIncomingDamage-=30;
    else if(chains===2){contextualIncomingDamage-=20;contextualFinalDamage+=10;}
    else if(chains===1){contextualIncomingDamage-=10;contextualFinalDamage+=20;}
    else {contextualFinalDamage+=30;contextualCrit+=15;}
  }
  if(actor?.enemyTemplateId==='serevakh-sevenfold-regent'){
    const sin=String(actor.combatMemory?.currentSin||'Pride');
    if(sin==='Pride'){contextualBlock+=15;contextualDodge+=15;contextualFinalDamage+=15;}
    if(sin==='Greed'){contextualShieldStrength+=20;contextualEnergyGain+=25;}
    if(sin==='Lust')contextualCrit+=20;
    if(sin==='Gluttony')contextualIncomingHealing+=25;
    if(sin==='Wrath'){contextualFinalDamage+=30;contextualCrit+=25;contextualBlock-=15;contextualDodge-=15;}
    if(sin==='Sloth')contextualIncomingDamage-=25;
  }
  if(actor?.enemyTemplateId==='ossuary-king'){
    const pct=100*Math.max(0,Number(actor.resources?.hp||0))/Math.max(1,Number(actor.resources?.maxHp||1));actor.combatMemory=actor.combatMemory||{};
    if(pct>70){contextualIncomingDamage-=10;actor.combatMemory.ossuaryPhase='Crowned in Bone';}
    else if(pct>35){contextualFinalDamage+=10;actor.combatMemory.ossuaryPhase='Royal Ossuary Unbound';}
    else {contextualIncomingDamage+=15;contextualFinalDamage+=25;contextualCrit+=10;actor.combatMemory.ossuaryPhase='Exposed King-Soul';}
  }
  if(actor?.enemyTemplateId==='quentaliaus-devanpierus'){
    const hpPct=100*Math.max(0,Number(actor.resources?.hp||0))/Math.max(1,Number(actor.resources?.maxHp||1));
    if(hpPct>70){contextualIncomingDamage-=8;actor.combatMemory=actor.combatMemory||{};actor.combatMemory.prismaticPhase='Measured Amusement';}
    else if(hpPct>35){contextualFinalDamage+=8;actor.combatMemory=actor.combatMemory||{};actor.combatMemory.prismaticPhase='Prismatic Interest';}
    else {contextualIncomingDamage+=12;contextualFinalDamage+=18;contextualCrit+=10;actor.combatMemory=actor.combatMemory||{};actor.combatMemory.prismaticPhase='Arcane Exultation';}
  }

  if(context?.combat){
    for(const owner of context.combat.actors||[]){
      if(owner.side===actor?.side&&owner.subclass==='Trailguard'&&Number(owner.resources?.hp||0)>0&&owner.subclassState?.trailmarks?.includes(actor.id)){contextualDodge+=4;contextualIncomingDamage-=5;}
      if(owner.side!==actor?.side&&owner.subclass==='Malisunder'&&Number(owner.resources?.hp||0)>0){contextualFinalDamage-=Number(owner.subclassState?.fractures?.[actor.id]||0)*3;}
    }
    for(const effect of actor?.effects||[]){
      if(effect?.memory?.trailguardOwnerId&&context?.target){const owner=(context.combat.actors||[]).find(a=>a.id===effect.memory.trailguardOwnerId);if(owner?.subclassState?.trailmarks?.includes(context.target.id))contextualFinalDamage+=Number(effect.memory.finalDamageVsTrailmarkedPct||0);}
    }
  }
  return {
    ...base,
    aggroMultiplier: Math.max(.15, (aggroMultiplier + sumEffect(actor, 'aggroMultiplierAdd') + Number(kept.aggroMultiplierAdd||0)) * Number(kept.aggroMultiplierFactor||1)),
    blockChancePct: capBlockChance(base.blockChancePct + contextualBlock + Number(actor?.defense?.explicitBlockChancePct || 0) + sumEffect(actor, 'blockChancePct') + passive.blockChancePct + sub.blockChancePct + Number(kept.blockChancePct||0) + Number(equipment.blockChancePct||0)),
    dodgeChancePct: capDodgeChance(base.dodgeChancePct + Number(actor?.defense?.explicitDodgeChancePct || 0) + sumEffect(actor, 'dodgeChancePct') + sub.dodgeChancePct + contextualDodge + Number(kept.dodgeChancePct||0) + Number(equipment.dodgeChancePct||0)),
    blockedDamageReductionPct: Math.max(0, base.blockedDamageReductionPct + Number(actor?.defense?.explicitBlockedDamageReductionPct || 0) + sumEffect(actor, 'blockedDamageReductionPct') + Number(equipment.blockedDamageReductionPct||0)),
    damageCritChancePct: Math.max(0, base.damageCritChancePct + contextualCrit + sumEffect(actor, 'damageCritChancePct') + passive.critChancePct + sub.critChancePct + Number(kept.critChancePct||0) + Number(equipment.damageCritChancePct||0)),
    criticalDamagePct: Math.max(0, base.criticalDamagePct + sumEffect(actor, 'criticalDamagePct') + passive.critDamagePct + sub.critDamagePct + Number(kept.critDamagePct||0) + Number(equipment.criticalDamagePct||0)),
    healingCritChancePct: Math.max(0, base.healingCritChancePct + sumEffect(actor, 'healingCritChancePct') + Number(equipment.healingCritChancePct||0)),
    healingCriticalDamagePct: Math.max(0, base.healingCriticalDamagePct + sumEffect(actor, 'healingCriticalDamagePct') + Number(equipment.healingCriticalDamagePct||0)),
    incomingHealingPct: contextualIncomingHealing + base.incomingHealingPct + sumEffect(actor, 'incomingHealingPct') + sub.incomingHealingPct + Number(kept.incomingHealingPct||0) + Number(equipment.incomingHealingPct||0),
    outgoingHealingPct: base.outgoingHealingPct + sumEffect(actor, 'outgoingHealingPct') + passive.outgoingHealingPct + sub.outgoingHealingPct + Number(kept.outgoingHealingPct||0) + Number(equipment.outgoingHealingPct||0),
    finalDamagePct: sumEffect(actor, 'finalDamagePct') + passive.finalDamagePct + sub.finalDamagePct + contextualFinalDamage + Number(kept.finalDamagePct||0) + Number(equipment.finalDamagePct||0),
    incomingDamagePct: sumEffect(actor, 'incomingDamagePct') + sub.incomingDamagePct + contextualIncomingDamage + Number(kept.incomingDamagePct||0) + Number(equipment.incomingDamagePct||0),
    shieldStrengthPct: contextualShieldStrength + sumEffect(actor, 'shieldStrengthPct') + passive.shieldStrengthPct + sub.shieldStrengthPct + Number(kept.shieldStrengthPct||0) + Number(equipment.shieldStrengthPct||0),
    energyGainPct: contextualEnergyGain + Number(base.energyGainPct||0) + sumEffect(actor, 'energyGainPct') + Number(kept.energyGainPct||0) + Number(equipment.energyGainPct||0)
  };
}

function markCampaignMetric(slot, actorId, key, amount) {
  const member = slot?.campaign?.state?.party?.find(entry => entry.id === actorId);
  if (member) member[key] = Math.max(0, Number(member[key] || 0)) + Math.max(0, Number(amount || 0));
}

function basePassiveOnDefense(combat, target, outcome) {
  if (!target?.baseClass || !target.classState) return;
  if (outcome === 'block') {
    if (target.baseClass === 'Warrior' && !target.classState.betweenTurnFlags.pressureFromBlock) {
      gainResource(target, 1); target.classState.betweenTurnFlags.pressureFromBlock = true;
    }
    if (target.baseClass === 'Paladin' && !target.classState.betweenTurnFlags.convictionFromBlockOrShield) {
      gainResource(target, 1); target.classState.betweenTurnFlags.convictionFromBlockOrShield = true;
    }
  }
  if (outcome === 'dodge' && target.baseClass === 'Rogue' && !target.classState.betweenTurnFlags.openingFromDodge) {
    gainResource(target, 1); target.classState.betweenTurnFlags.openingFromDodge = true;
  }
  const tight = (target.effects || []).find(effect => effect.id === 'brawler-tight-guard' && !effect.memory?.triggered);
  if (tight && (outcome === 'block' || outcome === 'dodge')) {
    gainResource(target, 1); tight.memory = { ...(tight.memory || {}), triggered: true };
  }
}

function basePassiveOnShieldAbsorb(combat, absorbedBySource) {
  for (const [sourceId, amount] of Object.entries(absorbedBySource || {})) {
    if (!(Number(amount) > 0)) continue;
    const source = getCombatActor(combat, sourceId);
    if (source?.baseClass === 'Paladin' && !source.classState?.betweenTurnFlags?.convictionFromBlockOrShield) {
      gainResource(source, 1); source.classState.betweenTurnFlags.convictionFromBlockOrShield = true;
    }
  }
}

function markEnemyDamagedAlly(combat, source, target, actualHpRemoved) {
  if (!(actualHpRemoved > 0) || source.side === target.side) return;
  if (source.side !== 'enemy' || target.side !== 'party') return;
  for (const paladin of combat.actors || []) {
    if (paladin.side === 'party' && paladin.baseClass === 'Paladin' && paladin.real && Number(paladin.resources?.hp || 0) > 0) {
      paladin.combatMemory.enemyDamagedAllySinceLastOwnTurn[source.id] = true;
    }
  }
}

function keptReactionHelpers(slot, combat, rng = Math.random, context = {}) {
  let lastRiderDamage = 0;
  const flatDamage = (source, target, amount, damageType = 'Force', { canCrit = false, forcedBlocked = null } = {}) => {
    if (!source || !target || !alive(target) || !(Number(amount) > 0)) return 0;
    const c = { type:'damage', base:Number(amount), damageType, scaling:{}, indirect:true };
    const r = resolveDamageComponent(slot, combat, source, target, { id:`ki-reaction-${damageType.toLowerCase()}`, name:'Kept Impression Reaction', baseClass:source.baseClass, subclass:source.subclass, components:[c] }, c, { rng, canCrit, reaction:true, skipDodge:true, forcedBlocked });
    lastRiderDamage = Number(r.actualHpRemoved || 0);
    return lastRiderDamage;
  };
  const riderDamage = (source, target, ability, originalComponent, pct, damageType, { canCrit = false, flat = null, forcedBlocked = context.blocked ?? null } = {}) => {
    if (!source || !target || !alive(target)) return 0;
    let base = Number(flat);
    if (!Number.isFinite(base)) base = scaledBaseAmount(Number(originalComponent?.base || 0), keptScaling(source, ability, originalComponent?.scaling || {}), effectiveKeptStats(source)) * Math.max(0, Number(pct || 0)) / 100;
    const type=damageType || originalComponent?.damageType || 'Force';
    const patient=(target.effects||[]).find(e=>e.id==='ki-018-patient-cut'&&e.sourceActorId===source.id);
    if(patient&&['Fire','Cold','Lightning','Poison'].includes(type)){base*=1.10;target.effects=target.effects.filter(e=>e!==patient);}
    return flatDamage(source, target, base, type, { canCrit, forcedBlocked });
  };
  const shieldOnly = (source,target,ability,originalComponent,pct,damageType='Force',{forcedBlocked=context.blocked??null}={}) => {
    if(!source||!target||!(Number(target.resources?.shield||0)>0))return {absorbed:0,broke:false};
    let raw=scaledBaseAmount(Number(originalComponent?.base||0),keptScaling(source,ability,originalComponent?.scaling||{}),effectiveKeptStats(source))*Math.max(0,Number(pct||0))/100;
    const src=getActorDerivedCombatStats(source,{ability,target,componentType:'damage',combat});
    raw*=Math.max(0,1+Number(src.finalDamagePct||0)/100);
    const tgt=getActorDerivedCombatStats(target,{componentType:'defense',combat});
    if(forcedBlocked===true)raw=mitigateBlockedDamage(raw,tgt.blockedDamageReductionPct);
    raw=applyDamageReduction(raw,-Number(tgt.incomingDamagePct||0));
    raw=applyDamageReduction(raw,Number(target.defense?.armorMitigationPct||0));
    raw=applyDamageReduction(raw,Number(target.resistances?.[damageType]||0)+keptResistanceBonus(target,damageType));
    const before=Number(target.resources?.shield||0);const sr=consumeCombatShield(combat,target.id,Math.max(0,raw));
    basePassiveOnShieldAbsorb(combat,sr.absorbedBySource);keptOnShieldAbsorb({slot,combat,source,target,ability,component:originalComponent,shieldResult:sr,rng,reaction:true,helpers:keptReactionHelpers(slot,combat,rng,{blocked:Boolean(forcedBlocked)})});
    return {absorbed:Number(sr.absorbed||0),broke:before>0&&Number(target.resources?.shield||0)<=0};
  };
  return { rider:riderDamage, flatDamage, shieldOnly, get lastRiderDamage(){ return lastRiderDamage; } };
}

export function resolveDamageComponent(slot, combat, source, target, ability, component, { rng = Math.random, finalDamagePct = 0, postFinalMultiplier = 1, critChanceBonus = 0, critDamageBonus = 0, unblockable = false, ignoreShields = false, blockChanceMultiplier = 1, canCrit = true, confluence = false, reaction = false, skipDodge = false, forcedBlocked = null } = {}) {
  // Direct-hit redirection is resolved before the redirected target's own Dodge/Block/Shield sequence.
  let redirectReductionPct=0;
  if(!reaction && component?.indirect!==true){
    const redirect=(target.effects||[]).find(e=>e?.memory?.redirectTo);
    if(redirect){const redirected=getCombatActor(combat,redirect.memory.redirectTo);if(redirected&&Number(redirected.resources?.hp||0)>0){const remaining=Math.max(1,Number(redirect.memory?.redirectHitsRemaining||1));if(remaining<=1)target.effects=target.effects.filter(e=>e!==redirect);else redirect.memory.redirectHitsRemaining=remaining-1;target=redirected;redirectReductionPct=Math.max(0,Number(redirect.memory.damageReductionPct||0));if(redirect.memory.grantBearing&&isSubclassResourceActive(redirected,'SteelBearer')&&!redirected.subclassState?.betweenTurnFlags?.bearing){gainSubclassResource(redirected,1);redirected.subclassState.betweenTurnFlags.bearing=true;}combat.log.push({type:'redirect',sourceActorId:source.id,targetActorId:target.id,reductionPct:redirectReductionPct,at:new Date().toISOString()});}}
  }
  const targetHadShieldBefore=Number(target.resources?.shield||0)>0;
  const keptPre=keptBeforeDamage({slot,combat,source,target,ability,component,reaction,rng});
  component={...component,damageType:keptPre.damageType||keptDamageType(source,ability,component),scaling:keptScaling(source,ability,component.scaling||{})};
  const sourceStats = getActorDerivedCombatStats(source, { ability, target, componentType: 'damage', confluence, combat });
  const targetStats = getActorDerivedCombatStats(target, { componentType: 'defense', combat });
  let raw = scaledBaseAmount(component.base, component.scaling, effectiveKeptStats(source));
  const typedFinalPct=sumEffect(source,'damageTypeFinalPct',effect=>!effect?.memory?.damageType||effect.memory.damageType===component.damageType);
  const racialTypedFinalPct=Number(source?.racialModifiers?.damageTypeFinalPct?.[component.damageType]||0);
  const sourceFinalPct = sourceStats.finalDamagePct + typedFinalPct + racialTypedFinalPct + keptDamageTypeFinalBonus(source,component.damageType,ability) + Number(finalDamagePct || 0) + Number(keptPre.finalDamagePct||0) - redirectReductionPct + (Number(component.finalMultiplier || 1) - 1) * 100;
  raw *= Math.max(0, 1 + sourceFinalPct / 100);
  raw *= Math.max(0, Number(postFinalMultiplier||1));
  const targetCritAgainstSource=sumEffect(target,'critChanceAgainstSource',effect=>effect.sourceActorId===source.id);
  const sightedBonus=(target.effects||[]).reduce((n,e)=>n+(e.sourceActorId===source.id?Number(e.memory?.critChanceAgainstSource||0):0),0);
  const racialTypedCritChancePct=Number(source?.racialModifiers?.damageTypeCritChancePct?.[component.damageType]||0);
  const crit = canCrit ? resolveCritical(raw, { chancePct: sourceStats.damageCritChancePct + racialTypedCritChancePct + targetCritAgainstSource + sightedBonus + Number(component.critChanceBonus || 0) + Number(critChanceBonus || 0) + Number(keptPre.critChanceBonus||0), criticalDamagePct: sourceStats.criticalDamagePct + Number(component.critDamageBonus || 0) + Number(critDamageBonus || 0) + Number(keptPre.critDamageBonus||0), rng }) : { amount: raw, critical:false, recursive:false };
  let wardSealOwner=null,wardSeal=null,wardReductionPct=0;
  if(!reaction&&component?.indirect!==true){for(const owner of combat.actors||[]){const seal=(owner.subclassState?.seals||[]).find(x=>x.targetId===target.id&&x.type==='Ward');if(seal){wardSealOwner=owner;wardSeal=seal;wardReductionPct=25*(seal.empowered?1.25:1);break;}}}
  const dodge = skipDodge ? false : rollPercent(Math.max(0,targetStats.dodgeChancePct+Number(keptPre.targetDodgeChanceDelta||0)), rng);
  if (dodge) {
    basePassiveOnDefense(combat, target, 'dodge');
    recordSubclassDefenseEvent(combat,target,'dodge',{actualHpRemoved:0,shieldAbsorbed:0});
    keptOnDefense({slot,combat,source,target,ability,component,outcome:'dodge',targetAggroMultiplier:targetStats.aggroMultiplier,rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked:false})});
    keptAfterDamage({slot,combat,source,target,ability,component,result:{hit:false,dodged:true,blocked:false,critical:crit.critical,actualHpRemoved:0,shieldAbsorbed:0},rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked:false})});
    return { hit: false, dodged: true, blocked: false, critical: crit.critical, recursiveCritical: crit.recursive, actualHpRemoved: 0, shieldAbsorbed: 0, finalDamage: 0 };
  }
  const isUnblockable = Boolean(unblockable || component.unblockable);
  let blocked = false;
  let blockSource = null;
  if (!isUnblockable) {
    if (forcedBlocked !== null) { blocked = Boolean(forcedBlocked); blockSource = blocked ? 'inherited' : null; }
    else if (target.defense?.guardActive) { blocked = true; blockSource = 'guard'; }
    else if (rollPercent(Math.max(0,targetStats.blockChancePct*Math.max(0,Number(blockChanceMultiplier||0))*Math.max(0,Number(keptPre.blockChanceMultiplier??1))), rng)) { blocked = true; blockSource = 'normal'; }
  }
  if (blocked) { basePassiveOnDefense(combat, target, 'block'); keptOnDefense({slot,combat,source,target,ability,component,outcome:'block',targetAggroMultiplier:targetStats.aggroMultiplier,rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked:true})}); }
  let mitigated = crit.amount * Math.max(0,1-wardReductionPct/100);
  if (blocked) mitigated = mitigateBlockedDamage(mitigated, targetStats.blockedDamageReductionPct);
  mitigated = applyDamageReduction(mitigated, -targetStats.incomingDamagePct);
  mitigated = applyDamageReduction(mitigated, Number(target.defense?.armorMitigationPct||0));
  const resistance = Number(target.resistances?.[component.damageType] || 0) + keptResistanceBonus(target,component.damageType);
  mitigated = applyDamageReduction(mitigated, resistance);
  const preShield = Math.max(0, mitigated);
  let shieldResult = { absorbed: 0, remainingDamage: preShield, absorbedBySource: {} };
  if (!ignoreShields) shieldResult = consumeCombatShield(combat, target.id, preShield);
  basePassiveOnShieldAbsorb(combat, shieldResult.absorbedBySource);
  keptOnShieldAbsorb({slot,combat,source,target,ability,component,shieldResult,rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked})});
  const hpBefore = Math.max(0, Number(target.resources.hp || 0));
  const hpBeforePct = Number(target.resources.maxHp||0)>0 ? hpBefore/Number(target.resources.maxHp)*100 : 0;
  let hpDamage = roundFinal(shieldResult.remainingDamage);
  if(Number(keptPre.incomingHpDamageMultiplier||1)!==1)hpDamage=roundFinal(hpDamage*Math.max(0,Number(keptPre.incomingHpDamageMultiplier||1)));
  if(Number(keptPre.deferHpDamagePct||0)>0&&hpDamage>0){const deferred=roundFinal(hpDamage*Number(keptPre.deferHpDamagePct)/100);hpDamage=Math.max(0,hpDamage-deferred);const ks=target.keptState?.perId?.['KI-196']||(target.keptState.perId['KI-196']={});ks.stored=Math.max(0,Number(ks.stored||0))+deferred;}
  let actualHpRemoved = Math.min(hpBefore, hpDamage);
  if(keptPre.preventLethal&&actualHpRemoved>=hpBefore&&hpBefore>0)actualHpRemoved=Math.max(0,hpBefore-1);
  target.resources.hp = Math.max(0, hpBefore - actualHpRemoved);
  recordSubclassDefenseEvent(combat,target,blocked?'block':'hit',{actualHpRemoved,shieldAbsorbed:shieldResult.absorbed});
  recordSubclassShieldAbsorb(combat,shieldResult.absorbedBySource,actualHpRemoved);
  recordSubclassDamageDealt(combat,source,target,ability,{hit:true,blocked,critical:crit.critical,actualHpRemoved},{targetHpBeforePct:hpBeforePct,targetHadShieldBefore});
  if(target.resources.hp<=0){const scripted=resolveScriptedEnemyLethal(combat,target);if(!scripted.revived){recordSubclassEnemyDefeated(combat,target,source);keptOnActorDefeated({slot,combat,source,target,ability,component,overkill:Math.max(0,hpDamage-hpBefore),rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked})});}}
  markCampaignMetric(slot, source.id, 'damageDealt', actualHpRemoved);
  markCampaignMetric(slot, target.id, 'damageTaken', actualHpRemoved);
  markEnemyDamagedAlly(combat, source, target, actualHpRemoved);

  // Woundshare Rite copies exactly 20% of actual HP damage to its owner as an indirect Dark packet.
  // The copy has no new hit roll/Crit/Block, but normal incoming-damage, Dark resistance and Shields still mitigate it.
  // A copied packet grants the marked ally +8% Incoming Healing through the end of their next turn, stacking twice.
  if(!reaction && actualHpRemoved>0){
    const woundshares=[...(target.effects||[])].filter(e=>Number(e?.memory?.copyDamagePct||0)>0&&e.sourceActorId);
    for(const ws of woundshares){
      const owner=getCombatActor(combat,ws.sourceActorId);
      if(!owner||!alive(owner))continue;
      const copied=Math.max(0,Number(actualHpRemoved)*Number(ws.memory.copyDamagePct)/100);
      if(copied>0){
        const virtual={id:`${ws.sourceActorId}-woundshare-copy`,name:'Woundshare',side:owner.side,kind:'effect',real:false,level:owner.level||1,stats:{STR:0,DEX:0,CON:0,INT:0,FTH:0,CHA:0,LCK:0},resources:{hp:1,maxHp:1,energy:0,maxEnergy:7,shield:0,shieldLayers:[]},effects:[],defense:{},resistances:{}};
        const copyComponent={type:'damage',base:copied,damageType:'Dark',scaling:{},indirect:true};
        resolveDamageComponent(slot,combat,virtual,owner,{id:'ki-004-woundshare-copy',name:'Woundshare Copy',baseClass:null,subclass:null,components:[copyComponent]},copyComponent,{rng,canCrit:false,reaction:true,skipDodge:true,unblockable:true});
        const existing=(target.effects||[]).find(e=>e.id==='ki-004-woundshare-healing'&&e.sourceActorId===ws.sourceActorId);
        const current=Math.max(0,Number(existing?.modifiers?.incomingHealingPct||0));
        const nextBonus=Math.min(16,current+8);
        const healingEffect={id:'ki-004-woundshare-healing',sourceActorId:ws.sourceActorId,negative:false,removable:true,modifiers:{incomingHealingPct:nextBonus},duration:{mode:'actor-turn-end',actorId:target.id,remaining:1,appliedTurn:Number(target.turnControl?.turnsStarted||0)},memory:{statusKind:'Woundshare Recovery',stacks:Math.round(nextBonus/8)},stacking:'refresh'};
        target.effects=(target.effects||[]).filter(e=>!(e.id===healingEffect.id&&e.sourceActorId===healingEffect.sourceActorId));
        target.effects.push(healingEffect);
      }
    }
  }

  // Sealweaver delayed triggers are direct-hit reactions and never recursively trigger another Seal.
  if(!reaction&&component?.indirect!==true){
    if(wardSealOwner&&wardSeal){wardSealOwner.subclassState.seals=(wardSealOwner.subclassState.seals||[]).filter(x=>x!==wardSeal);const c={type:'shield',base:6,scaling:wardSeal.scaling||{}};resolveShieldComponent(combat,wardSealOwner,target,{id:'sealweaver-ward-trigger',name:'Ward Seal',baseClass:'Mage',subclass:'Sealweaver'},c,{finalShieldPct:wardSeal.empowered?25:0});}
    for(const owner of combat.actors||[]){const seal=(owner.subclassState?.seals||[]).find(x=>x.targetId===target.id&&x.type==='Fracture');if(seal){owner.subclassState.seals=owner.subclassState.seals.filter(x=>x!==seal);const c={type:'damage',base:6,damageType:'Force',scaling:seal.scaling||{}};resolveDamageComponent(slot,combat,owner,target,{id:'sealweaver-fracture-trigger',name:'Fracture Seal',baseClass:'Mage',subclass:'Sealweaver',components:[c]},c,{rng,finalDamagePct:seal.empowered?25:0,canCrit:false,reaction:true});break;}}
    const hpPctNow=Number(target.resources?.maxHp||0)>0?Number(target.resources.hp||0)/Number(target.resources.maxHp)*100:100;
    if(hpPctNow<60){for(const owner of combat.actors||[]){const seal=(owner.subclassState?.seals||[]).find(x=>x.targetId===target.id&&x.type==='Mercy');if(seal){owner.subclassState.seals=owner.subclassState.seals.filter(x=>x!==seal);const c={type:'heal',base:6,scaling:seal.scaling||{}};resolveHealComponent(slot,combat,owner,target,{id:'sealweaver-mercy-trigger',name:'Mercy Seal',baseClass:'Mage',subclass:'Sealweaver'},c,{rng,finalHealingPct:seal.empowered?25:0});break;}}}
  }
  // Answering Harmony: each owner's shield heals its bearer on the first absorption.
  if(shieldResult.absorbed>0){for(const eff of [...(target.effects||[])]){const sourceId=eff.memory?.answeringHarmonySourceId;if(!sourceId||eff.memory?.triggered)continue;if(Number(shieldResult.absorbedBySource?.[sourceId]||0)>0){const healer=getCombatActor(combat,sourceId);if(healer&&alive(healer)){eff.memory.triggered=true;const h=eff.memory.heal||{base:4,scaling:{FTH:.009,CON:.007,CHA:.005}};resolveHealComponent(slot,combat,healer,target,{id:'choruswarden-answering-harmony-reaction',name:'Answering Harmony',baseClass:'Bard',subclass:'Choruswarden'},h,{rng});}}}}
  // Conditional effects that care about the completed direct hit.
  const tempered=(target.effects||[]).find(e=>e.memory?.requiresShieldAbilityId);if(tempered&&!hasShieldFromAbility(target,tempered.memory.requiresShieldAbilityId))target.effects=target.effects.filter(e=>e!==tempered);
  // Parrying Measure triggers when a direct attack reaches Block resolution, regardless of whether the Block roll succeeds.
  // Dodged attacks never reach this point, and reaction hits cannot recursively trigger another Riposte.
  if(!reaction&&component?.indirect!==true){
    const riposte=(target.effects||[]).find(e=>e.memory?.riposte&&!e.memory.triggered);if(riposte&&alive(source)){riposte.memory.triggered=true;const rc=riposte.memory.riposte;resolveDamageComponent(slot,combat,target,source,{id:'duelist-parrying-measure-riposte',baseClass:'Rogue',subclass:'Duelist',components:[]},{base:rc.base,damageType:'Physical',scaling:rc.scaling},{rng,reaction:true});}
  }
  if(blocked){
    const red=(target.effects||[]).find(e=>e.memory?.healOnNextBlock);if(red){const heal=red.memory.healOnNextBlock;target.effects=target.effects.filter(e=>e!==red);const healed=resolveHealComponent(slot,combat,target,target,{id:'bloodknuckle-red-guard-reaction',baseClass:'Brawler',subclass:'Bloodknuckle',components:[]},{base:heal.base,scaling:heal.scaling},{rng});keptAfterBloodknuckleTriggeredHeal({actor:target,actualRestored:healed.actualRestored});}
  }
  // Share the Hurt: once per acting turn after actual HP loss.
  if(actualHpRemoved>0){for(const eff of target.effects||[]){if(eff.memory?.shareHurtSourceId){const key=`${combat.round}:${combat.currentActorId}`;if(eff.memory.lastTriggerKey!==key){eff.memory.lastTriggerKey=key;const healer=getCombatActor(combat,eff.memory.shareHurtSourceId);if(healer&&alive(healer)){const h=eff.memory.heal;resolveHealComponent(slot,combat,healer,target,{id:'solaceweaver-share-hurt-reaction',baseClass:'Cleric',subclass:'Solaceweaver',components:[]},{base:h.base,scaling:h.scaling},{rng});}}}}}
  if (!reaction && !dodge && Array.isArray(keptPre.riders) && keptPre.riders.length) {
    const helpers = keptReactionHelpers(slot, combat, rng, { blocked });
    for (const bonus of keptPre.riders) {
      if (!alive(target)) break;
      if (Number.isFinite(Number(bonus.flat))) helpers.flatDamage(source,target,Number(bonus.flat),bonus.damageType||'Force',{canCrit:Boolean(bonus.canCrit),forcedBlocked:blocked});
      else helpers.rider(source,target,ability,component,Number(bonus.pct||0),bonus.damageType||component.damageType,{canCrit:Boolean(bonus.canCrit),forcedBlocked:blocked});
    }
  }
  const lifestealPct=keptLifestealPct(source,ability,component.damageType)+Math.max(0,Number(source.equipmentModifiers?.lifestealPct||0))+Math.max(0,sumEffect(source,'lifestealPct'));if(actualHpRemoved>0&&lifestealPct>0){const ls=resolvePercentOfActualDamageHeal(slot,combat,source,source,actualHpRemoved,lifestealPct,{outgoingApplies:false,ability,healKind:'lifesteal',damageType:component.damageType});if(source.keptState)source.keptState.lastLifesteal=ls.actualRestored;keptAfterLifesteal({actor:source,ability,actualRestored:ls.actualRestored});}
  if(combat&&source?.side==='party'&&target?.side==='enemy'){combat.metrics=combat.metrics||{};if(targetHadShieldBefore&&Number(target.resources?.shield||0)<=0&&actualHpRemoved>0)combat.metrics.plainsShieldBreakDamage=Number(combat.metrics.plainsShieldBreakDamage||0)+actualHpRemoved;if(Number(target.resources?.hp||0)<=0){const overkill=Math.max(0,hpDamage-hpBefore);if(overkill>0)combat.metrics.plainsOverkillDefeats=Number(combat.metrics.plainsOverkillDefeats||0)+1;}}
  keptAfterDamage({slot,combat,source,target,ability,component,result:{hit:true,dodged:false,blocked,critical:crit.critical,recursiveCritical:crit.recursive,damageBeforeDefense:crit.amount,damageAfterDefenseBeforeShield:preShield,shieldAbsorbed:roundFinal(shieldResult.absorbed),actualHpRemoved,overkill:Math.max(0,hpDamage-hpBefore),targetHadShieldBefore,sourceAggroMultiplier:sourceStats.aggroMultiplier,targetAggroMultiplier:targetStats.aggroMultiplier},rng,reaction,helpers:keptReactionHelpers(slot,combat,rng,{blocked})});
  // Belowcaller Whispers can grow when a debuffed enemy attack removes no HP because defenses stopped it.
  if(source.side==='enemy'&&actualHpRemoved===0){for(const owner of combat.actors||[]){if(owner.side===target.side&&isSubclassResourceActive(owner,'Belowcaller')&&(source.effects||[]).some(e=>e.sourceActorId===owner.id&&e.negative)&&!owner.subclassState?.betweenTurnFlags?.whisperPrevented){gainSubclassResource(owner,1);owner.subclassState.betweenTurnFlags.whisperPrevented=true;}}}
  return { hit: true, dodged: false, blocked, blockSource, critical: crit.critical, recursiveCritical: crit.recursive, damageBeforeDefense: crit.amount, damageAfterDefenseBeforeShield: preShield, shieldAbsorbed: roundFinal(shieldResult.absorbed), actualHpRemoved, finalDamage: actualHpRemoved, redirected: redirectReductionPct>0, resolvedTargetId:target.id, targetHadShieldBefore, sourceAggroMultiplier:sourceStats.aggroMultiplier, targetAggroMultiplier:targetStats.aggroMultiplier };
}

export function resolveHealComponent(slot, combat, source, target, ability, component, { rng = Math.random, finalHealingPct = 0, confluence = false, canCrit = true } = {}) {
  const keptPre=keptBeforeHeal({slot,combat,source,target,ability,component,rng});
  const sourceStats = getActorDerivedCombatStats(source, { ability, target, componentType: 'heal', confluence, combat });
  const targetStats = getActorDerivedCombatStats(target, { componentType: 'heal-target', combat });
  let raw = scaledBaseAmount(component.base, keptScaling(source,ability,component.scaling||{}), effectiveKeptStats(source)) * Math.max(0, 1 + (Number(finalHealingPct || 0)+Number(keptPre.finalHealingPct||0)) / 100);
  const crit = canCrit ? resolveCritical(raw, { chancePct: sourceStats.healingCritChancePct, criticalDamagePct: sourceStats.healingCriticalDamagePct, rng }) : { amount: raw, critical: false, recursive: false };
  const modified = applyHealingModifiers(crit.amount, sourceStats.outgoingHealingPct, targetStats.incomingHealingPct);
  const amount = roundFinal(modified);
  const before = Math.max(0, Number(target.resources.hp || 0));
  const maxHp = Math.max(0, Number(target.resources.maxHp || 0));
  const actualRestored = Math.min(Math.max(0, maxHp - before), amount);
  target.resources.hp = Math.min(maxHp, before + actualRestored);
  keptAfterHeal({slot,combat,source,target,ability,component,result:{amount,actualRestored,overheal:Math.max(0,amount-actualRestored),critical:crit.critical},rng});
  recordSubclassHeal(source,target,{hpBeforePct:maxHp>0?before/maxHp*100:0,actualRestored});
  markCampaignMetric(slot, source.id, 'healingDone', actualRestored);
  return { amount, actualRestored, overheal: Math.max(0, amount - actualRestored), critical: crit.critical, recursiveCritical: crit.recursive };
}

export function resolvePercentOfActualDamageHeal(slot, combat, source, target, actualHpRemoved, percent, { outgoingApplies = true, ability = null, healKind = null, damageType = null } = {}) {
  const sourceStats = getActorDerivedCombatStats(source, { componentType: 'heal', combat });
  const targetStats = getActorDerivedCombatStats(target, { componentType: 'heal-target', combat });
  let raw = Math.max(0, Number(actualHpRemoved || 0)) * Math.max(0, Number(percent || 0)) / 100;
  const outgoing = outgoingApplies ? sourceStats.outgoingHealingPct : 0;
  const modified = applyHealingModifiers(raw, outgoing, targetStats.incomingHealingPct);
  const amount = roundFinal(modified);
  const before = Number(target.resources.hp || 0);
  const actualRestored = Math.min(Math.max(0, Number(target.resources.maxHp || 0) - before), amount);
  target.resources.hp = Math.min(target.resources.maxHp, before + actualRestored);
  recordSubclassHeal(source,target,{hpBeforePct:Number(target.resources.maxHp||0)>0?before/Number(target.resources.maxHp)*100:0,actualRestored});
  markCampaignMetric(slot, source.id, 'healingDone', actualRestored);
  if(healKind==='lifesteal'&&actualRestored>0&&source?.side==='party'&&slot?.campaign?.state?.expedition?.regionId==='ruined-vampiric-plains'){combat.metrics=combat.metrics||{};combat.metrics.plainsLifestealHealing=Number(combat.metrics.plainsLifestealHealing||0)+actualRestored;const type=String(damageType||'').toLowerCase();if(type==='fire')combat.metrics.plainsFireLifestealHealing=Number(combat.metrics.plainsFireLifestealHealing||0)+actualRestored;if(type==='poison')combat.metrics.plainsPoisonLifestealHealing=Number(combat.metrics.plainsPoisonLifestealHealing||0)+actualRestored;if(type==='dark')combat.metrics.plainsDarkLifestealHealing=Number(combat.metrics.plainsDarkLifestealHealing||0)+actualRestored;}
  return { amount, actualRestored };
}

export function resolveShieldComponent(combat, source, target, ability, component, { finalShieldPct = 0, confluence = false } = {}) {
  const keptPre=keptBeforeShield({combat,source,target,ability,component});
  const sourceStats = getActorDerivedCombatStats(source, { ability, target, componentType: 'shield', confluence, combat });
  const raw = scaledBaseAmount(component.base, keptScaling(source,ability,component.scaling||{}), effectiveKeptStats(source));
  const amount = roundFinal(raw * Math.max(0, 1 + (sourceStats.shieldStrengthPct + Number(finalShieldPct || 0) + Number(keptPre.finalShieldPct||0)) / 100));
  grantCombatShield(combat, target.id, amount, { sourceActorId: source.id, abilityId: ability.id });
  syncCombatShield(target);
  keptAfterShield({combat,source,target,ability,component,result:{amount}});
  return { amount };
}

export function hasNegativeEffect(actor) { return (actor?.effects || []).some(effect => effect.negative); }

export function applyStatus(combat, actorId, { id, sourceActorId, negative = false, removable = true, modifiers = {}, duration = null, memory = {}, stacking = 'refresh' }) {
  const target=getCombatActor(combat,actorId);
  const source=sourceActorId?getCombatActor(combat,sourceActorId):null;
  const statusKind=memory?.statusId||memory?.statusKind||null;
  const periodic=Boolean(memory?.tickBase||memory?.tickPctMaxHp);
  const enrichedMemory={...memory};
  if(periodic){enrichedMemory.dot=true;enrichedMemory.tickTiming=enrichedMemory.tickTiming||'owner-turn-start';enrichedMemory.canCrit=enrichedMemory.canCrit!==false;if(source&&!enrichedMemory.critSnapshot){const ds=getActorDerivedCombatStats(source,{componentType:'damage',combat});enrichedMemory.critSnapshot={chancePct:ds.damageCritChancePct,criticalDamagePct:ds.criticalDamagePct};}}
  if(['Burn','Poison','Bleed'].includes(statusKind)&&periodic&&stacking==='refresh')stacking='stack-refresh';
  const effect={ id, sourceActorId, negative, removable, modifiers, duration, memory:enrichedMemory, stacking };
  const added=addCombatEffect(combat, actorId, effect);
  if(added&&target){const actual=(target.effects||[]).filter(e=>e.id===id&&e.sourceActorId===sourceActorId).at(-1)||effect;keptOnStatusApplied({combat,source,target,effect:actual});if(combat){combat.metrics=combat.metrics||{};if(negative&&source?.side==='party'&&target.side==='enemy'){combat.metrics.negativeStatusesApplied=Number(combat.metrics.negativeStatusesApplied||0)+1;const statusText=String(statusKind||id).toLowerCase();if(statusText.includes('poison'))combat.metrics.poisonStatusesApplied=Number(combat.metrics.poisonStatusesApplied||0)+1;if(statusText.includes('bleed'))combat.metrics.bleedsApplied=Number(combat.metrics.bleedsApplied||0)+1;}if(negative&&source?.side==='enemy'&&target.side==='party')combat.metrics.negativeEffectsSuffered=Number(combat.metrics.negativeEffectsSuffered||0)+1;}}
  return added;
}
