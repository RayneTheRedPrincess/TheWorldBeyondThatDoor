import { listUsableBaseAbilities } from '../ability-controller.js';
import { listUsableSubclassAbilities } from '../subclass-controller.js';
import { escapeHtml, shell } from './shared.js';
import { combinedCharacterStats, expToNextLevel } from '../character-progression.js';
import { baseDerivedStats } from '../combat-math.js';
import { aggregateEquipmentEffects, applyEquipmentCoreStats, equipmentInventoryEntries, equipmentOwnerState } from '../equipment-controller.js';
import { applyKeptPreCombatStats } from '../kept-impression-state.js';
import { resourceDefinition } from '../base-class-state.js';
import { playerStatLabel, formatStatBonus, formatListedStats, itemTypeTag, equipmentSlotLabel, weaponCompatibilityText, formatDerivedStats, readableAbilityText } from '../player-facing.js';
import { keptActiveAbilities } from '../kept-impression-runtime.js';
import { getRunConsumableCapacity } from '../consumable-controller.js';
import { listCraftingRecipes } from '../crafting-controller.js';
import { getForestCheckParticipants } from '../forest-event-controller.js';
import { forestBattleScene, hpPercent, shieldPercent, energyPercent, actorStatusTokens, latestCombatPresentation, initiativeView, summarizeCombatLog } from '../combat-presentation.js';

