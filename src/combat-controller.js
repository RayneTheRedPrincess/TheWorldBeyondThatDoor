import { MAX_PERSISTED_COMBAT_LOG_ENTRIES } from './constants.js';
import { BASE_MAX_ENERGY, baseDerivedStats, resolveCritical, applyDamageReduction } from './combat-math.js';
import { createBaseClassState, resetOwnTurnFlags, resetBetweenTurnFlags, resourceValue } from './base-class-state.js';
import { createSubclassState, resetSubclassTurnFlags, resetSubclassBetweenTurnFlags, subclassBaseClass, tickSubclassEndOwnTurn, subclassPassiveModifiers } from './subclass-state.js';
import { createKeptBattleState, keptStartingSubclassState, resetKeptTurnFlags, resetKeptRoundFlags, effectiveKeptStats, keptGlobalModifiers, keptResistanceBonus } from './kept-impression-state.js';
import { initializeKeptCombat, keptBeforeTurnStart, keptAfterTurnStart, keptEndTurn, keptStartRound, keptOnStatusExpired } from './kept-impression-runtime.js';
import { mergeCombatEffect, periodicStatusDescriptor } from './status-engine.js';
const PLAYER_ACTIONS = new Set(['charge', 'ability', 'guard', 'consumable']);
const SIDES = new Set(['party', 'enemy']);
const CONTROLS = new Set(['player', 'ai']);

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function nowIso() { return new Date().toISOString(); }
function asInt(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function nonNegative(value, fallback = 0) { return Math.max(0, asInt(value, fallback)); }
function randomUnit(rng) { const n = Number(rng()); return Number.isFinite(n) ? Math.min(0.999999999999, Math.max(0, n)) : 0; }
function rollD6(rng) { return 1 + Math.floor(randomUnit(rng) * 6); }
function actorAlive(actor) { return Number(actor?.resources?.hp || 0) > 0; }
function trimCombatLog(combat) {
  if (!Array.isArray(combat?.log) || combat.log.length <= MAX_PERSISTED_COMBAT_LOG_ENTRIES) return;
  combat.log.splice(0, combat.log.length - MAX_PERSISTED_COMBAT_LOG_ENTRIES);
}

export function nextCombatPresentationId(combat, kind = 'event') {
  if (!combat) return null;
  combat.presentationSequence = Math.max(0, Number(combat.presentationSequence || 0)) + 1;
  return `${combat.id || combat.encounterId || 'combat'}:${String(kind || 'event')}:${combat.presentationSequence}`;
}

export function appendCombatLog(combat, entry = {}, { presentation = false } = {}) {
  if (!combat) return null;
  const logged = { ...clone(entry) };
  if (presentation && !logged.presentationId) logged.presentationId = nextCombatPresentationId(combat, logged.type || 'event');
  combat.log = Array.isArray(combat.log) ? combat.log : [];
  combat.log.push(logged);
  trimCombatLog(combat);
  return logged;
}

export function finalizeCombatOutcome(combat, { now = nowIso() } = {}) {
  if (!combat) return null;
  const outcome = getCombatOutcome(combat);
  if (!outcome) return null;
  combat.state = 'complete';
  combat.outcome = outcome;
  combat.completedAt = combat.completedAt || now;
  combat.currentActorId = null;
  combat.turn = null;
  trimCombatLog(combat);
  return outcome;
}

export function calculateInitiativeBonus({ level = 1, dex = 0, explicitBonus = 0 } = {}) {
  const levelBonus = Math.floor(Math.max(0, Number(level) || 0) / 3);
  const dexBonus = Math.floor(Math.max(0, Number(dex) || 0) / 9);
  const explicit = Number.isFinite(Number(explicitBonus)) ? Number(explicitBonus) : 0;
  return { levelBonus, dexBonus, explicitBonus: explicit, totalBonus: levelBonus + dexBonus + explicit };
}

export function createCombatActor(spec = {}, { slotIndex = 1 } = {}) {
  const id = String(spec.id || '').trim();
  const name = String(spec.name || '').trim();
  const side = String(spec.side || '').trim();
  const kind = String(spec.kind || (side === 'enemy' ? 'enemy' : 'vessel')).trim();
  const control = String(spec.control || (kind === 'vessel' ? 'player' : 'ai')).trim();
  if (!id) throw new Error('Combat actor id is required.');
  if (!name) throw new Error('Combat actor name is required.');
  if (!SIDES.has(side)) throw new Error(`Combat actor ${id} must be on party or enemy side.`);
  if (!CONTROLS.has(control)) throw new Error(`Combat actor ${id} must use player or ai control.`);
  const isSummon = kind === 'summon' || spec.real === false;
  const maxHp = Number(spec.maxHp);
  if (!Number.isFinite(maxHp) || maxHp <= 0) throw new Error(`Combat actor ${id} requires a positive maxHp supplied by canonical content.`);
  const hp = Math.min(maxHp, Math.max(0, Number.isFinite(Number(spec.hp)) ? Number(spec.hp) : maxHp));
  const level = Math.max(0, asInt(spec.level, 1));
  const dex = Math.max(0, Number(spec.stats?.DEX ?? spec.dex ?? 0) || 0);
  const explicitInitiativeBonus = Number(spec.explicitInitiativeBonus || 0) || 0;
  const actor = {
    id,
    name,
    side,
    kind,
    control,
    real: !isSummon,
    battlefieldSlot: {
      side: side === 'party' ? 'left' : 'right',
      index: Math.max(1, asInt(spec.slotIndex, slotIndex)),
      key: `${side === 'party' ? 'left' : 'right'}-${Math.max(1, asInt(spec.slotIndex, slotIndex))}`
    },
    summonOrder: isSummon ? Math.max(1, asInt(spec.summonOrder, slotIndex)) : null,
    summonOwnerId: isSummon ? (spec.summonOwnerId || spec.ownerId || null) : null,
    primaryDamageType: isSummon ? (spec.primaryDamageType || spec.damageType || null) : null,
    level,
    stats: { ...(spec.stats || {}), DEX: dex },
    explicitInitiativeBonus,
    initiative: {
      baseRoll: null,
      levelBonus: 0,
      dexBonus: 0,
      explicitBonus: explicitInitiativeBonus,
      total: null,
      tieBreak: null
    },
    resources: {
      hp,
      maxHp,
      shield: Math.max(0, Number(spec.shield || 0) || 0) + Math.max(0, Math.round(maxHp * Number(spec.startingShieldPctMax || 0) / 100)),
      energy: 0,
      maxEnergy: Math.max(1, Number.isFinite(Number(spec.maxEnergy)) ? Number(spec.maxEnergy) : BASE_MAX_ENERGY),
      shieldLayers: []
    },
    race: spec.race || null,
    baseClass: spec.baseClass || null,
    subclass: spec.subclass || null,
    combatRole: spec.combatRole || null,
    personality: spec.personality || null,
    priority: spec.priority || null,
    portraitAsset: spec.portraitAsset || spec.portrait || null,
    expReward: Math.max(0, Number(spec.expReward || 0)),
    onyxReward: Math.max(0, Number(spec.onyxReward || 0)),
    enemyTemplateId: spec.enemyTemplateId || null,
    enemyAi: spec.enemyAi ? clone(spec.enemyAi) : null,
    basicAttack: spec.basicAttack ? clone(spec.basicAttack) : null,
    enemyAbilities: Array.isArray(spec.enemyAbilities) ? clone(spec.enemyAbilities) : [],
    weaponType: spec.weaponType || null,
    equipment: clone(spec.equipment || {}),
    equipmentModifiers: clone(spec.equipmentModifiers || {}),
    equipmentAbilities: Array.isArray(spec.equipmentAbilities) ? clone(spec.equipmentAbilities) : [],
    armorCategory: spec.armorCategory || null,
    consumableIds: Array.isArray(spec.consumableIds) ? [...spec.consumableIds.map(String)] : [],
    consumableUsesThisBattle: 0,
    abilityIds: Array.isArray(spec.abilityIds) ? [...new Set(spec.abilityIds.map(String))] : [],
    subclassAbilityIds: Array.isArray(spec.subclassAbilityIds) ? [...new Set(spec.subclassAbilityIds.map(String))] : [],
    classless: Boolean(spec.classless),
    keptImpressions: Array.isArray(spec.keptImpressions) ? [...new Set(spec.keptImpressions.map(String))] : [],
    keptImpressionChoices: clone(spec.keptImpressionChoices || {}),
    resourceImprint: spec.resourceImprint ? clone(spec.resourceImprint) : null,
    resistances: { ...(spec.resistances || {}) },
    defense: {
      guardActive: false,
      explicitBlockChancePct: Number(spec.blockChanceBonusPct || 0) || 0,
      explicitDodgeChancePct: Number(spec.dodgeChanceBonusPct || 0) || 0,
      explicitBlockedDamageReductionPct: Number(spec.blockedDamageReductionBonusPct || 0) || 0,
      armorMitigationPct: Math.max(0, Number(spec.armorMitigationPct || 0) || 0)
    },
    cooldowns: {},
    effects: [],
    classState: createBaseClassState(spec.resourceImprint?.baseClass || subclassBaseClass(spec.resourceImprint?.subclass) || spec.baseClass, spec.classState || {}),
    subclassState: createSubclassState(spec.subclass || spec.resourceImprint?.subclass || null, spec.subclassState || {}),
    combatMemory: { enemyDamagedAllySinceLastOwnTurn: {}, ...(spec.combatMemory || {}) },
    turnControl: {
      turnsStarted: 0,
      skipNextAction: false
    },
    keptState: createKeptBattleState(Array.isArray(spec.keptImpressions)?[...new Set(spec.keptImpressions.map(String))]:[])
  };
  keptStartingSubclassState(actor);
  return actor;
}

function ensureUniqueActors(actors) {
  const ids = new Set();
  for (const actor of actors) {
    if (ids.has(actor.id)) throw new Error(`Duplicate combat actor id: ${actor.id}`);
    ids.add(actor.id);
  }
}

export function calculateInitiativeQueue(actors, { rng = Math.random } = {}) {
  const realActors = actors.filter(actor => actor.real !== false && actorAlive(actor));
  const summons = actors.filter(actor => actor.real === false && actorAlive(actor));
  for (const actor of realActors) {
    const bonuses = calculateInitiativeBonus({ level: actor.level, dex: actor.stats?.DEX, explicitBonus: actor.explicitInitiativeBonus });
    const baseRoll = rollD6(rng);
    actor.initiative = {
      baseRoll,
      levelBonus: bonuses.levelBonus,
      dexBonus: bonuses.dexBonus,
      explicitBonus: bonuses.explicitBonus,
      total: baseRoll + bonuses.totalBonus,
      tieBreak: randomUnit(rng)
    };
  }
  realActors.sort((a, b) => {
    const total = Number(b.initiative.total || 0) - Number(a.initiative.total || 0);
    if (total) return total;
    return Number(a.initiative.tieBreak || 0) - Number(b.initiative.tieBreak || 0);
  });
  summons.sort((a, b) => {
    const order = Number(a.summonOrder || 0) - Number(b.summonOrder || 0);
    return order || a.id.localeCompare(b.id);
  });
  return [...realActors.map(actor => actor.id), ...summons.map(actor => actor.id)];
}

export function createCombatState({ encounterId, actors: actorSpecs = [], rng = Math.random, now = nowIso() } = {}) {
  if (!String(encounterId || '').trim()) throw new Error('Combat encounter id is required.');
  if (!Array.isArray(actorSpecs) || !actorSpecs.length) throw new Error('Combat requires an actor roster.');
  const sideCounters = { party: 0, enemy: 0 };
  const actors = actorSpecs.map(spec => {
    const side = String(spec.side || '');
    sideCounters[side] = Number(sideCounters[side] || 0) + 1;
    return createCombatActor(spec, { slotIndex: sideCounters[side] });
  });
  ensureUniqueActors(actors);
  if (!actors.some(actor => actor.side === 'party' && actor.real)) throw new Error('Combat requires at least one real party combatant.');
  if (!actors.some(actor => actor.side === 'enemy' && actor.real)) throw new Error('Combat requires at least one real enemy combatant.');
  const queue = calculateInitiativeQueue(actors, { rng });
  const combat = {
    id: `combat-${String(encounterId)}`,
    encounterId: String(encounterId),
    state: 'ready',
    startedAt: now,
    round: 1,
    actors,
    queue,
    queueIndex: 0,
    currentActorId: null,
    turn: null,
    log: [],
    metrics: {},
    initiativeCadence: 'initial-and-explicit-recalculation-only'
  };
  initializeKeptCombat(combat, { rng });
  return combat;
}

function getActor(combat, actorId) {
  return combat?.actors?.find(actor => actor.id === actorId) || null;
}

export function getCombatOutcome(combat) {
  const realPartyAlive = (combat?.actors || []).some(actor => actor.real && actor.side === 'party' && actorAlive(actor));
  const realEnemyAlive = (combat?.actors || []).some(actor => actor.real && actor.side === 'enemy' && actorAlive(actor));
  if (!realPartyAlive) return 'defeat';
  if (!realEnemyAlive) return 'victory';
  return null;
}

function nextQueuedLivingActorId(combat) {
  while (combat.queueIndex < combat.queue.length) {
    const id = combat.queue[combat.queueIndex];
    const actor = getActor(combat, id);
    if (actor && actorAlive(actor)) return id;
    combat.queueIndex += 1;
  }
  return null;
}

function rebuildRoundFromExistingOrder(combat) {
  const known = new Set(combat.queue);
  const survivors = combat.queue.filter(id => {
    const actor = getActor(combat, id);
    return actor && actorAlive(actor);
  });
  const missingReal = combat.actors.filter(actor => actor.real && actorAlive(actor) && !known.has(actor.id));
  const missingSummons = combat.actors.filter(actor => !actor.real && actorAlive(actor) && !known.has(actor.id))
    .sort((a, b) => Number(a.summonOrder || 0) - Number(b.summonOrder || 0));
  combat.queue = [...survivors, ...missingReal.map(actor => actor.id), ...missingSummons.map(actor => actor.id)];
  combat.queueIndex = 0;
}


function effectExpiredAtTurnStart(effect, actorId) {
  return effect?.duration?.mode === 'actor-turn-start' && effect.duration.actorId === actorId;
}

function sourceForEffect(combat, effect) {
  return effect?.sourceActorId ? getActor(combat, effect.sourceActorId) : null;
}

function expireEffect(combat, owner, effect, { natural = true, remainingBefore = 0 } = {}) {
  const abilityId = effect?.memory?.expiresShieldAbilityId;
  if (abilityId) {
    owner.resources.shieldLayers = (owner.resources.shieldLayers || []).filter(layer => !(layer.abilityId === abilityId && (!effect.sourceActorId || layer.sourceActorId === effect.sourceActorId)));
    syncCombatShield(owner);
  }
  keptOnStatusExpired({ combat, source: sourceForEffect(combat, effect), target: owner, effect, natural, remainingBefore });
  if(combat&&owner?.side==='party'&&effect?.negative){combat.metrics=combat.metrics||{};combat.metrics.negativeEffectsExpired=Number(combat.metrics.negativeEffectsExpired||0)+1;}
}

function statusSourceCrit(combat, effect) {
  const source = sourceForEffect(combat, effect);
  if (!source) return null;
  const base = baseDerivedStats(effectiveKeptStats(source));
  const sub = subclassPassiveModifiers(source, { componentType: 'damage', combat });
  const kept = keptGlobalModifiers(source, { componentType: 'damage', combat });
  let chance = Number(base.damageCritChancePct || 0) + Number(sub.critChancePct || 0) + Number(kept.critChancePct || 0);
  let critDamage = Number(base.criticalDamagePct || 150) + Number(sub.critDamagePct || 0) + Number(kept.critDamagePct || 0);
  const resource = Number(resourceValue(source) || 0);
  if (source.baseClass === 'Rogue' && resource >= 4) chance += 10;
  if (source.baseClass === 'Mage' && resource >= 5) critDamage += 10;
  if (source.baseClass === 'Sorcerer') { critDamage += resource * 3; if (resource >= 4) chance += 10; }
  chance += (source.effects || []).reduce((sum,e)=>sum+Number(e?.modifiers?.damageCritChancePct||0),0) + Number(source.equipmentModifiers?.damageCritChancePct||0);
  critDamage += (source.effects || []).reduce((sum,e)=>sum+Number(e?.modifiers?.criticalDamagePct||0),0) + Number(source.equipmentModifiers?.criticalDamagePct||0);
  return { chancePct: Math.max(0,chance), criticalDamagePct: Math.max(0,critDamage) };
}

function periodicStatusDamage(combat, owner, effect, timing, { rng = Math.random } = {}) {
  if (effect?.memory?.tickTiming !== timing || !actorAlive(owner)) return 0;
  const descriptor = periodicStatusDescriptor({ ...effect, memory: { ...(effect.memory || {}), dot: true } }, owner, timing);
  if (!descriptor) return 0;
  let raw = Number(descriptor.raw || 0);
  const critSnapshot = effect.memory?.critSnapshot || statusSourceCrit(combat,effect);
  let crit = { amount: raw, critical: false, recursive: false };
  if (effect.memory?.canCrit !== false && critSnapshot) crit = resolveCritical(raw, { chancePct: critSnapshot.chancePct, criticalDamagePct: critSnapshot.criticalDamagePct, rng });
  const ownerSub=subclassPassiveModifiers(owner,{componentType:'defense',combat});
  const ownerKept=keptGlobalModifiers(owner,{componentType:'defense',combat});
  const incomingPct=(owner.effects||[]).reduce((sum,e)=>sum+Number(e?.modifiers?.incomingDamagePct||0),0)+Number(ownerSub?.incomingDamagePct||0)+Number(ownerKept?.incomingDamagePct||0)+Number(owner.equipmentModifiers?.incomingDamagePct||0);
  let amount=applyDamageReduction(crit.amount,-incomingPct);
  amount=applyDamageReduction(amount,Number(owner.defense?.armorMitigationPct||0));
  const kind = String(effect.memory.statusKind || effect.memory.statusId || '');
  const damageType = effect.memory.damageType || descriptor.damageType || (kind === 'Burn' ? 'Fire' : kind === 'Poison' ? 'Poison' : kind === 'Bleed' ? 'Physical' : 'Force');
  const resistance = Math.max(-100, Math.min(100, Number(owner.resistances?.[damageType] || 0)+Number(keptResistanceBonus(owner,damageType)||0)));
  amount=applyDamageReduction(amount,resistance);
  let final=Math.max(0,Math.round(amount));
  const shieldResult=consumeCombatShield(combat,owner.id,final);
  final=Math.max(0,Math.round(shieldResult.remainingDamage));
  if (effect.memory.nonlethal) final = Math.min(final, Math.max(0, Number(owner.resources.hp || 0) - 1));
  else final = Math.min(final, Math.max(0, Number(owner.resources.hp || 0)));
  owner.resources.hp = Math.max(0, Number(owner.resources.hp || 0) - final);
  if (final || shieldResult.absorbed) combat.log?.push({ type: 'status-damage', actorId: owner.id, sourceActorId: effect.sourceActorId || null, status: kind || effect.id, damageType, critical:Boolean(crit.critical), recursiveCritical:Boolean(crit.recursive), shieldAbsorbed:Math.round(Number(shieldResult.absorbed||0)), amount: final });
  return final;
}

function processTurnStartEffects(combat, actor, { rng = Math.random } = {}) {
  for (const owner of combat.actors || []) {
    const expired=[];
    owner.effects = (owner.effects || []).filter(effect => {
      if (effectExpiredAtTurnStart(effect, actor.id)) { expired.push(effect); return false; }
      return true;
    });
    for (const effect of expired) expireEffect(combat, owner, effect, { natural: true, remainingBefore: Number(effect?.duration?.remaining || 0) });
  }
  for (const effect of [...(actor.effects || [])]) periodicStatusDamage(combat, actor, effect, 'owner-turn-start', { rng });
}

function processTurnEndEffects(combat, actor, { rng = Math.random } = {}) {
  for (const effect of [...(actor.effects || [])]) periodicStatusDamage(combat, actor, effect, 'owner-turn-end', { rng });
  for (const owner of combat.actors || []) {
    const kept = [];
    const expired = [];
    for (const effect of owner.effects || []) {
      if (effect?.duration?.mode === 'actor-turn-end' && effect.duration.actorId === actor.id) {
        const appliedTurn = Number(effect.duration.appliedTurn || 0);
        let remaining = Number(effect.duration.remaining || 0);
        const before=remaining;
        if (appliedTurn < Number(actor.turnControl?.turnsStarted || 0)) remaining -= 1;
        if (remaining > 0) kept.push({ ...effect, duration: { ...effect.duration, remaining } });
        else expired.push({ effect, before });
      } else kept.push(effect);
    }
    owner.effects = kept;
    for (const entry of expired) expireEffect(combat, owner, entry.effect, { natural: true, remainingBefore: entry.before });
  }
}

function tickCooldownsAtEndOfTurn(actor) {
  const changed = [];
  for (const [abilityId, state] of Object.entries(actor.cooldowns || {})) {
    const current = Number(state?.remaining || 0);
    if (current <= 0) { delete actor.cooldowns[abilityId]; continue; }
    if (Number(state.appliedOnTurn || 0) >= Number(actor.turnControl?.turnsStarted || 0)) continue;
    const remaining = Math.max(0, current - 1);
    if (remaining === 0) delete actor.cooldowns[abilityId];
    else actor.cooldowns[abilityId] = { ...state, remaining };
    changed.push({ abilityId, before: current, after: remaining });
  }
  return changed;
}

function beginCurrentTurn(combat, { now = nowIso(), rng = Math.random } = {}) {
  while (true) {
    const actorId = nextQueuedLivingActorId(combat);
    if (!actorId) return false;
    const actor = getActor(combat, actorId);
    actor.defense.guardActive = false;
    resetOwnTurnFlags(actor);
    resetBetweenTurnFlags(actor);
    resetSubclassTurnFlags(actor);
    resetSubclassBetweenTurnFlags(actor);
    resetKeptTurnFlags(actor);
    processTurnStartEffects(combat, actor, { rng });
    const keptStart = keptBeforeTurnStart({ combat, actor });
    if (!actorAlive(actor)) {
      appendCombatLog(combat, { type:'turn-start-defeat-by-status', round:combat.round, actorId:actor.id, at:now }, { presentation:true });
      combat.queueIndex += 1;
      const outcome=getCombatOutcome(combat);
      if(outcome){finalizeCombatOutcome(combat,{now});return true;}
      continue;
    }
    actor.resources.energy = Math.min(Number(actor.resources.maxEnergy || BASE_MAX_ENERGY), Math.max(0, Number(actor.resources.energy || 0)) + 1);
    const bonusEnergy = Math.max(0, Number(keptStart?.bonusEnergyAfterNatural || 0));
    const beforeBonus = Number(actor.resources.energy || 0);
    actor.resources.energy = Math.min(Number(actor.resources.maxEnergy || BASE_MAX_ENERGY), beforeBonus + bonusEnergy);
    const bonusGranted = Number(actor.resources.energy || 0) - beforeBonus;
    keptAfterTurnStart({ combat, actor, bonusEnergyGranted: bonusGranted });
    actor.turnControl.turnsStarted = Number(actor.turnControl.turnsStarted || 0) + 1;
    const skipped = Boolean(actor.turnControl.skipNextAction);
    if (skipped) actor.turnControl.skipNextAction = false;
    combat.currentActorId = actor.id;
    combat.turn = {
      actorId: actor.id,
      startedAt: now,
      naturalEnergyGranted: 1,
      bonusEnergyGranted: bonusGranted,
      actionTaken: skipped,
      actionType: skipped ? 'skipped' : null,
      actionPayload: null,
      canEndTurn: skipped
    };
    combat.log.push({ type: 'turn-start', round: combat.round, actorId: actor.id, naturalEnergy: 1, bonusEnergy: bonusGranted, at: now });
    if (skipped) combat.log.push({ type: 'action-skipped', round: combat.round, actorId: actor.id, at: now });
    combat.state = 'active';
    return true;
  }
}

export function beginCombat(combat, { now = nowIso() } = {}) {
  const next = clone(combat);
  if (next.state !== 'ready') return { ok: false, error: 'Combat has already begun.' };
  const outcome = getCombatOutcome(next);
  if (outcome) return { ok: false, error: `Combat roster is already in ${outcome} state.` };
  if (!beginCurrentTurn(next, { now })) return { ok: false, error: 'No living combatant can begin the battle.' };
  return { ok: true, combat: next };
}

export function attachCombatToCampaign(slot, { actorSpecs, rng = Math.random, now = nowIso() } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state) return { ok: false, error: 'No active campaign.' };
  const encounter = slot.campaign.state.expedition?.encounter;
  if (slot.campaign.state.expedition?.state !== 'combat-pending' || !encounter?.combat) return { ok: false, error: 'No combat encounter is waiting for a roster.' };
  if (slot.campaign.state.combat) return { ok: false, error: 'A combat state is already attached.' };
  try {
    const ready = createCombatState({ encounterId: encounter.id, actors: actorSpecs, rng, now });
    const begun = beginCombat(ready, { now });
    if (!begun.ok) return begun;
    const next = clone(slot);
    next.campaign.state.combat = begun.combat;
    return { ok: true, slot: next, combat: clone(begun.combat) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getCombatView(slot) {
  return slot?.campaign?.active && slot.campaign.state?.combat ? clone(slot.campaign.state.combat) : null;
}

export function summonCombatActor(combat, spec = {}, { ownerId = null } = {}) {
  if (!combat || !Array.isArray(combat.actors)) return { ok:false, error:'No active combat roster.' };
  const sequence = 1 + combat.actors.filter(actor => actor.real === false).length;
  const idBase = String(spec.id || 'summon');
  const uniqueId = `${idBase}-${sequence}`;
  if (combat.actors.some(actor => actor.id === uniqueId)) return { ok:false, error:'Summon id collision.' };
  try {
    const actor = createCombatActor({ ...clone(spec), id:uniqueId, side:spec.side || 'enemy', kind:'summon', real:false, summonOrder:sequence, summonOwnerId:ownerId || spec.summonOwnerId || null }, { slotIndex:combat.actors.filter(a=>a.side===(spec.side||'enemy')).length+1 });
    combat.actors.push(actor);
    // Summons act after already-scheduled combatants in the current round and remain
    // at the end of subsequent rounds, preserving the sealed initiative cadence.
    combat.queue = Array.isArray(combat.queue) ? combat.queue : [];
    combat.queue.push(actor.id);
    appendCombatLog(combat,{type:'summon',actorId:ownerId||null,summonId:actor.id,name:actor.name,round:combat.round},{presentation:true});
    return {ok:true,actor};
  } catch (error) { return {ok:false,error:error instanceof Error?error.message:String(error)}; }
}

function commitAction(combat, action) {
  if (!combat?.turn || combat.state !== 'active') return { ok: false, error: 'No active turn.' };
  if (combat.turn.actionTaken) return { ok: false, error: 'This combatant has already acted this turn.' };
  const actor = getActor(combat, combat.turn.actorId);
  if (!actor || !actorAlive(actor)) return { ok: false, error: 'The current combatant cannot act.' };
  combat.turn.actionTaken = true;
  combat.turn.actionType = action.type;
  combat.turn.actionPayload = clone(action.payload || null);
  combat.turn.canEndTurn = true;
  appendCombatLog(combat, { type: 'action', round: combat.round, actorId: actor.id, action: action.type, payload: clone(action.payload || null), at: nowIso() }, { presentation: true });
  return { ok: true, actor };
}

export function takePlayerTurnAction(slot, action = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const combat = next.campaign.state.combat;
  const actor = getActor(combat, combat.turn?.actorId);
  if (!actor || actor.control !== 'player') return { ok: false, error: 'It is not a player-controlled turn.' };
  const type = String(action.type || '');
  if (!PLAYER_ACTIONS.has(type)) return { ok: false, error: 'Choose Charge, Ability, Guard, or Consumable.' };
  if (combat.turn?.actionTaken) return { ok: false, error: 'Only one action may be taken per turn.' };

  if (type === 'ability') {
    if (!String(action.abilityId || '').trim()) return { ok: false, error: 'An ability id is required.' };
    if (action.resolved !== true) return { ok: false, error: 'Ability effects must resolve before I6 locks the action.' };
  }
  if (type === 'consumable') {
    if (!String(action.consumableId || '').trim()) return { ok: false, error: 'A consumable id is required.' };
    if (action.resolved !== true) return { ok: false, error: 'Consumable effects must resolve before I6 locks the action.' };
  }

  if (type === 'charge') actor.resources.energy = Math.min(Number(actor.resources.maxEnergy || BASE_MAX_ENERGY), Math.max(0, Number(actor.resources.energy || 0)) + 1);
  if (type === 'guard') actor.defense.guardActive = true;
  const payload = type === 'ability' ? { abilityId: String(action.abilityId) }
    : type === 'consumable' ? { consumableId: String(action.consumableId) }
      : null;
  const committed = commitAction(combat, { type, payload });
  if (!committed.ok) return committed;
  return { ok: true, slot: next, combat: clone(combat), actor: clone(actor) };
}

export function commitResolvedAiAction(slot, { type = 'ability', payload = null } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const combat = next.campaign.state.combat;
  const actor = getActor(combat, combat.turn?.actorId);
  if (!actor || actor.control !== 'ai') return { ok: false, error: 'It is not an AI-controlled turn.' };
  const actionType = String(type || 'ability');
  if (actor.side === 'enemy' && ['guard','consumable'].includes(actionType)) return { ok: false, error: 'Enemies cannot Guard or use consumables.' };
  const committed = commitAction(combat, { type: actionType, payload });
  if (!committed.ok) return committed;
  return { ok: true, slot: next, combat: clone(combat) };
}

export function endCombatTurn(slot, { now = nowIso(), rng = Math.random } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const combat = next.campaign.state.combat;
  if (combat.state !== 'active' || !combat.turn) return { ok: false, error: 'No active turn.' };
  if (!combat.turn.canEndTurn) return { ok: false, error: 'Take one action before ending the turn.' };
  const endingActor = getActor(combat, combat.turn.actorId);
  if (endingActor) {
    keptEndTurn({ slot: next, combat, actor: endingActor });
    processTurnEndEffects(combat, endingActor, { rng });
    tickSubclassEndOwnTurn(endingActor);
    if (endingActor.baseClass === 'Paladin') endingActor.combatMemory.enemyDamagedAllySinceLastOwnTurn = {};
  }
  const cooldownTicks = endingActor ? tickCooldownsAtEndOfTurn(endingActor) : [];
  combat.log.push({ type: 'turn-end', round: combat.round, actorId: combat.turn.actorId, cooldownTicks, at: now });
  trimCombatLog(combat);
  combat.queueIndex += 1;
  combat.currentActorId = null;
  combat.turn = null;

  const outcome = finalizeCombatOutcome(combat, { now });
  if (outcome) return { ok: true, slot: next, combat: clone(combat), outcome };

  if (nextQueuedLivingActorId(combat)) {
    beginCurrentTurn(combat, { now });
    trimCombatLog(combat);
    return { ok: true, slot: next, combat: clone(combat), outcome: combat.state==='complete'?combat.outcome:null };
  }

  combat.round = Number(combat.round || 1) + 1;
  for (const actor of combat.actors || []) resetKeptRoundFlags(actor);
  keptStartRound(combat);
  rebuildRoundFromExistingOrder(combat);
  if (!beginCurrentTurn(combat, { now, rng })) return { ok: false, error: 'No living combatant is available for the next round.' };
  trimCombatLog(combat);
  return { ok: true, slot: next, combat: clone(combat), outcome: combat.state==='complete'?combat.outcome:null };
}

export function recalculateCombatInitiative(slot, { rng = Math.random } = {}) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const combat = next.campaign.state.combat;
  if (combat.turn) return { ok: false, error: 'Initiative cannot be recalculated in the middle of an active turn.' };
  combat.queue = calculateInitiativeQueue(combat.actors, { rng });
  combat.queueIndex = 0;
  return { ok: true, slot: next, combat: clone(combat) };
}

export function resolveDefenseOutcome(combat, targetActorId, { dodgeSucceeded = false, normalBlockSucceeded = false } = {}) {
  const actor = getActor(combat, targetActorId);
  if (!actor) return { ok: false, error: 'Unknown combat target.' };
  if (dodgeSucceeded) return { ok: true, outcome: 'dodge', guardActive: Boolean(actor.defense?.guardActive) };
  if (actor.defense?.guardActive) return { ok: true, outcome: 'block', source: 'guard', guardActive: true };
  if (normalBlockSucceeded) return { ok: true, outcome: 'block', source: 'normal', guardActive: false };
  return { ok: true, outcome: 'hit', guardActive: Boolean(actor.defense?.guardActive) };
}

export function setCombatActorHp(slot, actorId, hp) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const actor = getActor(next.campaign.state.combat, actorId);
  if (!actor) return { ok: false, error: 'Unknown combat actor.' };
  actor.resources.hp = Math.min(actor.resources.maxHp, Math.max(0, Number(hp) || 0));
  return { ok: true, slot: next, actor: clone(actor), outcome: getCombatOutcome(next.campaign.state.combat) };
}

export function setSkipNextCombatAction(slot, actorId, value = true) {
  if (!slot?.campaign?.active || !slot.campaign.state?.combat) return { ok: false, error: 'No active combat.' };
  const next = clone(slot);
  const actor = getActor(next.campaign.state.combat, actorId);
  if (!actor) return { ok: false, error: 'Unknown combat actor.' };
  actor.turnControl.skipNextAction = Boolean(value);
  return { ok: true, slot: next };
}


export function getCombatActor(combat, actorId) { return getActor(combat, actorId); }

export function addCombatEffect(combat, actorId, effect) {
  const actor = getActor(combat, actorId);
  if (!actor) return false;
  const merged = mergeCombatEffect(Array.isArray(actor.effects) ? actor.effects : [], clone(effect));
  actor.effects = merged.effects;
  return true;
}

export function removeOneNegativeCombatEffect(combat, actorId) {
  const actor = getActor(combat, actorId);
  if (!actor) return null;
  const index = (actor.effects || []).findIndex(effect => effect.negative && effect.removable !== false);
  if (index < 0) return null;
  return actor.effects.splice(index, 1)[0];
}

export function syncCombatShield(actor) {
  actor.resources.shieldLayers = (actor.resources.shieldLayers || []).filter(layer => Number(layer.amount || 0) > 0);
  actor.resources.shield = actor.resources.shieldLayers.reduce((sum, layer) => sum + Math.max(0, Number(layer.amount || 0)), 0);
  return actor.resources.shield;
}

export function grantCombatShield(combat, actorId, amount, metadata = {}) {
  const actor = getActor(combat, actorId);
  if (!actor) return 0;
  const finalAmount = Math.max(0, Number(amount || 0));
  if (!finalAmount) return 0;
  actor.resources.shieldLayers = Array.isArray(actor.resources.shieldLayers) ? actor.resources.shieldLayers : [];
  actor.resources.shieldLayers.push({ id: metadata.layerId || `shield-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, amount: finalAmount, sourceActorId: metadata.sourceActorId || null, abilityId: metadata.abilityId || null, tags: [...(metadata.tags || [])] });
  syncCombatShield(actor);
  return finalAmount;
}

export function consumeCombatShield(combat, actorId, incomingAmount) {
  const actor = getActor(combat, actorId);
  if (!actor) return { absorbed: 0, remainingDamage: Math.max(0, Number(incomingAmount || 0)), absorbedBySource: {} };
  let remaining = Math.max(0, Number(incomingAmount || 0));
  const bySource = {};
  for (const layer of actor.resources.shieldLayers || []) {
    if (remaining <= 0) break;
    const absorbed = Math.min(remaining, Math.max(0, Number(layer.amount || 0)));
    layer.amount -= absorbed;
    remaining -= absorbed;
    if (absorbed && layer.sourceActorId) bySource[layer.sourceActorId] = (bySource[layer.sourceActorId] || 0) + absorbed;
  }
  const before = Math.max(0, Number(incomingAmount || 0));
  syncCombatShield(actor);
  return { absorbed: before - remaining, remainingDamage: remaining, absorbedBySource: bySource };
}


export function pendingEnergyCostAdd(actor, intrinsicCost = 0) {
  if (!(Number(intrinsicCost || 0) > 0)) return 0;
  return (actor?.effects || []).reduce((sum, effect) => sum + Math.max(0, Number(effect?.memory?.nextEnergyAbilityCostAdd || 0)), 0);
}

export function consumeNextEnergyCostEffects(actor, intrinsicCost = 0) {
  if (!(Number(intrinsicCost || 0) > 0) || !actor) return [];
  const consumed = (actor.effects || []).filter(effect => Number(effect?.memory?.nextEnergyAbilityCostAdd || 0) > 0);
  if (consumed.length) {
    const set = new Set(consumed);
    actor.effects = (actor.effects || []).filter(effect => !set.has(effect));
  }
  return consumed.map(effect => clone(effect));
}

export function setAbilityCooldown(combat, actorId, abilityId, turns) {
  const actor = getActor(combat, actorId);
  if (!actor) return false;
  const count = Math.max(0, Math.trunc(Number(turns || 0)));
  if (!count) { delete actor.cooldowns[abilityId]; return true; }
  actor.cooldowns[abilityId] = { remaining: count, appliedOnTurn: Number(actor.turnControl?.turnsStarted || 0) };
  return true;
}

export function getAbilityCooldown(combat, actorId, abilityId) {
  const actor = getActor(combat, actorId);
  return Math.max(0, Number(actor?.cooldowns?.[abilityId]?.remaining || 0));
}
