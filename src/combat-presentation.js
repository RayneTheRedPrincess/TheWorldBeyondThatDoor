const num = value => Number(value || 0);
const pct = (value, max) => max > 0 ? Math.max(0, Math.min(100, (num(value) / num(max)) * 100)) : 0;

export function combatPresentationDelayMsForSpeed(value=1){const parsed=Number(value);const speed=Math.max(.1,Math.min(2,Number.isFinite(parsed)?parsed:1));return Math.round(900/speed);}

export function forestBattleScene(run = {}) {
  const depth = Number(run?.expedition?.depth || 1);
  const encounter = run?.expedition?.encounter || {};
  if (encounter.boss || depth >= 30) return 'heartwood-sanctum';
  if (encounter.miniboss || depth === 15) return 'thorn-hollow';
  if (encounter.source === 'trainer') return 'trainer-glade';
  if (depth >= 26) return 'deep-rootway';
  if (depth >= 16) return 'fungal-grove';
  if (depth >= 6) return 'mossed-path';
  return 'forest-clearing';
}


export function bogBattleScene(run = {}) {
  const depth = Number(run?.expedition?.depth || 1);
  const encounter = run?.expedition?.encounter || {};
  if (encounter.boss || depth >= 30) return 'bog-witch-king-field';
  if (encounter.miniboss || depth === 15) return 'bog-mirebound-pit';
  if (encounter.source === 'trainer') return 'bog-trainer-refuge';
  if (depth >= 26) return 'bog-miras-blight';
  if (depth >= 21) return 'bog-mourning-fields';
  if (depth >= 16) return 'bog-blackbanner-mire';
  if (depth >= 11) return 'bog-witchfen';
  if (depth >= 6) return 'bog-gravewater-march';
  return 'bog-drowned-verge';
}

export function regionalBattleScene(run = {}) {
  return run?.expedition?.regionId === 'bog-of-lost-souls' ? bogBattleScene(run) : forestBattleScene(run);
}

export function hpPercent(actor) { return pct(actor?.resources?.hp, actor?.resources?.maxHp); }
export function shieldPercent(actor) { return pct(actor?.resources?.shield, actor?.resources?.maxHp); }
export function energyPercent(actor) { return pct(actor?.resources?.energy, actor?.resources?.maxEnergy || 7); }

export function actorStatusTokens(actor = {}) {
  return (actor.effects || []).filter(Boolean).map((effect, index) => {
    const memory = effect.memory || {};
    const label = memory.statusKind || memory.statusId || effect.label || effect.id || `Effect ${index + 1}`;
    const stacks = Number(memory.stacks || effect.stacks || 0);
    const remaining = Number(effect.duration?.remaining || 0);
    const negative = Boolean(effect.negative);
    return { id: `${effect.id || label}-${index}`, label, stacks, remaining, negative };
  });
}

function lastResolvedLog(combat = {}) {
  const logs = Array.isArray(combat.log) ? combat.log : [];
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    const entry = logs[i];
    if (entry?.presentationId) return entry;
    if (Array.isArray(entry?.results) && entry.results.length) return entry;
    if (['status-damage','ki-deferred-damage','redirect','trailstock-echo','guard','charge'].includes(entry?.type)) return entry;
    if (entry?.type === 'action') return entry;
  }
  return logs.at(-1) || null;
}

function combatTravelClass(sourceSide, targetSide) {
  if (!sourceSide || !targetSide) return '';
  if (sourceSide === 'party' && targetSide === 'enemy') return 'party-to-enemy';
  if (sourceSide === 'enemy' && targetSide === 'party') return 'enemy-to-party';
  if (sourceSide === 'party' && targetSide === 'party') return 'party-to-party';
  if (sourceSide === 'enemy' && targetSide === 'enemy') return 'enemy-to-enemy';
  return sourceSide === targetSide ? 'self' : '';
}