function statLine(stats = {}) {
  return Object.entries(stats).map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong> ${Number(value || 0)}</span>`).join('');
}

function routeArtFor(card){if(card?.trainer)return 'trainer';if(card?.combat)return 'combat';return ['landmark','helpful-person','discovery'].includes(card?.kind)?card.kind:'event';}
function eventCards(expedition) {
  const cards=Array.isArray(expedition.cards)?expedition.cards:[];
  return `<div class="expedition-card-grid">${cards.map(card=>`<article class="expedition-card"><div class="route-art"><img src="./assets/route-art/${routeArtFor(card)}.svg" alt="${escapeHtml(card.label)} route scene" loading="lazy"/></div><div class="event-card-number">Path ${card.ordinal}</div><h4>${escapeHtml(card.label)}</h4><p>${escapeHtml(card.description)}</p><button data-action="expedition-select-card" data-card="${escapeHtml(card.id)}">Choose This Path</button></article>`).join('')}</div>`;
}

function selectedCard(expedition) {
  return (expedition.cards || []).find(card => card.id === expedition.selectedCardId) || null;
}

function subclassResourceDisplay(actor) {
  const s = actor?.subclassState;
  if (!s) return '';
  const pairs = [
    ['Overpressure',s.overpressure,3],['Bearing',s.bearing,3],['Heat',s.heat,5],['Redline',s.redline,4],['Tempo',s.tempo,3],
    ['Flare',s.flare,3],['Solace',s.solace,3],['Fervor',s.fervor,4],['Breach Charge',s.breachCharge,4],['Aim',s.aim,4],
    ['Trail Charge',s.trailCharge,3],['Harmony',s.harmony,3],['Discord',s.discord,4],['Cadence',s.cadence,4],['Font',s.font,3],
    ['Cinders',s.cinders,5],['Whispers',s.whispers,4],['Remains',s.remains,4],['Dawn',s.dawn,3],['Verdict',s.verdict,4],
    ['Growth',s.growth,4]
  ];
  const found = pairs.find(([,value]) => value !== undefined);
  if (found) return `<div class="battle-resource"><span>${escapeHtml(found[0])}</span><strong>${Math.round(Number(found[1]||0))} / ${found[2]}</strong></div>`;
  if (s.facet) return `<div class="battle-resource"><span>Facet</span><strong>${escapeHtml(s.facet)}</strong></div>`;
  if (s.flux) return `<div class="battle-resource"><span>Flux</span><strong>${escapeHtml(s.flux)}</strong></div>`;
  if (Array.isArray(s.glyphs)) return `<div class="battle-resource"><span>Glyphs</span><strong>${s.glyphs.length} / 3</strong></div>`;
  if (Array.isArray(s.morphs)) return `<div class="battle-resource"><span>Morphs</span><strong>${s.morphs.length} / 3</strong></div>`;
  if (Array.isArray(s.nodes)) return `<div class="battle-resource"><span>Hypha Nodes</span><strong>${s.nodes.length} / 4</strong></div>`;
  if (s.oath !== undefined) return `<div class="battle-resource"><span>Oath / Fractures</span><strong>${Math.round(Number(s.oath||0))} / ${Math.round(Number(s.fractures||0))}</strong></div>`;
  return '';
}

function scalingText(scaling={}){const parts=Object.entries(scaling||{}).map(([k,v])=>`${playerStatLabel(k)} × ${Number(v)}`);return parts.length?parts.join(' + '):'No core-stat scaling';}
function componentText(component={}){if(component.type==='damage')return `${component.damageType||'Damage'} · Base ${Number(component.base||0)} · ${scalingText(component.scaling)}`;if(component.type==='heal')return `Healing · Base ${Number(component.base||0)} · ${scalingText(component.scaling)}`;if(component.type==='shield')return `Shield · Base ${Number(component.base||0)} · ${scalingText(component.scaling)}`;return playerStatLabel(component.type||'Effect');}
function enemyInspection(actor){
 if(actor.side!=='enemy')return '';
 const core=actor.stats&&Object.keys(actor.stats).length?Object.entries(actor.stats).map(([k,v])=>`${playerStatLabel(k)} ${Math.round(Number(v||0))}`).join(' · '):'Stats are not exposed for this combatant.';
 const basic=actor.basicAttack?`<div class="inspection-entry"><strong>${escapeHtml(actor.basicAttack.name||'Basic Attack')}</strong><span>${escapeHtml(componentText({type:'damage',base:actor.basicAttack.base,damageType:actor.basicAttack.damageType,scaling:actor.basicAttack.scaling}))}</span><small>Target: one enemy.</small></div>`:'';
 const abilities=(actor.enemyAbilities||[]).map(a=>`<div class="inspection-entry"><strong>${escapeHtml(a.name)}</strong><span>${escapeHtml((a.components||[]).map(componentText).join(' · ')||'Special effect')}</span><small>${Number(a.energyCost||0)} Energy · Cooldown ${Number(a.cooldown||0)} · Target: ${escapeHtml(String(a.targetMode||'special').replaceAll('-',' '))}</small></div>`).join('');
 return `<details class="actor-inspection"><summary>Inspect enemy</summary><div class="inspection-body"><p><strong>Role:</strong> ${escapeHtml(actor.combatRole||'Enemy')}</p><p><strong>Visible stats:</strong> ${escapeHtml(core)}</p>${basic}${abilities||'<p class="muted">No additional named abilities are currently visible.</p>'}</div></details>`;
}
function actorStageProfile(side, index, count, { featured = false } = {}) {
  if (featured) return { band: "boss", shiftX: 0, rise: 1.2, scale: 1.16, order: 24 };
  const safeCount = Math.max(1, Number(count || 1));
  const depth = safeCount === 1 ? 1 : index / (safeCount - 1);
  const band = depth < 0.34 ? "back" : depth < 0.67 ? "mid" : "front";
  const inward = (1 - depth) * 2.35 - 0.1;
  const shiftX = side === "party" ? inward : -inward;
  const rise = 3.2 - (depth * 2.25);
  const scale = 0.84 + (depth * 0.16);
  const order = 10 + Math.round(depth * 10);
  return { band, shiftX, rise, scale, order };
}

function actorStageStyle(side, index, count, { featured = false } = {}) {
  const profile = actorStageProfile(side, index, count, { featured });
  return {
    band: profile.band,
    style: `--slot-shift-x:${profile.shiftX.toFixed(2)}rem; --slot-rise:${profile.rise.toFixed(2)}rem; --slot-scale:${profile.scale.toFixed(2)}; --slot-order:${profile.order};`
  };
}

function battleActionLane(presentation = {}) {
  if (!presentation?.actionTravelClass) return "";
  const tone = presentation.supportAction ? "support-lane" : "impact-lane";
  return `<div class="battle-action-lane ${tone} ${escapeHtml(presentation.actionTravelClass)}" aria-hidden="true"><span class="battle-action-travel"></span><span class="battle-action-burst"></span></div>`;
}

function renderBattleSide(label, actors, side, currentActorId, { presentation, targetableIds, showNumbers, featureEnemyId = null } = {}) {
  return `<div class="battle-side ${side}-side"><div class="battle-side-label">${escapeHtml(label)}</div>${actors.map((actor, index) => {
    const featured = actor.id === featureEnemyId;
    const stage = actorStageStyle(side, index, actors.length, { featured });
    return `<div class="battle-actor-slot ${featured ? "featured-slot" : ""}" data-depth-band="${escapeHtml(stage.band)}" style="${stage.style}"><div class="slot-contact-ring" aria-hidden="true"></div>${actorCard(actor, currentActorId, { presentation, featured, targetable: targetableIds.has(actor.id), showNumbers })}</div>`;
  }).join("")}</div>`;
}
function actorCard(actor, currentActorId, { presentation, featured = false, targetable = false, showNumbers = true } = {}) {
  const current = actor.id === currentActorId;
  const defeated = Number(actor.resources?.hp || 0) <= 0;
  const sideLabel = actor.real ? (actor.kind === 'vessel' ? 'Otherworlder' : actor.kind === 'enemy' ? 'Enemy' : 'Tavern Adventurer') : 'Summon';
  const feedback = presentation?.feedback?.get(actor.id) || [];
  const acting = presentation?.actingActorId === actor.id;
  const feedbackKinds = new Set(feedback.map(item => item.kind));
  const classes = ['battle-actor', current ? 'current' : '', defeated ? 'defeated' : '', acting ? 'acting' : '', actor.real === false ? 'summon' : '', featured ? 'featured-enemy' : '', feedbackKinds.has('dodge') ? 'dodging' : '', feedbackKinds.has('block') || feedbackKinds.has('guard') ? 'blocking' : '', [...feedbackKinds].some(kind => ['damage','crit','shield-loss'].includes(kind)) ? 'taking-hit' : '', [...feedbackKinds].some(kind => ['heal','crit-heal','shield'].includes(kind)) ? 'receiving-support' : '', targetable && !defeated ? 'targetable' : ''].filter(Boolean).join(' ');
  const hp = Math.round(Number(actor.resources?.hp || 0));
  const maxHp = Math.round(Number(actor.resources?.maxHp || 0));
  const shield = Math.round(Number(actor.resources?.shield || 0));
  const energy = Math.round(Number(actor.resources?.energy || 0));
  const maxEnergy = Math.round(Number(actor.resources?.maxEnergy || 7));
  const initials = String(actor.name || '?').split(/\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase();
  const statuses = actorStatusTokens(actor);
  const resource = actor.classState?.resource ? `<div class="actor-special-resource"><span>${escapeHtml(actor.classState.resource.name)}</span><strong>${Math.round(actor.classState.resource.value || 0)} / ${Math.round(actor.classState.resource.max || 0)}</strong></div>` : '';
  const form = actor.baseClass === 'Druid' && actor.classState?.form ? `<div class="actor-special-resource"><span>Form</span><strong>${escapeHtml(actor.classState.form)}</strong></div>` : '';
  return `<article class="${classes}" data-side="${escapeHtml(actor.side)}" data-combat-actor-id="${escapeHtml(actor.id)}" ${targetable && !defeated ? 'data-action="combat-select-actor" tabindex="0" role="button" aria-label="Select ${escapeHtml(actor.name)} as target"' : ''}>
    <div class="actor-ground-shadow" aria-hidden="true"></div>
    <div class="actor-portrait-shell" aria-hidden="true"><div class="actor-portrait"><span>${escapeHtml(initials)}</span></div>${featured ? '<div class="boss-crown">✦</div>' : ''}</div>
    <div class="actor-readout">
      <div class="actor-name-row"><div><div class="battle-slot">${escapeHtml(actor.battlefieldSlot?.key || '')}</div><h4>${escapeHtml(actor.name)}</h4><small>${escapeHtml(sideLabel)}${actor.combatRole ? ` · ${escapeHtml(actor.combatRole)}` : ''}</small></div>${current ? '<span class="turn-chip">NOW</span>' : ''}</div>
      <div class="meter hp-meter"><div class="meter-fill" style="width:${hpPercent(actor).toFixed(2)}%"></div><div class="meter-label"><span>HP</span><strong>${showNumbers ? `${hp} / ${maxHp}` : `${Math.round(hpPercent(actor))}%`}</strong></div></div>
      ${shield > 0 ? `<div class="meter shield-meter"><div class="meter-fill" style="width:${Math.min(100, shieldPercent(actor)).toFixed(2)}%"></div><div class="meter-label"><span>Shield</span><strong>${showNumbers ? shield : 'Active'}</strong></div></div>` : ''}
      <div class="energy-pips" aria-label="Energy ${energy} of ${maxEnergy}">${Array.from({length:maxEnergy},(_,i)=>`<span class="${i<energy?'filled':''}"></span>`).join('')}</div>
      <div class="actor-resource-grid">${resource}${form}${subclassResourceDisplay(actor)}</div>
      ${actor.defense?.guardActive ? '<div class="guard-mark">GUARD · guaranteed Block until next turn</div>' : ''}
      ${statuses.length ? `<div class="status-strip">${statuses.slice(0,8).map(status=>`<span class="status-token ${status.negative?'negative':'positive'}" title="${escapeHtml(status.label)}${status.stacks?` · ${status.stacks} stack${status.stacks===1?'':'s'}`:''}${status.remaining?` · ${status.remaining} turn${status.remaining===1?'':'s'}`:''}"><b>${escapeHtml(String(status.label).slice(0,2).toUpperCase())}</b>${status.stacks?`<i>${status.stacks}</i>`:''}${status.remaining?`<em>${status.remaining}</em>`:''}</span>`).join('')}</div>` : ''}
    </div>
    ${feedback.length ? `<div class="floating-feedback" aria-live="polite">${feedback.map(item=>`<span class="feedback-${escapeHtml(item.kind)}">${escapeHtml(item.text)}</span>`).join('')}</div>` : ''}
    ${enemyInspection(actor)}
  </article>`;
}

function abilityTargetControl(ability, combat, current) {
  const living = (combat.actors || []).filter(actor => Number(actor.resources?.hp || 0) > 0);
  const allies = living.filter(actor => actor.side === current.side);
  const otherAllies = allies.filter(actor => actor.id !== current.id);
  const enemies = living.filter(actor => actor.side !== current.side);
  const options = actors => actors.map(actor => `<option value="${escapeHtml(actor.id)}">${escapeHtml(actor.name)}</option>`).join('');
  if (ability.targetMode === 'single-enemy') return `<select data-ability-target="${escapeHtml(ability.id)}" data-primary-combat-target aria-label="Target for ${escapeHtml(ability.name)}">${options(enemies)}</select>`;
  if (ability.targetMode === 'single-ally') return `<select data-ability-target="${escapeHtml(ability.id)}" data-primary-combat-target aria-label="Ally for ${escapeHtml(ability.name)}">${options(otherAllies)}</select>`;
  if (ability.targetMode === 'ally-or-self') return `<select data-ability-target="${escapeHtml(ability.id)}" data-primary-combat-target aria-label="Ally or self for ${escapeHtml(ability.name)}">${options(allies)}</select>`;
  if (ability.targetMode === 'two-allies') return `<div class="dual-target"><label>Shield <select data-ability-target-shield="${escapeHtml(ability.id)}">${options(allies)}</select></label><label>Heal <select data-ability-target-heal="${escapeHtml(ability.id)}">${options(allies)}</select></label></div>`;
  if (ability.targetMode === 'choose-form') {
    const forms = ['Fang','Grove','Bloom'].filter(form => form !== current.classState?.form);
    return `<select data-ability-form="${escapeHtml(ability.id)}" aria-label="New Form">${forms.map(form => `<option value="${form}">${form} Form</option>`).join('')}</select>`;
  }
  return '';
}

function subclassChoiceControls(ability, combat, current) {
  const allies = (combat.actors || []).filter(a => a.side === current.side && Number(a.resources?.hp||0)>0);
  const allyOptions = allies.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
  const glyphOptions = '<option value="Edge">Edge</option><option value="Echo">Echo</option><option value="Veil">Veil</option>';
  if (ability.name === 'Refract Stance') return '<label>Facet movement <select data-subclass-choice="facetDirection"><option value="1">Forward</option><option value="-1">Backward</option></select></label>';
  if (ability.name === 'Probability Shear') return '<label>Flux movement <select data-subclass-choice="fluxDirection"><option value="1">Forward</option><option value="-1">Backward</option></select></label>';
  if (ability.name === 'Cataclysmic Formula') return '<label>Damage type <select data-subclass-choice="damageType"><option>Fire</option><option>Cold</option><option>Lightning</option></select></label>';
  if (ability.name === 'Quickscript') return `<div class="dual-target"><label>Glyph 1 <select data-subclass-choice="glyph1">${glyphOptions}</select></label><label>Glyph 2 <select data-subclass-choice="glyph2">${glyphOptions}</select></label></div>`;
  if (ability.name === 'Mark Safe Ground') return `<div class="dual-target"><label>Mark 1 <select data-subclass-choice="ally1">${allyOptions}</select></label><label>Mark 2 <select data-subclass-choice="ally2">${allyOptions}</select></label></div>`;
  if (['Shifted Lance','Morphline'].includes(ability.name)) return `<label>Consume Glyphs <select data-subclass-choice="consumeGlyphCount"><option value="0">0</option><option value="1">1</option>${ability.name==='Morphline'?'<option value="2">2</option>':''}</select></label><label>Create Glyph <select data-subclass-choice="createGlyph">${glyphOptions}</select></label>`;
  if (ability.subclass === 'Glyphmorpher') return `<label>Create Glyph <select data-subclass-choice="createGlyph">${glyphOptions}</select></label>`;
  if (ability.name === 'Ossuary Skin') return '<label><input type="checkbox" data-subclass-choice="consumeResource"/> Consume 1 Remain for the optional stronger Shield</label>';
  return '';
}

function abilityInspection(ability){const text=readableAbilityText(ability);return `<details class="ability-inspection"><summary>Inspect mechanics</summary><pre>${escapeHtml(text||'Full mechanics are not available for this ability.')}</pre></details>`;}
function subclassAbilityPanel(combat, current, subclassAbilities) {
  const abilities = listUsableSubclassAbilities(combat, current.id, subclassAbilities);
  if (!abilities.length) return '';
  return `<section class="section"><div class="kicker">Subclass Abilities</div><div class="ability-grid">${abilities.map(ability => {
    const resourceBlocked = ability.resourceRequired > ability.resourceAvailable;
    const energyBlocked = ability.effectiveEnergyCost > Number(current.resources?.energy || 0);
    const weaponBlocked = Array.isArray(ability.requirements?.weaponTypes) && ability.requirements.weaponTypes.length && !ability.requirements.weaponTypes.includes(current.weaponType);
    const disabled = ability.cooldownRemaining > 0 || resourceBlocked || energyBlocked || weaponBlocked;
    const resourceText = ability.resourceCost ? ` + ${ability.resourceRequired === ability.resourceAvailable && ability.resourceCost.amount === 'all' ? 'all' : ability.resourceRequired} ${escapeHtml(ability.resourceCost.resource)}` : '';
    const state = ability.cooldownRemaining ? `Cooldown ${ability.cooldownRemaining}` : energyBlocked ? 'Not enough Energy' : resourceBlocked ? 'Not enough resource' : weaponBlocked ? `${escapeHtml((ability.requirements.weaponTypes||[]).join(' / '))} required` : 'Ready';
    return `<article class="ability-card ${disabled?'disabled':''}" data-subclass-ability-card="${escapeHtml(ability.id)}"><div><strong>${escapeHtml(ability.name)}</strong><small>Level ${ability.level} · ${ability.effectiveEnergyCost} Energy${resourceText} · CD ${ability.cooldown}</small></div><p>${escapeHtml(state)}</p>${abilityTargetControl(ability,combat,current)}${subclassChoiceControls(ability,combat,current)}${abilityInspection(ability)}<button data-action="combat-use-subclass-ability" data-ability="${escapeHtml(ability.id)}" ${disabled?'disabled':''}>Use Subclass Ability</button></article>`;
  }).join('')}</div></section>`;
}

function keptActivePanel(combat,current){
  const abilities=keptActiveAbilities(current);if(!abilities.length)return '';
  const living=(combat.actors||[]).filter(a=>Number(a.resources?.hp||0)>0), enemies=living.filter(a=>a.side!==current.side), allies=living.filter(a=>a.side===current.side&&a.real&&a.id!==current.id);
  const options=list=>list.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
  return `<section class="section"><div class="kicker">Kept Impression Actives</div><div class="ability-grid">${abilities.map(a=>{const cd=Number(current.cooldowns?.[`ki:${a.kiId}`]?.remaining||0),energyBlocked=Number(current.resources?.energy||0)<Number(a.energyCost||0),disabled=cd>0||energyBlocked;const target=a.targetMode==='single-enemy'?`<select data-kept-active-target="${escapeHtml(a.id)}" data-primary-combat-target>${options(enemies)}</select>`:a.targetMode==='single-ally'?`<select data-kept-active-target="${escapeHtml(a.id)}" data-primary-combat-target>${options(allies)}</select>`:'';return `<article class="ability-card ${disabled?'disabled':''}"><div><strong>${escapeHtml(a.name)}</strong><small>${a.energyCost} Energy · CD ${a.cooldown}</small></div><p>${cd?`Cooldown ${cd}`:energyBlocked?'Not enough Energy':'Ready'}</p>${target}<button data-action="combat-use-kept-active" data-ki-ability="${escapeHtml(a.id)}" ${disabled?'disabled':''}>Use Kept Ability</button></article>`;}).join('')}</div></section>`;
}
function keptCombatStartPrompt(current){
 const pending=current?.keptState?.perId?.['KI-184']?.awaitingChoice;if(!pending)return '';
 return `<div class="notice"><strong>Cinderwound Pact</strong><p>Choose whether to ignite Cinderwound for this battle before taking your first action.</p><div class="combat-actions"><button data-action="combat-kept-start-choice" data-ki="KI-184" data-key="ignite" data-value="true">Ignite</button><button class="secondary" data-action="combat-kept-start-choice" data-ki="KI-184" data-key="ignite" data-value="false">Do Not Ignite</button></div></div>`;
}

function abilityPanel(combat, current, baseAbilities) {
  const abilities = listUsableBaseAbilities(combat, current.id, baseAbilities);
  if (!abilities.length) return '<div class="notice">No base-class abilities are currently available to this combatant.</div>';
  return `<div class="ability-grid">${abilities.map(ability => {
    const resourceBlocked = ability.resourceRequired > ability.resourceAvailable;
    const energyBlocked = ability.effectiveEnergyCost > Number(current.resources?.energy || 0);
    const weaponBlocked = ability.requirements?.weaponType && current.weaponType !== ability.requirements.weaponType;
    const disabled = ability.cooldownRemaining > 0 || resourceBlocked || energyBlocked || weaponBlocked;
    const resourceText = ability.resourceRequired ? ` + ${ability.resourceRequired} ${escapeHtml(ability.resourceCost.resource)}` : '';
    const state = ability.cooldownRemaining ? `Cooldown ${ability.cooldownRemaining}` : energyBlocked ? 'Not enough Energy' : resourceBlocked ? 'Not enough resource' : weaponBlocked ? `${escapeHtml(ability.requirements.weaponType)} required` : 'Ready';
    return `<article class="ability-card ${disabled ? 'disabled' : ''}"><div><strong>${escapeHtml(ability.name)}</strong><small>Level ${ability.level} · ${ability.effectiveEnergyCost} Energy${resourceText} · CD ${ability.cooldown}</small></div><p>${escapeHtml(state)}</p>${abilityTargetControl(ability,combat,current)}${abilityInspection(ability)}<button data-action="combat-use-ability" data-ability="${escapeHtml(ability.id)}" ${disabled?'disabled':''}>Use Ability</button></article>`;
  }).join('')}</div>`;
}


function itemIndex(catalog,kind){return new Map((catalog?.[kind]||[]).map(x=>[x.id,x]));}
function listedStatsText(item){return formatListedStats(item||{});}
function combatConsumablePanel(run,combat,current,catalog){
 if(!current||current.control!=='player'||current.kind==='tavern-adventurer')return '';
 const idx=itemIndex(catalog,'consumables'),ids=(current.consumableIds||[]).filter(Boolean);if(!ids.length)return '<div class="notice">No combat consumable was equipped at the previous Campsite.</div>';
 const used=Number(current.consumableUsesThisBattle||0)>=1;
 return `<section class="ability-owner section"><div class="kicker">Combat Consumable · one use per battle</div><div class="ability-grid">${ids.map(id=>{const item=idx.get(id);if(!item)return '';const qty=Number(run?.inventory?.consumables?.[id]?.quantity||0);const enemies=(combat.actors||[]).filter(a=>a.side==='enemy'&&Number(a.resources?.hp||0)>0);const target=item.targetMode==='single-enemy'?`<select data-consumable-target="${escapeHtml(id)}" data-primary-combat-target>${enemies.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}</select>`:'';return `<article class="ability-card ${used||qty<=0?'disabled':''}"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.subtype||'Consumable')} · ${qty} carried</small></div><p>${escapeHtml(item.primaryEffect||'effect')}</p>${target}<button data-action="combat-use-consumable" data-consumable="${escapeHtml(id)}" ${used||qty<=0?'disabled':''}>Use Consumable</button></article>`;}).join('')}</div></section>`;
}
function setIndex(catalog){return new Map((catalog?.sets||[]).map(x=>[x.id,x]));}
function setBonusText(set){if(!set)return '';return (set.bonuses||[]).map(b=>{const bits=[];for(const [k,v] of Object.entries(b.coreStats||{}))bits.push(formatStatBonus(k,v));for(const [k,v] of Object.entries(b.modifiers||{}))bits.push(formatStatBonus(k,v));return `${b.pieces}-piece: ${bits.join(', ')}`;}).join(' · ');}
function materialCostText(ingredients,run,crafting){const names=new Map((crafting?.materials||[]).map(m=>[m.id,m.name]));return (ingredients||[]).map(ing=>{const have=Number(run?.inventory?.materials?.[ing.materialId]?.quantity||0);return `${ing.quantity} ${names.get(ing.materialId)||ing.materialId} (${have} carried)${ing.discount?` · Threaded −${ing.discount}`:''}`;}).join(' + ');}
function craftingPanel(run,crafting,catalog,ui={},baseClass=null){
 const rows=listCraftingRecipes(run,crafting,catalog,{onlyCraftable:Boolean(ui.onlyCraftable),sortStat:ui.sortStat||null,direction:ui.direction||'desc'});const groups=new Map();for(const row of rows){const key=row.recipe.category||'Other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}const categories=[...new Set((crafting?.recipes||[]).map(r=>r.category||'Other'))];
 const sortOptions=['','STR','DEX','CON','INT','FTH','CHA','LCK','damageCritChancePct','criticalDamagePct','blockChancePct','blockedDamageReductionPct','dodgeChancePct','energyGainPct','incomingHealingPct','outgoingHealingPct','finalDamagePct','shieldStrengthPct'];
 const controls=`<div class="craft-controls"><label><input type="checkbox" data-crafting-only ${ui.onlyCraftable?'checked':''}> Only show craftable</label><label>Sort by Stat <select data-crafting-sort>${sortOptions.map(x=>`<option value="${x}" ${ui.sortStat===x?'selected':''}>${escapeHtml(x?playerStatLabel(x):'None')}</option>`).join('')}</select></label><button class="secondary" data-action="craft-sort-direction">${ui.direction==='asc'?'Low → High':'High → Low'}</button></div>`;
 const body=categories.map((cat,i)=>{const list=groups.get(cat)||[];const countLabel=ui.onlyCraftable?`${list.length} craftable`:`${list.length} shown`;return `<details class="craft-category" ${i===0?'open':''}><summary>${escapeHtml(cat)} <span>${countLabel}</span></summary>${list.length?`<div class="craft-grid">${list.map(({recipe,output,craftable,ingredients})=>{const rarity=output?.rarity||recipe.rarity||'Normal';const set=(catalog?.sets||[]).find(x=>x.id===output?.setId);const type=output?.itemType?`<span class="item-type-tag">${escapeHtml(itemTypeTag(output))}</span>`:'';const compat=output?.itemType==='Weapon'?`<small class="compatibility-note">${escapeHtml(weaponCompatibilityText(output,baseClass))}</small>`:'';return `<article class="craft-card ${craftable?'craftable':'locked'}"><div class="kept-card-title"><div><strong>${escapeHtml(output?.name||recipe.name)}</strong>${type}</div><span>${escapeHtml(rarity)}</span></div><p>${output?.listedStats?escapeHtml(listedStatsText(output)):escapeHtml(output?.subtype||output?.primaryEffect||'Consumable')}</p>${compat}${set?`<p class="muted"><strong>${escapeHtml(set.name)}</strong> · ${escapeHtml(setBonusText(set))}</p>`:''}<small>${escapeHtml(materialCostText(ingredients,run,crafting))}</small><button data-action="campsite-craft" data-recipe="${escapeHtml(recipe.id)}" ${craftable?'':'disabled'}>Craft</button></article>`;}).join('')}</div>`:`<div class="empty-state">No currently ${ui.onlyCraftable?'craftable ':'available '}${escapeHtml(cat.toLowerCase())}.</div>`}</details>`;}).join('');
 return `<section class="crafting-owner section"><div class="kicker">Forest Crafting · Campsite Only</div><h4>Craft Equipment & Food</h4><p class="muted">The full crafting taxonomy remains visible even when a filter has zero results.</p>${ui.message?`<div class="notice">${escapeHtml(ui.message)}</div>`:''}${controls}${body}</section>`;
}
function campsiteLoadout(run,catalog,crafting,craftingUi,presentationUi={}){
 const eqIdx=itemIndex(catalog,'equipment'),conIdx=itemIndex(catalog,'consumables'),sets=setIndex(catalog);const requested=presentationUi.equipmentOwnerId||'vessel';const owner=equipmentOwnerState(run,requested)||equipmentOwnerState(run,'vessel');const ownerId=owner?.id||'vessel';const eq=owner?.equipment||{};const inventory=equipmentInventoryEntries(run,catalog);const cap=getRunConsumableCapacity(run);const con=Array.from({length:cap},(_,i)=>run.configuration?.consumables?.[i]||null);const conInv=Object.entries(run.inventory?.consumables||{}).filter(([,v])=>Number(v?.quantity||0)>0);const slots=[['mainHand','Main Hand'],['offHand','Off Hand'],['accessory','Accessory'],['helmet','Helmet'],['chest','Chest Armor'],['boots','Boots'],['gloves','Gloves'],['charm1','Charm 1'],['charm2','Charm 2'],['abilityItem','Ability Item']];
 const ownerTabs=[{id:'vessel',name:run.party?.find(p=>p.id==='vessel')?.name||'Vessel'},...Object.values(run.adventurers||{}).map(a=>({id:a.id,name:a.name}))].map(o=>`<button class="${o.id===ownerId?'primary':'secondary'}" data-action="campsite-equipment-owner" data-owner="${escapeHtml(o.id)}">${escapeHtml(o.name)}</button>`).join('');
 const eqRows=slots.map(([key,label])=>{const cur=eqIdx.get(typeof eq[key]==='string'?eq[key]:eq[key]?.id);const set=cur?.setId?sets.get(cur.setId):null;return `<div class="loadout-row"><div><strong>${label}</strong><small>${cur?`${escapeHtml(cur.name)} · ${escapeHtml(cur.rarity||'Normal')}`:'Empty'}</small>${cur?`<span class="item-type-tag">${escapeHtml(itemTypeTag(cur))}</span><span>${escapeHtml(listedStatsText(cur))}</span>`:''}${set?`<span>${escapeHtml(set.name)}</span>`:''}</div>${cur?`<button class="secondary" data-action="campsite-unequip-equipment" data-owner="${escapeHtml(ownerId)}" data-slot="${key}">Unequip</button>`:''}</div>`;}).join('');
 const eqChoices=inventory.length?inventory.map(({id,quantity,equippedCount,item})=>{const legal=item.slot==='charm'?['charm1','charm2']:[item.slot];const set=item.setId?sets.get(item.setId):null;const currentSlots=Object.entries(eq).filter(([,v])=>(typeof v==='string'?v:v?.id)===id).map(([k])=>k);const free=quantity>equippedCount||currentSlots.length>0;const actions=legal.map(slot=>{const here=currentSlots.includes(slot);const label=here?`Equipped: ${equipmentSlotLabel(slot)}`:(currentSlots.length?`Move to ${equipmentSlotLabel(slot)}`:`Equip${item.slot==='charm'?` ${equipmentSlotLabel(slot)}`:''}`);return `<button data-action="campsite-equip-equipment" data-owner="${escapeHtml(ownerId)}" data-item="${escapeHtml(id)}" data-slot="${slot}" ${here||!free?'disabled':''}>${escapeHtml(!free&&!here?'Equipped by Party':label)}</button>`;}).join('');return `<article class="kept-card ${currentSlots.length?'equipped':''}"><div class="kept-card-title"><div><strong>${escapeHtml(item.name)}</strong><span class="item-type-tag">${escapeHtml(itemTypeTag(item))}</span></div><span>${quantity} carried · ${escapeHtml(item.rarity||'Normal')}</span></div><p>${escapeHtml(listedStatsText(item))}</p>${item.itemType==='Weapon'?`<small class="compatibility-note">${escapeHtml(weaponCompatibilityText(item,owner?.baseClass))}</small>`:''}${set?`<small>${escapeHtml(set.name)} · ${escapeHtml(setBonusText(set))}</small>`:''}<div class="combat-actions">${actions}</div></article>`;}).join(''):'<p class="muted">No carried equipment items are available yet.</p>';
 const conRows=con.map((id,i)=>{const item=conIdx.get(id);return `<div class="loadout-row"><div><strong>Consumable ${i+1}</strong><small>${item?escapeHtml(item.name):'Empty'}</small></div>${id?`<button class="secondary" data-action="campsite-unequip-consumable" data-slot="${i+1}">Unequip</button>`:''}</div>`;}).join('');const conChoices=conInv.length?conInv.map(([id,v])=>{const item=conIdx.get(id);if(!item)return '';return `<article class="kept-card"><div class="kept-card-title"><div><strong>${escapeHtml(item.name)}</strong><span class="item-type-tag">Consumable · ${escapeHtml(item.subtype||'Item')}</span></div><span>${Number(v.quantity)} carried</span></div><p>${escapeHtml(item.primaryEffect||'effect')}</p><div class="combat-actions">${Array.from({length:cap},(_,i)=>`<button data-action="campsite-equip-consumable" data-item="${escapeHtml(id)}" data-slot="${i+1}">${con[i]===id?'Equipped':`Equip ${i+1}`}</button>`).join('')}</div></article>`;}).join(''):'<p class="muted">No carried consumables are available yet.</p>';
 return `<div class="section"><h4>Manage Party Equipment</h4><p class="muted">Select the Vessel or a deployed Tavern Adventurer. All use the same carried campaign inventory, but every loadout is independent and class restrictions are enforced.</p><div class="owner-tabs">${ownerTabs}</div><div class="notice"><strong>${escapeHtml(owner?.name||'Vessel')}</strong> · ${escapeHtml(owner?.baseClass||run.configuration?.permanentBaseClass||'Classless')} equipment</div><div class="loadout-grid">${eqRows}</div><div class="kept-grid section">${eqChoices}</div></div><div class="section"><h4>Vessel Combat Consumable</h4><p class="muted">Tavern Adventurers do not use campaign consumables.</p><div class="loadout-grid">${conRows}</div><div class="kept-grid section">${conChoices}</div></div>${craftingPanel(run,crafting,catalog,craftingUi,owner?.baseClass)}`;
}

function combatBody(run, combat, baseAbilities, subclassAbilities, equipmentCatalog, presentationUi = {}) {
  const party = (combat.actors || []).filter(actor => actor.side === 'party');
  const enemies = (combat.actors || []).filter(actor => actor.side === 'enemy');
  const current = (combat.actors || []).find(actor => actor.id === combat.currentActorId) || null;
  const turn = combat.turn || null;
  const playerTurn = current?.control === 'player';
  const actionTaken = Boolean(turn?.actionTaken);
  const panel = presentationUi.actionPanel || 'abilities';
  const settings = presentationUi.settings || {};
  const speed = Math.max(.1, Math.min(2, Number(settings.combatSpeed || 1)));
  const reducedMotion = Boolean(settings.reducedMotion);
  const showNumbers = settings.combatNumbers !== false;
  const flash = ['off','low','standard'].includes(settings.screenFlash) ? settings.screenFlash : 'standard';
  const presentation = latestCombatPresentation(combat);
  const scene = forestBattleScene(run);
  const special = run.expedition?.encounter || {};
  const initiative = initiativeView(combat);
  const targetableIds = new Set(playerTurn && !actionTaken ? (combat.actors || []).filter(actor => Number(actor.resources?.hp || 0) > 0).map(actor => actor.id) : []);
  const abilityNames = new Map([...(baseAbilities?.abilities || []), ...(subclassAbilities?.abilities || [])].map(ability => [ability.id, ability.name]));
  const combatLog = summarizeCombatLog(combat, abilityNames);
  const featureEnemyId = special.boss || special.miniboss || special.source === 'trainer' ? enemies[0]?.id : null;
  const featureEnemy = featureEnemyId ? enemies.find(actor => actor.id === featureEnemyId) : null;
  const hasImpact = [...(presentation.feedback?.values?.() || [])].flat().some(item => ['damage','crit','block','shield-loss','dodge'].includes(item.kind));
  const accessibility = [reducedMotion ? 'reduced-motion' : '', showNumbers ? '' : 'hide-combat-numbers', `flash-${flash}`, hasImpact ? 'has-impact' : ''].filter(Boolean).join(' ');
  const partyBattleSide = renderBattleSide('Party', party, 'party', combat.currentActorId, { presentation, targetableIds, showNumbers, featureEnemyId: null });
  const enemyBattleSide = renderBattleSide('Enemies', enemies, 'enemy', combat.currentActorId, { presentation, targetableIds, showNumbers, featureEnemyId });
  const travelLane = battleActionLane(presentation);
  const playerControls = actionTaken ? `<div class="combat-command-bar completed"><button data-action="combat-end-turn">End Turn</button></div>` : (current?.keptState?.perId?.['KI-184']?.awaitingChoice ? keptCombatStartPrompt(current) : (current?.classState?.baseClass === 'Druid' && !current.classState?.form ? `<div class="notice"><strong>Choose Starting Form</strong><div class="combat-actions"><button data-action="combat-druid-form" data-form="Fang">Fang</button><button data-action="combat-druid-form" data-form="Grove">Grove</button><button data-action="combat-druid-form" data-form="Bloom">Bloom</button></div></div>` : `
    <div class="combat-command-bar" aria-label="Combat actions">
      <button class="${panel==='abilities'?'active':''}" data-action="combat-panel" data-panel="abilities"><span>Abilities</span><small>Use Ability · Base / Subclass / Kept</small></button>
      <button data-action="combat-charge"><span>Charge</span><small>+1 Energy</small></button>
      <button data-action="combat-guard"><span>Guard</span><small>Guaranteed Block</small></button>
      <button class="${panel==='consumable'?'active':''}" data-action="combat-panel" data-panel="consumable"><span>Consumable</span><small>Use Consumable · one this battle</small></button>
    </div>
    <div class="combat-action-drawer">
      ${panel === 'consumable' ? combatConsumablePanel(run, combat, current, equipmentCatalog) : `${abilityPanel(combat,current,baseAbilities)}${subclassAbilityPanel(combat,current,subclassAbilities)}${keptActivePanel(combat,current)}`}
    </div>`));
  return `
    <div class="combat-foundation combat-presentation ${accessibility}" style="--combat-speed:${speed}" data-scene="${escapeHtml(scene)}">
      <div class="combat-head combat-hud-top">
        <div><div class="kicker">Combat · Round ${Number(combat.round || 1)}</div><h3>${current ? `${escapeHtml(current.name)}'s Turn` : 'Battle'}</h3><div class="muted">Fixed battlefield · action-only motion</div></div>
        <label class="combat-speed-control"><span>Combat Speed</span><select data-setting="combatSpeed" aria-label="Combat speed">${[.1,.25,.5,.75,1,1.25,1.5,1.75,2].map(v=>`<option value="${v}" ${Number(v)===speed?'selected':''}>${v}×</option>`).join('')}</select></label>
      </div>
      <div class="initiative-strip" aria-label="Initiative order">${initiative.map((entry,index)=>`<div class="initiative-token ${entry.current?'current':''} ${entry.passed?'passed':''} ${entry.defeated?'defeated':''}" data-side="${escapeHtml(entry.side)}"><span>${escapeHtml(String(entry.name).slice(0,1).toUpperCase())}</span><small>${entry.current?'NOW':entry.passed?'DONE':`#${index+1}`}</small><strong>${escapeHtml(entry.name)}</strong></div>`).join('')}</div>
      <div class="battle-scene scene-${escapeHtml(scene)} ${featureEnemyId?'special-battle':''}" aria-label="Fixed combat battlefield — perspective 2.5D presentation">
        <div class="scene-backdrop" aria-hidden="true"></div>
        <div class="scene-midground" aria-hidden="true"></div>
        <div class="scene-foreground" aria-hidden="true"></div>
        <div class="scene-atmosphere" aria-hidden="true"></div>
        ${featureEnemy ? `<div class="boss-battle-banner"><div><span>${special.boss ? 'REGION BOSS' : special.miniboss ? 'MINIBOSS' : 'FOREST TRAINER'}</span><strong>${escapeHtml(featureEnemy.name)}</strong></div><div class="boss-hp-track"><i style="width:${hpPercent(featureEnemy).toFixed(2)}%"></i><b>${showNumbers ? `${Math.round(Number(featureEnemy.resources?.hp||0))} / ${Math.round(Number(featureEnemy.resources?.maxHp||0))} HP` : `${Math.round(hpPercent(featureEnemy))}% HP`}</b></div></div>` : ''}
        <div class="battle-ground" aria-hidden="true"><span></span></div>
        ${travelLane}
        ${partyBattleSide}
        <div class="battlefield-center" aria-hidden="true"><span>VS</span></div>
        ${enemyBattleSide}
        <div class="impact-flash" aria-hidden="true"></div>
      </div>
      ${playerTurn ? playerControls : '<div class="notice ai-turn-notice">The current combatant is resolving its action.</div>'}
      <details class="combat-log-panel"><summary>Combat Log <span>${combatLog.length} recent entries</span></summary><div class="combat-log-lines">${combatLog.length ? combatLog.map(line=>`<div>${escapeHtml(line)}</div>`).join('') : '<div class="muted">Combat events will appear here.</div>'}</div></details>
    </div>`;
}

function eventEffectSummary(details={},forestCrafting,equipmentCatalog){const mats=new Map((forestCrafting?.materials||[]).map(m=>[m.id,m.name]));const foods=new Map((equipmentCatalog?.consumables||[]).map(c=>[c.id,c.name]));const bits=[];for(const applied of details.applied||[]){if(applied.onyx)bits.push(`+${applied.onyx} Onyx`);if(applied.onyxLost)bits.push(`−${applied.onyxLost} Onyx`);if(applied.chronicleProgress)bits.push(`+${Number(applied.chronicleProgress).toFixed(2).replace(/\.00$/,'')} Chronicle Progress`);if(applied.material)bits.push(`+${applied.material.quantity} ${mats.get(applied.material.id)||applied.material.id}`);if(applied.food)bits.push(`+${applied.food.quantity} ${foods.get(applied.food.id)||applied.food.id}`);if(applied.hpChange)bits.push(`${applied.hpChange>0?'+':''}${applied.hpChange} HP`);if(applied.flag)bits.push('A persistent expedition effect was applied.');}return `<div class="event-reward-summary"><strong>Applied result</strong>${bits.length?`<ul>${bits.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>`:'<p>No inventory or HP change was attached to this outcome.</p>'}</div>`;}

function expeditionBody(run, baseAbilities, subclassAbilities, equipmentCatalog, forestCrafting, craftingUi, presentationUi = {}) {
  const expedition = run.expedition;
  const intro = expedition.depth >= Number(expedition.introductoryBand?.start || 1)
    && expedition.depth <= Number(expedition.introductoryBand?.end || 5);
  if (expedition.state === 'choosing-event') {
    return `
      <div class="expedition-heading-row">
        <div><h3>Choose a Route</h3><p class="muted">Exactly three possible events have been drawn for this Depth. Choosing one locks the route until its encounter is resolved.</p></div>
        ${intro ? '<span class="depth-badge">Introductory Depth</span>' : ''}
      </div>
      ${eventCards(expedition)}`;
  }

  if (expedition.state === 'combat-pending') {
    if (run.combat) return combatBody(run, run.combat, baseAbilities, subclassAbilities, equipmentCatalog, presentationUi);
    const card = selectedCard(expedition);
    const source = expedition.encounter?.source === 'checkmark-followup' ? 'A checkmarked event has immediately led into a random combat.' : 'The chosen route has become a battle.';
    return `
      <div class="encounter-lock">
        <div class="kicker">Combat Encounter</div>
        <h3>${card ? escapeHtml(card.label) : 'Random Combat'}</h3>
        <p class="muted">${escapeHtml(source)} This encounter is permanently attached to Depth ${expedition.depth} until combat resolves it.</p>
      </div>`;
  }

  if (expedition.state === 'noncombat-pending') {
    const card = selectedCard(expedition);
    if (card?.trainer) {
      return `
        <div class="encounter-lock">
          <div class="kicker">Forest Trainer</div>
          <h3>${escapeHtml(card.label)}</h3>
          <p>${escapeHtml(card.description || '')}</p>
          <div class="notice"><strong>${escapeHtml(card.subclass || '')}</strong> · ${escapeHtml(card.baseClass || '')} subclass</div>
          <p class="muted">Choose exactly one path. Learning unlocks this subclass account-wide and ends the encounter without a fight. Fighting permanently gives up learning during this encounter and challenges the Trainer for their guaranteed, party-scaled SoulfireCore.</p>
          <div class="combat-actions section">
            <button data-action="trainer-learn" data-trainer="${escapeHtml(card.trainerId)}">Learn ${escapeHtml(card.subclass)}</button>
            <button class="secondary" data-action="trainer-fight" data-trainer="${escapeHtml(card.trainerId)}">Fight ${escapeHtml(card.label.replace('Trainer — ',''))}</button>
          </div>
        </div>`;
    }
    const participants=getForestCheckParticipants(run,card,equipmentCatalog);
    const options=participants.map((p,i)=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.stat)} ${Math.round(p.relevantStat)} · ${p.successChancePct}%${i===0?' · Suggested':''}</option>`).join('');
    const best=participants[0];
    return `
      <div class="encounter-lock">
        <div class="kicker">${escapeHtml(card?.kind==='landmark'?'Landmark':card?.kind==='helpful-person'?'Helpful Person':card?.kind==='discovery'?'Discovery':'Forest Event')}</div>
        <h3>${escapeHtml(card?.label || 'Noncombat Event')}</h3>
        <p>${escapeHtml(card?.description || '')}</p>
        <div class="notice"><strong>${escapeHtml(card?.check?.stat || '')} check</strong> · DC ${Math.round(Number(card?.check?.dc||0))}${best?` · Best current chance ${best.successChancePct}%`:''}</div>
        <label class="section"><span>Choose one living real party member</span><select data-forest-check-participant>${options}</select></label>
        <p class="muted">Roll: d20 + floor(relevant stat ÷ 2) + specialization modifier. A natural 20 is a Critical Success. A natural 1 only critically fails if the final total still misses the DC, so a sufficiently specialized character can reach a true 100% chance.</p>
        ${card?.checkmark?'<p class="muted">This event carries a checkmark: success or failure immediately leads into one random combat at this same Depth.</p>':'<p class="muted">This event does not automatically force a follow-up battle.</p>'}
        <button data-action="forest-event-roll">Attempt Check</button>
      </div>`;
  }

  if (expedition.state === 'event-result') {
    const d=expedition.lastEventResult||[...(expedition.history||[])].at(-1)?.resolution?.details||{};const label=d.criticalSuccess?'Critical Success':d.criticalFailure?'Critical Failure':d.outcome==='success'?'Success':'Failure';
    return `<div class="encounter-lock event-result-card"><div class="kicker">Forest Check Result</div><h3>${label}</h3><div class="notice"><strong>${escapeHtml(d.stat||'Check')}</strong> · Roll ${Number(d.roll||0)} + ${Number(d.modifier||0)} = ${Number(d.total||0)} vs DC ${Number(d.dc||0)}</div>${eventEffectSummary(d,forestCrafting,equipmentCatalog)}<button class="primary" data-action="forest-event-continue-combat">Continue to Combat</button></div>`;
  }

  if (expedition.state === 'campsite') {
    return `
      <div class="campsite-owner">
        <div class="kicker">Mandatory Post-Battle Campsite</div>
        <h3>The party has stopped for camp.</h3>
        <p class="muted">The expedition cannot advance until the campsite is completed. Equipment and combat-consumable choices made here apply to the next battle.</p>
        ${campsiteLoadout(run,equipmentCatalog,forestCrafting,craftingUi,presentationUi)}
        <button class="expedition-continue-cta" data-action="expedition-leave-campsite"><span aria-hidden="true">➜</span><strong>Finish Campsite and Continue</strong><span aria-hidden="true">➜</span></button>
      </div>`;
  }

  if (expedition.state === 'awaiting-next-step') {
    const last=[...(expedition.history||[])].at(-1); const d=last?.resolution?.details;
    const resultLabel=d?.criticalSuccess?'Critical Success':d?.criticalFailure?'Critical Failure':d?.outcome==='success'?'Success':d?.outcome==='failure'?'Failure':null;
    const detail=d?.type==='trainer-learn'?`Learned ${escapeHtml(d.subclass)} from ${escapeHtml(d.trainerName)}. ${d.mantleOpened?'This class’s Mantle Room is now open account-wide.':''}`:(d?.roll?`${resultLabel} · rolled ${d.roll} + ${d.modifier} = ${d.total} vs DC ${d.dc}.`:null);
    return `
      <div class="encounter-lock">
        <h3>The route is resolved.</h3>
        ${detail?`<div class="notice">${detail}</div>`:''}${d?.roll?eventEffectSummary(d,forestCrafting,equipmentCatalog):''}
        <p class="muted">No post-event combat was required for this resolution.</p>
        <button data-action="expedition-next-step">Continue Deeper</button>
      </div>`;
  }

  if (expedition.state === 'region-boundary') {
    return `
      <div class="region-boundary">
        <div class="kicker">Depth ${expedition.depth} / ${expedition.maxDepth}</div>
        <h3>The Forest route has reached its region boundary.</h3>
        <p class="muted">The expedition will not create a thirty-first Depth. The Heartwood Sovereign has fallen. Return safely and bank the campaign now, or carry every reward and every wound onward toward ${escapeHtml(expedition.nextRegion?.name || 'the next region')}.</p>
        <div class="button-row"><button class="primary" data-action="campaign-return-tavern">Return to the Tavern</button><button data-action="campaign-continue-beyond">Continue Beyond the Door</button></div>
      </div>`;
  }

  if (expedition.state === 'awaiting-next-region') {
    return `<div class="region-boundary"><div class="kicker">Beyond the Forest</div><h3>${escapeHtml(run.regionTransition?.toRegionName || expedition.nextRegion?.name || 'The next region')} lies ahead.</h3><p class="muted">This campaign remains active. Level, EXP, HP, equipment, materials, consumables, Tavern Adventurers, Exhaustion, Chronicle allocation, Mara quest state, and campaign records are all preserved at the transition.</p></div>`;
  }
  return '<p class="muted">The current expedition state is preserved.</p>';
}

