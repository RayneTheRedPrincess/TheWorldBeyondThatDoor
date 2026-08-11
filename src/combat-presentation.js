const num = value => Number(value || 0);
const pct = (value, max) => max > 0 ? Math.max(0, Math.min(100, (num(value) / num(max)) * 100)) : 0;

export function combatPresentationDelayMsForSpeed(value=1){const parsed=Number(value);const speed=Math.max(.1,Math.min(4,Number.isFinite(parsed)?parsed:1));return Math.round(900/speed);}
export function combatCompletionDelayMsForSpeed(value=1){const parsed=Number(value);const speed=Math.max(.1,Math.min(4,Number.isFinite(parsed)?parsed:1));return Math.max(120,Math.round(650/speed));}

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


export function towerBattleScene(run = {}) {
  const depth = Number(run?.expedition?.depth || 1);
  const encounter = run?.expedition?.encounter || {};
  if (encounter.boss || depth >= 30) return 'tower-ascension-chamber';
  if (encounter.miniboss || depth === 15) return 'tower-aureofrost-vault';
  if (depth >= 25) return 'tower-cognition-sanctum';
  if (depth >= 19) return 'tower-synthesis-height';
  if (depth >= 13) return 'tower-crucible';
  if (depth >= 7) return 'tower-preservation-gallery';
  return 'tower-divine-foundry';
}

export function plainsBattleScene(run = {}) {
  const depth = Number(run?.expedition?.depth || 1);
  const encounter = run?.expedition?.encounter || {};
  if (encounter.boss || depth >= 30) return 'plains-tenairah-bloodcourt';
  if (encounter.miniboss && depth === 20) return 'plains-veiled-estate';
  if (encounter.miniboss && depth === 10) return 'plains-red-cavalry-field';
  if (depth >= 26) return 'plains-sovereign-heartland';
  if (depth >= 21) return 'plains-veiled-estates';
  if (depth >= 15) return 'plains-noble-hunting-ground';
  if (depth >= 11) return 'plains-red-warfield';
  if (depth >= 6) return 'plains-broken-homestead';
  return 'plains-ashen-border';
}

export function hellBattleScene(run = {}) {
  const depth = Number(run?.expedition?.depth || 1);
  const encounter = run?.expedition?.encounter || {};
  if (encounter.boss || depth >= 30) return 'hell-sevenfold-court';
  if (encounter.miniboss || depth === 10) return 'hell-gatebound-threshold';
  if (depth >= 26) return 'hell-sevenfold-approach';
  if (depth >= 21) return 'hell-sinbound-marches';
  if (depth >= 16) return 'hell-infernal-dominions';
  if (depth >= 11) return 'hell-outer-plane';
  if (depth >= 6) return 'hell-gateward-caverns';
  return 'hell-blackstone-descent';
}

export function dragonBattleScene(run = {}) {
  const depth=Number(run?.expedition?.depth||1),encounter=run?.expedition?.encounter||{};
  if(encounter.boss||depth>=30)return 'dragon-prismatic-throne';
  if(encounter.miniboss&&depth===20)return 'dragon-leviathan-vault';
  if(encounter.miniboss&&depth===10)return 'dragon-hoard-sentinel-hall';
  if(depth>=26)return 'dragon-prismatic-crownways';
  if(depth>=21)return 'dragon-elder-hoard-sanctum';
  if(depth>=16)return 'dragon-wyvern-menagerie';
  if(depth>=11)return 'dragon-wingvault-gallery';
  if(depth>=6)return 'dragon-drake-warrens';
  return 'dragon-outer-hoardways';
}

export function necropolisBattleScene(run = {}) {
  const depth=Number(run?.expedition?.depth||1),encounter=run?.expedition?.encounter||{};
  if(encounter.boss||depth>=30)return 'necro-ossuary-throne';
  if(encounter.miniboss&&depth===20)return 'necro-grave-colossus-vault';
  if(encounter.miniboss&&depth===10)return 'necro-execution-yard';
  if(depth>=26)return 'necro-crown-ossuary';
  if(depth>=21)return 'necro-royal-catacombs';
  if(depth>=16)return 'necro-black-liturgies';
  if(depth>=11)return 'necro-tithe-streets';
  if(depth>=6)return 'necro-broken-tombways';
  return 'necro-outer-procession';
}

export function shadowInfusedDarkWoodsBattleScene(run = {}) {
  const depth=Number(run?.expedition?.depth||1),encounter=run?.expedition?.encounter||{};
  if(encounter.boss||depth>=3)return 'shadow-woods-broken-mirror';
  return 'shadow-woods-cult-altar';
}