export function latestCombatPresentation(combat = {}, { consumedPresentationId = null } = {}) {
  const feedback = new Map();
  const actors = new Map((combat.actors || []).map(actor => [actor.id, actor]));
  const action = lastResolvedLog(combat);
  const fallbackId = action ? `${combat.id || combat.encounterId || 'combat'}:legacy:${Math.max(0,(combat.log||[]).indexOf(action))}:${action.type || 'event'}` : null;
  const presentationId = action?.presentationId || fallbackId;
  if (presentationId && consumedPresentationId === presentationId) {
    return { presentationId, consumed:true, actingActorId:null, actingType:'', feedback, primaryTargetId:null, primaryResultType:'', actionTravelClass:'', supportAction:false, semanticAction:null };
  }
  const actingActorId = action?.actorId || action?.sourceActorId || null;
  const actingType = action?.action || action?.type || '';
  let primaryTargetId = null;
  let primaryResultType = '';
  const add = (actorId, item) => {
    if (!actorId) return;
    if (!feedback.has(actorId)) feedback.set(actorId, []);
    feedback.get(actorId).push(item);
  };
  const capturePrimaryTarget = (result, fallbackType='') => {
    const targetId = result?.targetId || result?.resolvedTargetId || null;
    if (!primaryTargetId && targetId) {
      primaryTargetId = targetId;
      primaryResultType = result?.type || fallbackType || '';
    }
    return targetId;
  };

  const applyResult = result => {
    const targetId = capturePrimaryTarget(result);
    if (!targetId) return;
    if (result.type === 'damage' || result.type === 'bonus-damage' || result.type === 'conduit-arc' || result.type === 'hypha-transmission') {
      if (result.dodged) add(targetId, { kind: 'dodge', text: 'DODGE' });
      else {
        if (result.blocked) add(targetId, { kind: 'block', text: 'BLOCK' });
        if (num(result.shieldAbsorbed) > 0) add(targetId, { kind: 'shield-loss', text: `-${Math.round(num(result.shieldAbsorbed))} Shield` });
        if (num(result.actualHpRemoved) > 0) add(targetId, { kind: result.critical ? 'crit' : 'damage', text: `-${Math.round(num(result.actualHpRemoved))}${result.critical ? ' CRIT' : ''}` });
      }
    } else if (['heal','heal-from-damage','conditional-heal','answer-heal','lumen-heal','adaptation-heal','profane-exchange-heal','lifesteal','hypha-heal-transmission'].includes(result.type)) {
      const amount = num(result.actualRestored || result.amount);
      if (amount > 0) add(targetId, { kind: result.critical ? 'crit-heal' : 'heal', text: `+${Math.round(amount)} HP${result.critical ? ' CRIT' : ''}` });
    } else if (['shield','overheal-shield','hypha-shield-transmission'].includes(result.type)) {
      const amount = num(result.amount);
      if (amount > 0) add(targetId, { kind: 'shield', text: `+${Math.round(amount)} Shield` });
    }
  };

  for (const result of action?.results || []) applyResult(result);
  if (action?.type === 'action' && action?.payload?.result) applyResult({ type:'damage', targetId:action.payload.targetId, ...action.payload.result });
  if (action?.type === 'action' && Array.isArray(action?.payload?.outcomes)) for (const result of action.payload.outcomes) applyResult(result);
  if (action?.type === 'status-damage') {
    capturePrimaryTarget({ targetId: action.actorId, type: 'damage' });
    if (num(action.shieldAbsorbed) > 0) add(action.actorId, { kind: 'shield-loss', text: `-${Math.round(num(action.shieldAbsorbed))} Shield` });
    if (num(action.amount) > 0) add(action.actorId, { kind: action.critical ? 'crit' : 'damage', text: `-${Math.round(num(action.amount))}${action.critical ? ' CRIT' : ''}` });
  }
  if (action?.type === 'ki-deferred-damage') {
    capturePrimaryTarget({ targetId: action.actorId, type: 'damage' });
    add(action.actorId, { kind: 'damage', text: `-${Math.round(num(action.amount))}` });
  }
  const resolvedActionType = action?.type === 'action' ? action.action : actingType;
  if (resolvedActionType === 'guard') {
    primaryTargetId = primaryTargetId || actingActorId;
    primaryResultType = primaryResultType || 'guard';
    add(actingActorId, { kind: 'guard', text: 'GUARD' });
  }
  if (resolvedActionType === 'charge') {
    primaryTargetId = primaryTargetId || actingActorId;
    primaryResultType = primaryResultType || 'charge';
    add(actingActorId, { kind: 'energy', text: '+1 ENERGY' });
  }

  const actingSide = actors.get(actingActorId)?.side || null;
  const targetSide = actors.get(primaryTargetId)?.side || null;
  const actionTravelClass = combatTravelClass(actingSide, targetSide);
  const supportTypes = new Set(['heal','heal-from-damage','conditional-heal','answer-heal','lumen-heal','adaptation-heal','profane-exchange-heal','lifesteal','hypha-heal-transmission','shield','overheal-shield','hypha-shield-transmission','guard','charge']);
  const healingTypes = new Set(['heal','heal-from-damage','conditional-heal','answer-heal','lumen-heal','adaptation-heal','profane-exchange-heal','lifesteal','hypha-heal-transmission']);
  const protectionTypes = new Set(['shield','overheal-shield','hypha-shield-transmission','guard']);
  const damageTypes = new Set(['damage','bonus-damage','conduit-arc','hypha-transmission','basic-attack']);
  const semanticAction = healingTypes.has(primaryResultType) ? 'healing' : protectionTypes.has(primaryResultType) ? 'protection' : damageTypes.has(primaryResultType) || ['damage','crit','block','dodge'].some(k => [...feedback.values()].flat().some(x=>x.kind===k)) ? 'damage' : null;

  return {
    presentationId,
    consumed:false,
    actingActorId,
    actingType,
    feedback,
    primaryTargetId,
    primaryResultType,
    actionTravelClass,
    supportAction: supportTypes.has(primaryResultType),
    semanticAction
  };
}