function adventurerSheet(a,run,catalog,baseAbilities,subclassAbilities){const raw=combinedCharacterStats(a);const aggregate=aggregateEquipmentEffects(a.equipment||{},catalog,{baseClass:a.baseClass,classless:false});const core=aggregate.ok?applyEquipmentCoreStats(raw,aggregate):raw;const kept=applyKeptPreCombatStats(core,a.subclass,a.keptImpressions||[],a.keptImpressionChoices||{});const derived=baseDerivedStats(kept);const maxHp=Math.max(1,Math.round(10+Number(kept.CON||0)*2+Math.max(0,Number(a.level||1)-1)*3));const currentHp=Number.isFinite(Number(a.currentHp))?Math.max(0,Number(a.currentHp)):maxHp;const resource=resourceDefinition(a.baseClass);const abilities=[...(baseAbilities?.abilities||[]).filter(x=>x.baseClass===a.baseClass&&Number(x.level||1)<=Number(a.level||1)),...(subclassAbilities?.abilities||[]).filter(x=>x.subclass===a.subclass&&Number(x.level||1)<=Number(a.level||1))];const eqIdx=itemIndex(catalog,'equipment');const equipment=Object.entries(a.equipment||{}).map(([slot,id])=>`${equipmentSlotLabel(slot)}: ${eqIdx.get(typeof id==='string'?id:id?.id)?.name||'Empty'}`).join(' · ')||'No equipment';return `<details class="adventurer-sheet"><summary><strong>${escapeHtml(a.name)}</strong> Lv ${Number(a.level||1)} · ${Math.round(Number(a.exp||0))} EXP · ${escapeHtml(a.subclass||a.baseClass)}</summary><div class="inspection-body"><p><strong>Role:</strong> ${escapeHtml(a.combatRole||'Tavern Adventurer')} · ${escapeHtml(a.baseClass)}${a.subclass?` / ${escapeHtml(a.subclass)}`:''}</p><p><strong>HP:</strong> ${Math.round(currentHp)} / ${maxHp} · <strong>Exhaustion:</strong> ${Math.max(0,Math.trunc(Number(a.exhaustion||0)))}</p><p><strong>Core stats:</strong> ${escapeHtml(Object.entries(kept).map(([k,v])=>`${k} ${Math.round(Number(v||0))}`).join(' · '))}</p><p><strong>Derived combat stats:</strong> ${escapeHtml(formatDerivedStats(derived))}</p><p><strong>Class resource:</strong> ${escapeHtml(resource?`${resource.name} 0 / ${resource.max}`:'None')}</p><p><strong>Status effects:</strong> ${escapeHtml((a.statusEffects||[]).map(x=>x.name||x.id).join(', ')||'None between battles')}</p><p><strong>Equipment:</strong> ${escapeHtml(equipment)}</p><div><strong>Abilities</strong>${abilities.map(ab=>`<details class="ability-inspection compact"><summary>${escapeHtml(ab.name)}</summary><pre>${escapeHtml(readableAbilityText(ab))}</pre></details>`).join('')||'<p class="muted">No abilities unlocked yet.</p>'}</div></div></details>`;}