export function regionalBattleScene(run = {}) {
  if(run?.expedition?.regionId === 'shadow-infused-dark-woods') return shadowInfusedDarkWoodsBattleScene(run);
  if(run?.expedition?.regionId === 'necropolis') return necropolisBattleScene(run);
  if(run?.expedition?.regionId === 'that-dragons-dungeon') return dragonBattleScene(run);
  if(run?.expedition?.regionId === 'caverns-to-hell') return hellBattleScene(run);
  if(run?.expedition?.regionId === 'ruined-vampiric-plains') return plainsBattleScene(run);
  if(run?.expedition?.regionId === 'heavenly-tower') return towerBattleScene(run);
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

export function summarizeCombatLog(combat = {}, abilityNames = new Map(), itemNames = new Map()) {
  const actorRecords = new Map((combat.actors || []).map(actor => [actor.id, actor]));
  const name = id => actorRecords.get(id)?.name || id || 'Unknown';
  const abilityLabel = entry => abilityNames.get(entry?.abilityId) || entry?.abilityName || entry?.abilityId || 'an ability';
  const roundPrefix = entry => Number(entry?.round || 0) > 0 ? `R${Number(entry.round)} · ` : '';
  const damageTypeText = result => String(result?.damageType || '').trim();
  const amount = value => Math.max(0, Math.round(num(value)));
  const logs = (combat.log || []).slice(-120).reverse();
  const lines = [];
  const push = (entry, text) => { if (text) lines.push(`${roundPrefix(entry)}${text}`); };

  const resultClauses = (entry, actorName, label) => {
    const clauses = [];
    for (const result of entry?.results || []) {
      if (!result) continue;
      const targetId = result.resolvedTargetId || result.targetId || entry.targetId || entry.actorId;
      const targetName = name(targetId);
      const type = String(result.type || '');
      const isDamage = ['damage','bonus-damage','conduit-arc','hypha-transmission','glyph-echo'].includes(type);
      const isHeal = ['heal','heal-from-damage','conditional-heal','answer-heal','lumen-heal','adaptation-heal','profane-exchange-heal','lifesteal','hypha-heal-transmission'].includes(type);
      const isShield = ['shield','overheal-shield','hypha-shield-transmission'].includes(type);
      if (isDamage) {
        const dtype = damageTypeText(result);
        if (result.dodged) {
          clauses.push(`${actorName} → ${targetName}: ${label} was dodged`);
          continue;
        }
        const hp = amount(result.actualHpRemoved ?? result.finalDamage);
        const shield = amount(result.shieldAbsorbed);
        const flags = [result.critical ? 'Critical' : '', result.blocked ? 'Blocked' : ''].filter(Boolean).join(', ');
        const damageLabel = `${hp}${dtype ? ` ${dtype}` : ''} HP damage`;
        const shieldLabel = shield > 0 ? ` + ${shield} Shield damage` : '';
        const noLoss = hp === 0 && shield === 0 ? 'no damage penetrated defenses' : `${damageLabel}${shieldLabel}`;
        clauses.push(`${actorName} → ${targetName}: ${label} dealt ${noLoss}${flags ? ` (${flags})` : ''}`);
      } else if (isHeal) {
        const healed = amount(result.actualRestored ?? result.amount);
        const flags = result.critical ? ' (Critical Heal)' : '';
        clauses.push(`${actorName} → ${targetName}: ${label} restored ${healed} HP${flags}`);
      } else if (isShield) {
        clauses.push(`${actorName} → ${targetName}: ${label} granted ${amount(result.amount)} Shield`);
      } else if (type === 'energy') {
        clauses.push(`${actorName}: ${label} restored ${amount(result.amount)} Energy`);
      } else if (type === 'cleanse') {
        const count = Array.isArray(result.removed) ? result.removed.length : 0;
        clauses.push(`${actorName}: ${label} cleansed ${count} negative effect${count === 1 ? '' : 's'}`);
      } else if (type === 'status') {
        clauses.push(`${actorName}: ${label} applied ${result.statusId || 'a status effect'}`);
      } else if (type === 'form') {
        clauses.push(`${actorName}: ${label} changed form to ${result.form || 'a new form'}`);
      } else if (type === 'woundshare' && result.targetId) {
        clauses.push(`${actorName} → ${targetName}: ${label} applied Woundshare`);
      }
    }
    return clauses;
  };

  for (const entry of logs) {
    if (!entry) continue;
    const actorName = name(entry.actorId || entry.sourceActorId);
    if (entry.type === 'turn-start') {
      const gain = amount(entry.naturalEnergy) + amount(entry.bonusEnergy);
      push(entry, `${actorName} begins their turn${gain ? ` and gains ${gain} Energy${entry.bonusEnergy ? ` (${amount(entry.naturalEnergy)} natural + ${amount(entry.bonusEnergy)} bonus)` : ''}` : ''}.`);
    } else if (entry.type === 'turn-end') {
      push(entry, `${actorName} ends their turn.`);
    } else if (entry.type === 'action-skipped') {
      push(entry, `${actorName}'s action is skipped.`);
    } else if (entry.type === 'action' && entry.action === 'charge') {
      push(entry, `${actorName} Charges and gains +1 Energy.`);
    } else if (entry.type === 'action' && entry.action === 'guard') {
      push(entry, `${actorName} Guards, guaranteeing a Block until their next turn.`);
    } else if (['ability','subclass-ability','equipment-ability','racial-ability'].includes(entry.type)) {
      const label = abilityLabel(entry);
      const costBits = [];
      if (num(entry.energySpent) > 0) costBits.push(`${amount(entry.energySpent)} Energy`);
      if (num(entry.hpPaid) > 0) costBits.push(`${amount(entry.hpPaid)} HP`);
      const source = entry.sourceItemName ? ` from ${entry.sourceItemName}` : '';
      const clauses = resultClauses(entry, actorName, label);
      if (clauses.length) {
        clauses.forEach((clause, index) => push(entry, `${clause}${index === 0 ? source : ''}${index === 0 && costBits.length ? ` · Cost: ${costBits.join(' + ')}` : ''}.`));
      } else {
        push(entry, `${actorName} uses ${label}${source}${costBits.length ? ` · Cost: ${costBits.join(' + ')}` : ''}.`);
      }
    } else if (entry.type === 'consumable') {
      const label = itemNames.get(entry.itemId) || entry.itemName || entry.itemId || 'a consumable';
      const clauses = resultClauses(entry, actorName, label);
      if (clauses.length) for (const clause of clauses) push(entry, `${clause}.`);
      else push(entry, `${actorName} uses ${label}.`);
    } else if (entry.type === 'trailstock-echo') {
      const label = 'Trailstock Echo';
      const clauses = resultClauses(entry, actorName, label);
      if (clauses.length) for (const clause of clauses) push(entry, `${clause}.`);
      else push(entry, `${actorName}'s ${label} resolves.`);
    } else if (entry.type === 'status-damage') {
      const source = entry.sourceActorId ? name(entry.sourceActorId) : (entry.status || 'A status effect');
      const target = name(entry.actorId);
      const hp = amount(entry.amount);
      const shield = amount(entry.shieldAbsorbed);
      const dtype = String(entry.damageType || '').trim();
      const status = entry.status || 'status effect';
      const ownerText = entry.sourceActorId ? `${source}'s ${status}` : status;
      push(entry, `${ownerText} → ${target}: dealt ${hp}${dtype ? ` ${dtype}` : ''} HP damage${shield ? ` + ${shield} Shield damage` : ''}${entry.critical ? ' (Critical)' : ''}.`);
    } else if (entry.type === 'ki-deferred-damage') {
      push(entry, `${actorName} takes ${amount(entry.amount)} deferred HP damage from ${entry.kiId || 'a Kept Impression'}.`);
    } else if (entry.type === 'kept-indirect-fallback') {
      push(entry, `${name(entry.sourceActorId)} → ${name(entry.targetActorId)}: an indirect Kept Impression effect dealt ${amount(entry.amount)}${entry.damageType ? ` ${entry.damageType}` : ''} HP damage.`);
    } else if (entry.type === 'redirect') {
      push(entry, `${name(entry.targetActorId)} intercepts an attack from ${name(entry.sourceActorId)}${entry.reductionPct ? ` and reduces the redirected hit by ${amount(entry.reductionPct)}%` : ''}.`);
    } else if (entry.type === 'summon') {
      push(entry, `${entry.actorId ? `${name(entry.actorId)} summons` : 'Summoned'} ${entry.name || name(entry.summonId)}.`);
    } else if (entry.type === 'turn-start-defeat-by-status') {
      push(entry, `${actorName} is defeated by a start-of-turn status before acting.`);
    } else if (entry.type === 'kept-combat-start-choice') {
      push(entry, `${actorName} chooses ${entry.choice || 'a combat-start option'} for ${entry.kiId || 'a Kept Impression'}.`);
    } else if (entry.type === 'kept-active') {
      const target = entry.targetId ? ` targeting ${name(entry.targetId)}` : '';
      push(entry, `${actorName} activates ${entry.abilityId || entry.kiId || 'a Kept Impression ability'}${target}.`);
    } else if (entry.type === 'subclass-turn-start-events') {
      const count = Array.isArray(entry.events) ? entry.events.length : 0;
      if (count) push(entry, `${actorName} resolves ${count} subclass turn-start event${count === 1 ? '' : 's'}.`);
    }
  }
  return lines.slice(0, 180);
}