export function initiativeView(combat = {}) {
  const actors = new Map((combat.actors || []).map(actor => [actor.id, actor]));
  const queue = Array.isArray(combat.queue) ? combat.queue : [];
  const currentIndex = Math.max(0, Number(combat.queueIndex || 0));
  return queue.map((id, index) => {
    const actor = actors.get(id);
    return {
      id,
      name: actor?.name || id,
      side: actor?.side || 'party',
      current: id === combat.currentActorId,
      defeated: num(actor?.resources?.hp) <= 0,
      passed: index < currentIndex,
      summon: actor?.real === false
    };
  });
}

export function summarizeCombatLog(combat = {}, abilityNames = new Map()) {
  const actors = new Map((combat.actors || []).map(actor => [actor.id, actor.name]));
  const name = id => actors.get(id) || id || 'Unknown';
  const logs = (combat.log || []).slice(-24).reverse();
  const lines = [];
  for (const entry of logs) {
    if (!entry) continue;
    if (entry.type === 'turn-start') lines.push(`${name(entry.actorId)} begins their turn and gains ${entry.naturalEnergy || 0}${entry.bonusEnergy ? ` + ${entry.bonusEnergy}` : ''} Energy.`);
    else if (entry.type === 'turn-end') lines.push(`${name(entry.actorId)} ends their turn.`);
    else if (entry.type === 'action' && entry.action === 'charge') lines.push(`${name(entry.actorId)} Charges for +1 Energy.`);
    else if (entry.type === 'action' && entry.action === 'guard') lines.push(`${name(entry.actorId)} Guards until their next turn.`);
    else if (['ability','subclass-ability','equipment-ability'].includes(entry.type)) {
      const label = abilityNames.get(entry.abilityId) || entry.abilityName || entry.abilityId || 'an ability';
      const bits = [];
      for (const result of entry.results || []) {
        if (result.type === 'damage') {
          if (result.dodged) bits.push(`${name(result.targetId)} Dodged`);
          else bits.push(`${name(result.targetId)} ${result.blocked ? 'Blocked; ' : ''}${result.critical ? 'Crit; ' : ''}${Math.round(num(result.actualHpRemoved))} HP removed${num(result.shieldAbsorbed) ? `, ${Math.round(num(result.shieldAbsorbed))} Shield absorbed` : ''}`);
        } else if (result.type === 'heal') bits.push(`${name(result.targetId)} healed ${Math.round(num(result.actualRestored))}${result.critical ? ' (Crit)' : ''}`);
        else if (result.type === 'shield') bits.push(`${name(result.targetId)} gained ${Math.round(num(result.amount))} Shield`);
      }
      lines.push(`${name(entry.actorId)} uses ${label}${bits.length ? ` — ${bits.join(' · ')}` : ''}.`);
    } else if (entry.type === 'status-damage') lines.push(`${name(entry.actorId)} takes ${Math.round(num(entry.amount))} ${entry.damageType || ''} damage from ${entry.status || 'a status'}${entry.critical ? ' (Crit)' : ''}${num(entry.shieldAbsorbed) ? `; ${Math.round(num(entry.shieldAbsorbed))} Shield absorbed` : ''}.`);
    else if (entry.type === 'redirect') lines.push(`${name(entry.targetActorId)} intercepts the attack${entry.reductionPct ? ` with ${entry.reductionPct}% redirected-hit reduction` : ''}.`);
    else if (entry.type === 'turn-start-defeat-by-status') lines.push(`${name(entry.actorId)} is defeated by a start-of-turn status before acting.`);
  }
  return lines;
}