function materialInventory(run) {
  const entries = Object.entries(run?.inventory?.materials || {}).filter(([, item]) => Number(item?.quantity || 0) > 0);
  if (!entries.length) return '<p class="muted">No Forest materials carried yet.</p>';
  return `<div class="run-stat-strip">${entries.map(([id, item]) => `<span><strong>${escapeHtml(item.name || id)}</strong> ${Math.round(Number(item.quantity || 0))}</span>`).join('')}</div>`;
}

export function renderCampaignRun({ run, baseAbilities, subclassAbilities, progression, equipmentCatalog, forestCrafting, forestTrainers, maraQuestStatus = null, craftingUi, presentationUi = {} }) {
  const expedition = run.expedition;
  const progress = Math.max(0, Math.min(100, (Number(expedition.depth || 1) / Number(expedition.maxDepth || 30)) * 100));
  return shell(`
    <section class="campaign-run-hero panel">
      <div><div class="kicker">Beyond the Door</div><h2>${escapeHtml(expedition.regionName)} · Depth ${expedition.depth} / ${expedition.maxDepth}</h2><p class="muted">The expedition is preserved exactly when you leave this screen. No Depth, card, encounter, campsite, or combat turn advances while you are away.</p></div>
      <div class="run-level"><span>Character Level</span><strong>${run.character.level}</strong><small>${Math.round(Number(run.character.exp||0))} EXP · ${Math.round(expToNextLevel(run.character,progression))} to next</small></div>
    </section>
    <div class="depth-track" aria-label="Forest depth progress"><span style="width:${progress.toFixed(2)}%"></span></div>
    <section class="identity-grid section">
      <div><span>Path</span><strong>${run.configuration.classless ? 'Classless' : escapeHtml(run.configuration.effectiveBaseClass || '')}</strong></div>
      <div><span>Subclass</span><strong>${run.configuration.classless ? 'Suppressed' : escapeHtml(run.configuration.effectiveSubclass || 'None')}</strong></div>
      <div><span>Carried Onyx</span><strong>${Math.round(run.rewards.carriedOnyx || 0)}</strong></div>
      <div><span>Chronicle Progress Earned</span><strong>${Math.round(run.rewards.chronicleProgress || 0)}</strong></div>
    </section>
    ${maraQuestStatus?`<section class="panel section"><div class="kicker">Mara Quest</div><h3>${escapeHtml(maraQuestStatus.label)}</h3><div class="reward-row"><span>${escapeHtml(maraQuestStatus.status)}</span><strong>${Math.min(Number(maraQuestStatus.progress||0),Number(maraQuestStatus.target||1))} / ${Number(maraQuestStatus.target||1)}</strong></div>${maraQuestStatus.complete?'<p class="field-help">The objective is complete. Its Onyx and Chronicle reward is secured for settlement; the Onyx remains part of the carried campaign total until you return or are defeated.</p>':''}</section>`:''}
    <section class="panel section expedition-panel">
      ${expeditionBody(run, baseAbilities, subclassAbilities, equipmentCatalog, forestCrafting, craftingUi, presentationUi)}
    </section>
    <section class="panel section">
      <h3>Forest Materials</h3>
      ${materialInventory(run)}
    </section>
    <section class="panel section">
      <h3>Run Progression</h3>
      <div class="run-stat-strip">${statLine(combinedCharacterStats(run.character))}</div>
      <p class="muted section">Maximum HP uses 10 base + 2 per CON + 3 per Character Level gained. Level-earned Stat Points are run-only and disappear when this campaign ends.</p>
      <div class="notice">${run.character.unspentLevelStatPoints} run-earned Stat Point${run.character.unspentLevelStatPoints === 1 ? '' : 's'} currently unspent.</div>
      ${Number(run.character.unspentLevelStatPoints||0)>0 && !run.combat ? `<div class="combat-actions section">${['STR','DEX','CON','INT','FTH','CHA','LCK'].map(stat=>`<button data-action="run-stat-add" data-stat="${stat}">+1 ${stat}</button>`).join('')}</div>` : ''}
      ${(Object.values(run.adventurers||{}).length)?`<div class="section"><h4>Tavern Adventurers</h4><div class="adventurer-sheet-list">${Object.values(run.adventurers||{}).map(a=>adventurerSheet(a,run,equipmentCatalog,baseAbilities,subclassAbilities)).join('')}</div></div>`:''}
      ${run.lastCombatReward?`<div class="notice section">Last battle: +${Math.round(run.lastCombatReward.exp||0)} EXP to each living real party member · +${Math.round(run.lastCombatReward.onyxAwarded||0)} Onyx · +${Number(run.lastCombatReward.chronicleProgress||0).toFixed(2).replace(/\.00$/,'')} Chronicle Progress.</div>`:''}
    </section>
    <div class="section"><button class="secondary" data-action="pause-campaign">Leave Campaign Screen</button></div>
  `, { back: false });
}
