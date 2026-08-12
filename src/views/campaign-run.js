import { listUsableBaseAbilities } from '../ability-controller.js';
import { listUsableSubclassAbilities } from '../subclass-controller.js';
import { escapeHtml, shell } from './shared.js';
import { combinedCharacterStats, expToNextLevel, maxHpFor } from '../character-progression.js';
import { baseDerivedStats, capBlockChance, capDodgeChance } from '../combat-math.js';
import { aggregateEquipmentEffects, applyEquipmentCoreStats, equipmentInventoryEntries, equipmentOwnerState, legalEquipmentSlots, equipmentCatalogueIndex } from '../equipment-controller.js';
import { applyKeptPreCombatStats, keptMaxHpMultiplier } from '../kept-impression-state.js';
import { resourceDefinition } from '../base-class-state.js';
import { playerStatLabel, formatStatBonus, formatListedStats, itemTypeTag, equipmentSlotLabel, weaponCompatibilityText, formatDerivedStats, readableAbilityText } from '../player-facing.js';
import { keptActiveAbilities } from '../kept-impression-runtime.js';
import { getRunConsumableCapacity } from '../consumable-controller.js';
import { listCraftingRecipes } from '../crafting-controller.js';
import { listUsableEquipmentAbilities } from '../equipment-ability-controller.js';
import { listUsableRacialAbilities } from '../racial-ability-controller.js';
import { getForestCheckParticipants } from '../forest-event-controller.js';
import { regionalBattleScene, hpPercent, shieldPercent, energyPercent, actorStatusTokens, latestCombatPresentation, initiativeView, summarizeCombatLog } from '../combat-presentation.js';
import { portraitInnerMarkup } from './portrait.js';
import { eventCardPortraitDescriptor } from '../content-portrait.js';

function statLine(stats = {}) {
  return Object.entries(stats).map(([key, value]) => `<span><strong>${escapeHtml(key)}</strong> ${Number(value || 0)}</span>`).join('');
}

const ROUTE_ART_FALLBACK_ROOT='./assets/route-art/';
function eventCardArt(card,contentPortraits,{noArt=false,placeholder='EVENT'}={}){
  if(noArt)return `<div class="route-art-placeholder" role="img" aria-label="${escapeHtml(card.label)} — text placeholder"><span>${escapeHtml(placeholder)}</span><small>Artwork deferred</small></div>`;
  const art=eventCardPortraitDescriptor(card,contentPortraits);
  if(art.ready){
    return `<picture class="content-portrait-picture" data-content-portrait="${escapeHtml(`${art.type}:${art.id}`)}"><source type="image/avif" srcset="${escapeHtml(art.avifAsset)}"><img src="${escapeHtml(art.webpAsset)}" alt="${escapeHtml(card.label)} event illustration" width="${art.width}" height="${art.height}" loading="lazy" decoding="async" draggable="false"></picture>`;
  }
  const fallbackAsset=art.fallbackAsset||`${ROUTE_ART_FALLBACK_ROOT}event.svg`;
  return `<img src="${escapeHtml(fallbackAsset)}" alt="${escapeHtml(card.label)} route scene" width="${art.width}" height="${art.height}" loading="lazy" decoding="async" draggable="false" data-content-portrait-fallback="${escapeHtml(art.id||'unregistered')}">`;
}
function eventCards(expedition,contentPortraits) {
  const cards=Array.isArray(expedition.cards)?expedition.cards:[];const noArt=['bog-of-lost-souls','heavenly-tower','ruined-vampiric-plains','caverns-to-hell','that-dragons-dungeon'].includes(expedition.regionId);const placeholder=expedition.regionId==='heavenly-tower'?'HT':expedition.regionId==='ruined-vampiric-plains'?'RVP':expedition.regionId==='caverns-to-hell'?'HELL':expedition.regionId==='that-dragons-dungeon'?'TDD':'BOG';
  return `<div class="expedition-card-grid">${cards.map(card=>`<article class="expedition-card"><div class="route-art">${eventCardArt(card,contentPortraits,{noArt,placeholder})}</div><div class="event-card-number">Path ${card.ordinal}</div><h4>${escapeHtml(card.label)}</h4><p>${escapeHtml(card.description)}</p><button data-action="expedition-select-card" data-card="${escapeHtml(card.id)}">Choose This Path</button></article>`).join('')}</div>`;
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
  const formationClass=actors.length>=5?'formation-very-dense':actors.length>=4?'formation-dense':'formation-standard';
  return `<div class="battle-side ${side}-side ${formationClass}" data-actor-count="${actors.length}"><div class="battle-side-label">${escapeHtml(label)}</div>${actors.map((actor, index) => {
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
  const semantic=String(presentation?.semanticAction||''),semanticTarget=feedback.length>0&&['damage','protection','healing'].includes(semantic),semanticSource=acting&&['damage','protection','healing'].includes(semantic);
  const semanticLabel=semantic==='damage'?'Damage':semantic==='protection'?'Protection':semantic==='healing'?'Healing':'';
  const classes = ['battle-actor', current ? 'current' : '', defeated ? 'defeated' : '', acting ? 'acting' : '', actor.real === false ? 'summon' : '', featured ? 'featured-enemy' : '', feedbackKinds.has('dodge') ? 'dodging' : '', feedbackKinds.has('block') || feedbackKinds.has('guard') ? 'blocking' : '', [...feedbackKinds].some(kind => ['damage','crit','shield-loss'].includes(kind)) ? 'taking-hit' : '', [...feedbackKinds].some(kind => ['heal','crit-heal','shield'].includes(kind)) ? 'receiving-support' : '', semanticSource?`semantic-${semantic}-source`:'',semanticTarget?`semantic-${semantic}-target`:'', targetable && !defeated ? 'targetable' : ''].filter(Boolean).join(' ');
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
    <div class="actor-ground-shadow" aria-hidden="true"></div>${(semanticSource||semanticTarget)&&semanticLabel?`<span class="semantic-action-badge">${semanticSource?'Using':'Receiving'} ${escapeHtml(semanticLabel)}</span>`:''}
    <div class="actor-portrait-shell" aria-hidden="true"><div class="actor-portrait">${actor.portraitAsset?portraitInnerMarkup({asset:actor.portraitAsset,alt:'',size:'full',loading:'eager'}):`<span>${escapeHtml(initials)}</span>`}</div>${featured ? '<div class="boss-crown">✦</div>' : ''}</div>
    <div class="actor-readout">
      <div class="actor-name-row"><div><div class="battle-slot">${escapeHtml(actor.battlefieldSlot?.key || '')}</div><h4>${escapeHtml(actor.name)}</h4><small>${escapeHtml(sideLabel)}${actor.kind === 'tavern-adventurer' && actor.race ? ` · ${escapeHtml(actor.race)}` : ''}${actor.combatRole ? ` · ${escapeHtml(actor.combatRole)}` : ''}</small></div>${current ? '<span class="turn-chip">NOW</span>' : ''}</div>
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

function equipmentAbilityPanel(combat,current){
  if(!current)return '';const abilities=listUsableEquipmentAbilities(combat,current.id);if(!abilities.length)return '';
  const living=(combat.actors||[]).filter(a=>Number(a.resources?.hp||0)>0),allies=living.filter(a=>a.side===current.side),enemies=living.filter(a=>a.side!==current.side);
  const opts=actors=>actors.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
  return `<section class="section equipment-abilities-panel"><div class="kicker">Equipment Spells & Techniques</div><p class="muted">Granted by equipped Spell Books, Spell Slot charms, and Ability Items. These use the combatant’s normal action, Energy, and cooldown rules.</p><div class="ability-grid">${abilities.map(ability=>{const targets=ability.targetMode==='single-enemy'?enemies:allies;const disabled=ability.cooldownRemaining>0||ability.effectiveEnergyCost>Number(current.resources?.energy||0)||!targets.length;return `<article class="ability-card ${disabled?'disabled':''}"><div><strong>${escapeHtml(ability.name)}</strong><small>${escapeHtml(ability.sourceItemName||'Equipment')} · ${ability.effectiveEnergyCost} Energy · Cooldown ${ability.cooldown}</small></div><p>${escapeHtml((ability.components||[]).map(componentText).join(' · '))}</p>${targets.length?`<select data-equipment-ability-target="${escapeHtml(ability.id)}" data-primary-combat-target aria-label="Target for ${escapeHtml(ability.name)}">${opts(targets)}</select>`:''}<button data-action="combat-use-equipment-ability" data-equipment-ability="${escapeHtml(ability.id)}" ${disabled?'disabled':''}>${ability.cooldownRemaining>0?`Cooldown ${ability.cooldownRemaining}`:'Use Equipment Ability'}</button></article>`;}).join('')}</div></section>`;
}

function racialAbilityPanel(combat,current){
  if(!current)return '';
  const abilities=listUsableRacialAbilities(combat,current.id);if(!abilities.length)return '';
  const enemies=(combat.actors||[]).filter(a=>a.side!==current.side&&Number(a.resources?.hp||0)>0);
  const opts=enemies.map(a=>`<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('');
  return `<section class="section racial-abilities-panel"><div class="kicker">Racial Ability</div><p class="muted">Your Tavern-selected racial configuration is locked for this campaign.</p><div class="ability-grid">${abilities.map(ability=>{const energyBlocked=ability.effectiveEnergyCost>Number(current.resources?.energy||0),targetBlocked=ability.targetMode!=='all-enemies'&&!enemies.length,disabled=ability.cooldownRemaining>0||energyBlocked||targetBlocked;const target=ability.targetMode==='all-enemies'?'':`<select data-racial-ability-target="${escapeHtml(ability.id)}" data-primary-combat-target aria-label="Target for ${escapeHtml(ability.name)}">${opts}</select>`;const second=ability.targetMode==='up-to-two-enemies'&&enemies.length>1?`<label>Second target <select data-racial-ability-secondary="${escapeHtml(ability.id)}"><option value="">Automatic different enemy</option>${opts}</select></label>`:'';return `<article class="ability-card ${disabled?'disabled':''}"><div><strong>${escapeHtml(ability.name)}</strong><small>${ability.effectiveEnergyCost} Energy · CD ${ability.cooldown} · ${escapeHtml(ability.damageType)}</small></div><p>${escapeHtml(ability.summary||'Configured racial combat action.')}</p>${target}${second}<button data-action="combat-use-racial-ability" data-racial-ability="${escapeHtml(ability.id)}" ${disabled?'disabled':''}>${ability.cooldownRemaining>0?`Cooldown ${ability.cooldownRemaining}`:energyBlocked?'Not enough Energy':'Use Racial Ability'}</button></article>`;}).join('')}</div></section>`;
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
  if (!current) return '';
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
  if (!current) return '';
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
function craftingPanel(run,crafting,catalog,ui={},owner=null){
 const filterArgs={onlyCraftable:Boolean(ui.onlyCraftable),sortStat:ui.sortStat||null,direction:ui.direction||'desc',query:ui.query||'',slot:ui.slot||'all',itemType:ui.itemType||'all',subtype:ui.subtype||'all',weaponType:ui.weaponType||'all',armorWeight:ui.armorWeight||'all'};
 const hiddenIds=new Set(Array.isArray(ui.hiddenRecipeIds)?ui.hiddenRecipeIds:[]),showHidden=Boolean(ui.showHidden);let rows=listCraftingRecipes(run,crafting,catalog,filterArgs);if(!showHidden)rows=rows.filter(row=>!hiddenIds.has(row.recipe.id));
 const groups=new Map();for(const row of rows){const key=row.recipe.category||'Other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}const categories=[...new Set((crafting?.recipes||[]).map(r=>r.category||'Other'))];
 const outputs=[...(catalog?.equipment||[]),...(catalog?.consumables||[])],uniq=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
 const slots=uniq(outputs.map(x=>x.slot||'consumable')),types=uniq(outputs.map(x=>x.itemType||'Consumable')),subtypes=uniq(outputs.map(x=>x.itemSubtype||x.charmType||x.subtype)),weaponTypes=uniq(outputs.map(x=>x.weaponType)),armorWeights=uniq(outputs.map(x=>x.armorCategory));
 const optionList=(values,current,labeler=v=>v)=>`<option value="all" ${current==='all'?'selected':''}>All</option>${values.map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(labeler(v))}</option>`).join('')}`;
 const sortOptions=['','STR','DEX','CON','INT','FTH','CHA','LCK','damageCritChancePct','criticalDamagePct','blockChancePct','blockedDamageReductionPct','dodgeChancePct','energyGainPct','incomingHealingPct','outgoingHealingPct','finalDamagePct','shieldStrengthPct'];
 const currentHidden=(crafting?.recipes||[]).filter(r=>hiddenIds.has(r.id)).length;
 const controls=`<div class="craft-controls craft-filter-grid"><label class="craft-search">Search <input type="search" data-crafting-search value="${escapeHtml(ui.query||'')}" placeholder="Item, recipe, subtype…"></label><label>Slot <select data-crafting-slot>${optionList(slots,ui.slot||'all',equipmentSlotLabel)}</select></label><label>Type <select data-crafting-type>${optionList(types,ui.itemType||'all')}</select></label><label>Subtype <select data-crafting-subtype>${optionList(subtypes,ui.subtype||'all')}</select></label><label>Weapon Type <select data-crafting-weapon-type>${optionList(weaponTypes,ui.weaponType||'all')}</select></label><label>Armor Weight <select data-crafting-armor-weight>${optionList(armorWeights,ui.armorWeight||'all')}</select></label><label class="craft-checkbox"><input type="checkbox" data-crafting-only ${ui.onlyCraftable?'checked':''}> Only show craftable</label><label>Sort by Stat <select data-crafting-sort>${sortOptions.map(x=>`<option value="${x}" ${ui.sortStat===x?'selected':''}>${escapeHtml(x?playerStatLabel(x):'None')}</option>`).join('')}</select></label><button class="secondary" data-action="craft-sort-direction">${ui.direction==='asc'?'Low → High':'High → Low'}</button></div>`;
 const recipeTools=`<div class="crafting-recipe-tools"><button class="secondary" data-action="craft-toggle-hidden">${showHidden?'Hide hidden recipes':`Show hidden recipes${currentHidden?` (${currentHidden})`:''}`}</button>${currentHidden?`<button class="secondary" data-action="craft-unhide-all">Unhide All</button>`:''}</div>`;
 const recommendTools=`<section class="craft-recommendation-tools"><div><strong>Recommended gear for ${escapeHtml(owner?.name||'selected character')}</strong><small>Uses that character’s class/subclass ability scaling, listed equipment bonuses, combat-stat value, legal weapon rules, and carried copies. Hidden recipes are never auto-crafted.</small></div><div class="craft-recommendation-actions"><button class="primary" data-action="campsite-auto-craft" data-owner="${escapeHtml(owner?.id||'vessel')}">Auto Craft Recommended Gear</button><button class="secondary" data-action="campsite-auto-equip" data-owner="${escapeHtml(owner?.id||'vessel')}">Auto Equip Recommended Gear</button></div></section>`;
 const openCategories=Array.isArray(ui.openCategories)?new Set(ui.openCategories):null;
 const body=categories.map((cat,i)=>{const list=groups.get(cat)||[];const countLabel=ui.onlyCraftable?`${list.length} craftable`:`${list.length} shown`;const isOpen=openCategories?openCategories.has(cat):i===0;return `<details class="craft-category" data-craft-category="${escapeHtml(cat)}" ${isOpen?'open':''}><summary>${escapeHtml(cat)} <span>${countLabel}</span></summary>${list.length?`<div class="craft-grid">${list.map(({recipe,output,craftable,ingredients})=>{const set=(catalog?.sets||[]).find(x=>x.id===output?.setId);const type=output?.itemType?`<span class="item-type-tag">${escapeHtml(itemTypeTag(output))}</span>`:'';const compat=output?.itemType==='Weapon'?`<small class="compatibility-note">${escapeHtml(weaponCompatibilityText(output,owner?.baseClass))}</small>`:'';const hidden=hiddenIds.has(recipe.id);return `<article class="craft-card ${craftable?'craftable':'locked'} ${hidden?'recipe-hidden':''}"><div class="kept-card-title"><div><strong>${escapeHtml(output?.name||recipe.name)}</strong>${type}</div></div><p>${output?.listedStats?escapeHtml(listedStatsText(output)):escapeHtml(output?.subtype||output?.primaryEffect||'Consumable')}</p>${output?.mechanicText?`<small class="mechanic-note">${escapeHtml(output.mechanicText)}</small>`:''}${(output?.grantedAbilities||[]).length?`<small class="mechanic-note"><strong>Grants:</strong> ${escapeHtml(output.grantedAbilities.map(a=>a.name).join(' · '))}</small>`:''}${compat}${set?`<details class="craft-set-details"><summary><span><strong>${escapeHtml(set.name)}</strong></span><small>Set effects</small></summary><div class="craft-set-bonus-text">${escapeHtml(setBonusText(set))}</div></details>`:''}<small class="craft-material-cost">${escapeHtml(materialCostText(ingredients,run,crafting))}</small><div class="craft-card-actions"><button data-action="campsite-craft" data-recipe="${escapeHtml(recipe.id)}" ${craftable?'':'disabled'}>Craft</button><button class="secondary craft-hide-button" data-action="craft-hide-recipe" data-recipe="${escapeHtml(recipe.id)}">${hidden?'Unhide':'Hide'}</button></div></article>`;}).join('')}</div>`:`<div class="empty-state">No ${escapeHtml(cat.toLowerCase())} match the active filters${!showHidden&&currentHidden?' or some recipes are hidden':''}. The category remains visible so zero-result filters are explicit.</div>`}</details>`;}).join('');
 return `<section class="crafting-owner campsite-crafting-panel"><div class="workspace-panel-head"><div><div class="kicker">Cumulative Regional Crafting · Campsite Only</div><h4>Craft Equipment & Food</h4><p class="muted">Recipes and materials from every region you have reached remain usable at later campsites. Hide recipes you do not want to see; hidden choices are saved account-wide. This crafting pane scrolls independently on desktop.</p></div><span class="workspace-scroll-hint">Scrollable</span></div>${ui.message?`<div class="notice campsite-workspace-notice">${escapeHtml(ui.message)}</div>`:''}<div class="crafting-scroll-region" data-campsite-crafting-scroll>${recommendTools}${recipeTools}${controls}${body}</div></section>`;
}
function campsiteLoadout(run,catalog,crafting,craftingUi,presentationUi={}){
 const eqIdx=equipmentCatalogueIndex(catalog),conIdx=itemIndex(catalog,'consumables'),sets=setIndex(catalog);const requested=presentationUi.equipmentOwnerId||'vessel';const owner=equipmentOwnerState(run,requested)||equipmentOwnerState(run,'vessel');const ownerId=owner?.id||'vessel';const eq=owner?.equipment||{};const inventory=equipmentInventoryEntries(run,catalog);const cap=getRunConsumableCapacity(run);const con=Array.from({length:cap},(_,i)=>run.configuration?.consumables?.[i]||null);const conInv=Object.entries(run.inventory?.consumables||{}).filter(([,v])=>Number(v?.quantity||0)>0);const slots=[['mainHand','Main Hand'],['offHand','Off Hand'],['accessory','Accessory'],['helmet','Helmet'],['chest','Chest Armor'],['boots','Boots'],['gloves','Gloves'],['charm1','Charm 1'],['charm2','Charm 2'],['abilityItem','Ability Item']];
 const sidebarOpen=presentationUi.campsiteSidebarOpen!==false,sidebarTab=presentationUi.campsiteSidebarTab==='inventory'?'inventory':'party',itemsOpen=presentationUi.campsiteItemsOpen!==false;
 const owners=[{id:'vessel',name:run.party?.find(p=>p.id==='vessel')?.name||'Vessel',baseClass:run.configuration?.effectiveBaseClass||run.configuration?.permanentBaseClass||'Classless'},...Object.values(run.adventurers||{}).map(a=>({id:a.id,name:a.name,baseClass:a.baseClass||'Adventurer'}))];
 const ownerTabs=owners.map(o=>`<button class="campsite-party-member ${o.id===ownerId?'active':''}" data-action="campsite-equipment-owner" data-owner="${escapeHtml(o.id)}"><strong>${escapeHtml(o.name)}</strong><small>${escapeHtml(o.baseClass)}</small></button>`).join('');
 const eqRows=slots.map(([key,label])=>{const cur=eqIdx.get(typeof eq[key]==='string'?eq[key]:eq[key]?.id);const set=cur?.setId?sets.get(cur.setId):null;return `<div class="loadout-row"><div><strong>${label}</strong><small>${cur?`${escapeHtml(cur.name)} · ${escapeHtml(cur.rarity||'Normal')}`:'Empty'}</small>${cur?`${cur.modifier==='Legacy'?'<span class="legacy-modifier-badge">Legacy</span>':''}<span class="item-type-tag">${escapeHtml(itemTypeTag(cur))}</span><span>${escapeHtml(listedStatsText(cur))}</span>${cur.mechanicText?`<span>${escapeHtml(cur.mechanicText)}</span>`:''}`:''}${set?`<span>${escapeHtml(set.name)}</span>`:''}</div>${cur?`<button class="secondary" data-action="campsite-unequip-equipment" data-owner="${escapeHtml(ownerId)}" data-slot="${key}">Unequip</button>`:''}</div>`;}).join('');
 const eqChoices=inventory.length?inventory.map(({id,quantity,equippedCount,item})=>{const legal=legalEquipmentSlots(item);const set=item.setId?sets.get(item.setId):null;const currentSlots=Object.entries(eq).filter(([,v])=>(typeof v==='string'?v:v?.id)===id).map(([k])=>k);const freeCopies=Math.max(0,quantity-equippedCount);const dualEligible=item.itemType==='Weapon'&&item.handedness==='one-handed'&&item.offHandCompatible===true;const actions=legal.map(slot=>{const here=currentSlots.includes(slot);let label='Equip',disabled=false;if(here){label=`Equipped: ${equipmentSlotLabel(slot)}`;disabled=true;}else if(currentSlots.length){if(dualEligible&&freeCopies>0&&['mainHand','offHand'].includes(slot)&&currentSlots.some(k=>['mainHand','offHand'].includes(k)))label=`Equip second copy: ${equipmentSlotLabel(slot)}`;else label=`Move to ${equipmentSlotLabel(slot)}`;}else if(freeCopies<=0){label='Equipped by Party';disabled=true;}else if(item.slot==='charm')label=`Equip ${equipmentSlotLabel(slot)}`;return `<button data-action="campsite-equip-equipment" data-owner="${escapeHtml(ownerId)}" data-item="${escapeHtml(id)}" data-slot="${slot}" ${disabled?'disabled':''}>${escapeHtml(label)}</button>`;}).join('');const discard=`<button class="danger campsite-discard-button" data-action="campsite-discard-equipment" data-item="${escapeHtml(id)}" data-item-name="${escapeHtml(item.name)}" ${freeCopies>0?'':'disabled'}>${freeCopies>0?'Discard 1':'All Copies Equipped'}</button>`;return `<article class="kept-card ${currentSlots.length?'equipped':''}"><div class="kept-card-title"><div><strong>${escapeHtml(item.name)}</strong>${item.modifier==='Legacy'?'<span class="legacy-modifier-badge">Legacy</span>':''}<span class="item-type-tag">${escapeHtml(itemTypeTag(item))}</span></div><span>${quantity} carried · ${equippedCount} equipped</span></div><p>${escapeHtml(listedStatsText(item))}</p>${item.mechanicText?`<small class="mechanic-note">${escapeHtml(item.mechanicText)}</small>`:''}${(item.grantedAbilities||[]).length?`<small class="mechanic-note"><strong>Grants:</strong> ${escapeHtml(item.grantedAbilities.map(a=>a.name).join(' · '))}</small>`:''}${item.itemType==='Weapon'?`<small class="compatibility-note">${escapeHtml(weaponCompatibilityText(item,owner?.baseClass))}</small>`:''}${dualEligible&&quantity>=2?'<small class="mechanic-note">Two carried copies may be equipped together in Main Hand and Off Hand.</small>':''}${set?`<small>${escapeHtml(set.name)} · ${escapeHtml(setBonusText(set))}</small>`:''}<div class="combat-actions">${actions}${discard}</div></article>`;}).join(''):'<p class="muted">No carried equipment items are available yet.</p>';
 const conRows=con.map((id,i)=>{const item=conIdx.get(id);return `<div class="loadout-row"><div><strong>Consumable ${i+1}</strong><small>${item?escapeHtml(item.name):'Empty'}</small></div>${id?`<button class="secondary" data-action="campsite-unequip-consumable" data-slot="${i+1}">Unequip</button>`:''}</div>`;}).join('');
 const conChoices=conInv.length?conInv.map(([id,v])=>{const item=conIdx.get(id);if(!item)return '';const quantity=Number(v.quantity),equippedCount=con.filter(x=>x===id).length,freeCopies=Math.max(0,quantity-equippedCount);return `<article class="kept-card"><div class="kept-card-title"><div><strong>${escapeHtml(item.name)}</strong><span class="item-type-tag">Consumable · ${escapeHtml(item.subtype||'Item')}</span></div><span>${quantity} carried${equippedCount?` · ${equippedCount} equipped`:''}</span></div><p>${escapeHtml(item.primaryEffect||'effect')}</p><div class="combat-actions">${Array.from({length:cap},(_,i)=>`<button data-action="campsite-equip-consumable" data-item="${escapeHtml(id)}" data-slot="${i+1}">${con[i]===id?'Equipped':`Equip ${i+1}`}</button>`).join('')}<button class="danger campsite-discard-button" data-action="campsite-discard-consumable" data-item="${escapeHtml(id)}" data-item-name="${escapeHtml(item.name)}" ${freeCopies>0?'':'disabled'}>${freeCopies>0?'Discard 1':'Equipped Copy Protected'}</button></div></article>`;}).join(''):'<p class="muted">No carried consumables are available yet.</p>';
 const partyView=`<div class="campsite-sidebar-scroll" data-campsite-sidebar-scroll><div class="notice"><strong>${escapeHtml(owner?.name||'Vessel')}</strong> · ${escapeHtml(owner?.baseClass||run.configuration?.permanentBaseClass||'Classless')} equipment</div><div class="loadout-grid">${eqRows}</div>${ownerId==='vessel'?`<div class="campsite-subsection"><h5>Vessel Combat Consumable</h5><p class="muted">Tavern Adventurers do not use campaign consumables.</p><div class="loadout-grid">${conRows}</div></div>`:'<div class="notice campsite-subsection">Tavern Adventurers manage equipment here but do not use campaign consumables.</div>'}</div>`;
 const inventoryView=`<div class="campsite-sidebar-scroll" data-campsite-sidebar-scroll><div class="notice campsite-inventory-discard-note">Discard removes one unequipped carried copy permanently from this campaign. Equipped copies are protected until you unequip them.</div><section class="campsite-items-section ${itemsOpen?'':'is-collapsed'}"><div class="campsite-subsection-head"><div><h5>Items</h5><small>${inventory.length} carried equipment type${inventory.length===1?'':'s'}</small></div><button class="secondary campsite-mini-button" data-action="campsite-items-toggle">${itemsOpen?'Hide Items':'Show Items'}</button></div>${itemsOpen?`<div class="kept-grid campsite-inventory-grid">${eqChoices}</div>`:'<div class="notice">Equipment items are hidden. Your filters and selected party member remain unchanged.</div>'}</section><section class="campsite-subsection"><h5>Consumables</h5><div class="kept-grid campsite-inventory-grid">${conChoices}</div></section></div>`;
 const sidebar=sidebarOpen?`<aside class="campsite-sidebar"><div class="workspace-panel-head"><div><div class="kicker">Party & Inventory</div><h4>Campsite Loadout</h4></div><button class="secondary campsite-mini-button" data-action="campsite-sidebar-toggle">Hide</button></div><div class="campsite-party-members" aria-label="Party members">${ownerTabs}</div><div class="campsite-sidebar-tabs"><button class="${sidebarTab==='party'?'active':''}" data-action="campsite-sidebar-tab" data-tab="party">Party Loadout</button><button class="${sidebarTab==='inventory'?'active':''}" data-action="campsite-sidebar-tab" data-tab="inventory">Inventory</button></div>${sidebarTab==='inventory'?inventoryView:partyView}</aside>`:`<aside class="campsite-sidebar-closed"><button class="secondary" data-action="campsite-sidebar-toggle">Show Party & Inventory</button></aside>`;
 return `<div class="campsite-workspace ${sidebarOpen?'':'sidebar-collapsed'}">${sidebar}<div class="campsite-main-pane">${craftingPanel(run,crafting,catalog,craftingUi,{id:ownerId,name:owner?.name||'Vessel',baseClass:owner?.baseClass||null})}</div></div>`;
}

function combatBody(run, combat, baseAbilities, subclassAbilities, equipmentCatalog, presentationUi = {}, forestCrafting = null) {
  const party = (combat.actors || []).filter(actor => actor.side === 'party');
  const enemies = (combat.actors || []).filter(actor => actor.side === 'enemy');
  const current = (combat.actors || []).find(actor => actor.id === combat.currentActorId) || null;
  const turn = combat.turn || null;
  const playerTurn = current?.control === 'player';
  const actionTaken = Boolean(turn?.actionTaken);
  const panel = presentationUi.actionPanel || 'abilities';
  const settings = presentationUi.settings || {};
  const speed = Math.max(.1, Math.min(4, Number(settings.combatSpeed || 1)));
  const autoEndTurn = settings.autoEndTurn !== false;
  const reducedMotion = Boolean(settings.reducedMotion);
  const showNumbers = settings.combatNumbers !== false;
  const flash = ['off','low','standard'].includes(settings.screenFlash) ? settings.screenFlash : 'standard';
  const presentation = latestCombatPresentation(combat,{consumedPresentationId:presentationUi.consumedPresentationId||null});
  const scene = regionalBattleScene(run);
  const special = run.expedition?.encounter || {};
  const statCheckDetails=(special.source==='stat-check-followup'||special.source==='checkmark-followup')?special.triggeredByDetails:null;
  const statCheckLeadIn=statCheckDetails?`<div class="notice stat-check-combat-notice"><div class="kicker">Stat Check Resolved · Combat Follows</div><strong>${escapeHtml(statCheckDetails.criticalSuccess?'Critical Success':statCheckDetails.criticalFailure?'Critical Failure':statCheckDetails.outcome==='success'?'Success':'Failure')} · ${escapeHtml(statCheckDetails.stat||'Stat')} ${Number(statCheckDetails.total||0)} vs DC ${Number(statCheckDetails.dc||0)}</strong>${eventEffectSummary(statCheckDetails,forestCrafting,equipmentCatalog)}<p class="muted">The check result was applied before this battle. Winning this combat advances the expedition from Depth ${Number(special.triggeredByDepth||statCheckDetails.depth||run.expedition?.depth||1)} to the next Depth before the mandatory campsite.</p></div>`:'';
  const initiative = initiativeView(combat);
  const targetableIds = new Set(playerTurn && !actionTaken ? (combat.actors || []).filter(actor => Number(actor.resources?.hp || 0) > 0).map(actor => actor.id) : []);
  const abilityNames = new Map([...(baseAbilities?.abilities || []), ...(subclassAbilities?.abilities || [])].map(ability => [ability.id, ability.name]));
  const itemNames = new Map([...(equipmentCatalog?.consumables || []), ...(equipmentCatalog?.equipment || [])].map(item => [item.id, item.name]));
  const combatLog = summarizeCombatLog(combat, abilityNames, itemNames);
  const featureEnemyId = special.boss || special.miniboss || special.source === 'trainer' ? enemies[0]?.id : null;
  const featureEnemy = featureEnemyId ? enemies.find(actor => actor.id === featureEnemyId) : null;
  const hasImpact = [...(presentation.feedback?.values?.() || [])].flat().some(item => ['damage','crit','block','shield-loss','dodge'].includes(item.kind));
  const accessibility = [reducedMotion ? 'reduced-motion' : '', showNumbers ? '' : 'hide-combat-numbers', `flash-${flash}`, hasImpact ? 'has-impact' : ''].filter(Boolean).join(' ');
  const partyBattleSide = renderBattleSide('Party', party, 'party', combat.currentActorId, { presentation, targetableIds, showNumbers, featureEnemyId: null });
  const enemyBattleSide = renderBattleSide('Enemies', enemies, 'enemy', combat.currentActorId, { presentation, targetableIds, showNumbers, featureEnemyId });
  const travelLane = battleActionLane(presentation);
  const playerControls = !playerTurn ? '' : (actionTaken ? `<div class="combat-command-bar completed"><button data-action="combat-end-turn">End Turn</button></div>` : (current?.keptState?.perId?.['KI-184']?.awaitingChoice ? keptCombatStartPrompt(current) : (current?.classState?.baseClass === 'Druid' && !current.classState?.form ? `<div class="notice"><strong>Choose Starting Form</strong><div class="combat-actions"><button data-action="combat-druid-form" data-form="Fang">Fang</button><button data-action="combat-druid-form" data-form="Grove">Grove</button><button data-action="combat-druid-form" data-form="Bloom">Bloom</button></div></div>` : `
    <div class="combat-command-bar" aria-label="Combat actions">
      <button class="${panel==='abilities'?'active':''}" data-action="combat-panel" data-panel="abilities"><span>Abilities</span><small>Use Ability · Base / Subclass / Kept</small></button>
      <button data-action="combat-charge"><span>Charge</span><small>+1 Energy</small></button>
      <button data-action="combat-guard"><span>Guard</span><small>Guaranteed Block</small></button>
      <button class="${panel==='consumable'?'active':''}" data-action="combat-panel" data-panel="consumable"><span>Consumable</span><small>Use Consumable · one this battle</small></button>
    </div>
    <div class="combat-action-drawer">
      ${panel === 'consumable' ? combatConsumablePanel(run, combat, current, equipmentCatalog) : `${racialAbilityPanel(combat,current)}${abilityPanel(combat,current,baseAbilities)}${subclassAbilityPanel(combat,current,subclassAbilities)}${equipmentAbilityPanel(combat,current)}${keptActivePanel(combat,current)}`}
    </div>`)));
  const turnOrderHtml=`<div class="initiative-strip" aria-label="Initiative order">${initiative.map((entry,index)=>`<div class="initiative-token ${entry.current?'current':''} ${entry.passed?'passed':''} ${entry.defeated?'defeated':''}" data-side="${escapeHtml(entry.side)}"><span>${escapeHtml(String(entry.name).slice(0,1).toUpperCase())}</span><small>${entry.current?'NOW':entry.passed?'DONE':`#${index+1}`}</small><strong>${escapeHtml(entry.name)}</strong></div>`).join('')}</div>`;
  const commandHtml=combat.state==='complete'?`<div class="notice combat-outcome-notice"><strong>${escapeHtml(combat.outcome||'Combat complete')}</strong><span>The encounter is resolving.</span></div>`:(playerTurn?playerControls:'<div class="notice ai-turn-notice">The current combatant is resolving its action.</div>');
  const battleHtml=`<div class="battle-scene scene-${escapeHtml(scene)} ${featureEnemyId?'special-battle':''}" aria-label="Fixed combat battlefield — perspective 2.5D presentation"><div class="scene-backdrop" aria-hidden="true"></div><div class="scene-midground" aria-hidden="true"></div><div class="scene-foreground" aria-hidden="true"></div><div class="scene-atmosphere" aria-hidden="true"></div>${featureEnemy?`<div class="boss-battle-banner"><div><span>${special.boss?'REGION BOSS':special.miniboss?'MINIBOSS':'FOREST TRAINER'}</span><strong>${escapeHtml(featureEnemy.name)}</strong></div><div class="boss-hp-track"><i style="width:${hpPercent(featureEnemy).toFixed(2)}%"></i><b>${showNumbers?`${Math.round(Number(featureEnemy.resources?.hp||0))} / ${Math.round(Number(featureEnemy.resources?.maxHp||0))} HP`:`${Math.round(hpPercent(featureEnemy))}% HP`}</b></div></div>`:''}<div class="battle-ground" aria-hidden="true"><span></span></div>${travelLane}${partyBattleSide}<div class="battlefield-center" aria-hidden="true"><span>VS</span></div>${enemyBattleSide}<div class="impact-flash" aria-hidden="true"></div></div>`;
  return `${statCheckLeadIn}<div class="combat-foundation combat-presentation ${accessibility}" style="--combat-speed:${speed}" data-scene="${escapeHtml(scene)}" data-presentation-id="${escapeHtml(presentation.presentationId||'')}" data-semantic-action="${escapeHtml(presentation.semanticAction||'')}"><div class="combat-layout"><aside class="combat-left-sidebar"><div class="combat-head combat-hud-top"><div><div class="kicker">Combat · Round ${Number(combat.round||1)}</div><h3>${current?`${escapeHtml(current.name)}'s Turn`:'Battle'}</h3><div class="muted">Fixed battlefield · action-only motion</div></div><div class="combat-efficiency-controls"><label class="combat-speed-control"><span>Combat Speed</span><select data-setting="combatSpeed" aria-label="Combat speed">${[.1,.25,.5,.75,1,1.25,1.5,1.75,2,3,4].map(v=>`<option value="${v}" ${Number(v)===speed?'selected':''}>${v}×</option>`).join('')}</select></label><label class="combat-auto-end-control"><span>Auto End</span><input type="checkbox" data-setting="autoEndTurn" aria-label="Auto end player turn after action" ${autoEndTurn?'checked':''}></label></div></div>${commandHtml}</aside><main class="combat-center-stage">${battleHtml}</main><aside class="combat-right-sidebar"><section class="combat-turn-order-panel"><div class="kicker">Turn Order</div>${turnOrderHtml}</section><details class="combat-log-panel" open><summary>Combat Log <span>${combatLog.length} detailed entries · newest first</span></summary><div class="combat-log-lines" tabindex="0" aria-label="Scrollable detailed combat log">${combatLog.length?combatLog.map(line=>`<div>${escapeHtml(line)}</div>`).join(''):'<div class="muted">Combat events will appear here.</div>'}</div></details></aside></div></div>`;
}

function eventEffectSummary(details={},forestCrafting,equipmentCatalog){const mats=new Map((forestCrafting?.materials||[]).map(m=>[m.id,m.name]));const foods=new Map((equipmentCatalog?.consumables||[]).map(c=>[c.id,c.name]));const bits=[];for(const applied of details.applied||[]){if(applied.onyx)bits.push(`+${applied.onyx} Onyx`);if(applied.onyxLost)bits.push(`−${applied.onyxLost} Onyx`);if(applied.chronicleProgress)bits.push(`+${Number(applied.chronicleProgress).toFixed(2).replace(/\.00$/,'')} Chronicle Progress`);if(applied.material)bits.push(`+${applied.material.quantity} ${mats.get(applied.material.id)||applied.material.id}`);for(const material of applied.materials||[])bits.push(`+${material.quantity} ${mats.get(material.id)||material.id}`);if(applied.food)bits.push(`+${applied.food.quantity} ${foods.get(applied.food.id)||applied.food.id}`);if(applied.hpChange)bits.push(`${applied.hpChange>0?'+':''}${applied.hpChange} HP`);if(applied.flag)bits.push('A persistent expedition effect was applied.');}return `<div class="event-reward-summary"><strong>Applied result</strong>${bits.length?`<ul>${bits.map(b=>`<li>${escapeHtml(b)}</li>`).join('')}</ul>`:'<p>No inventory or HP change was attached to this outcome.</p>'}</div>`;}

function expeditionBody(run, baseAbilities, subclassAbilities, equipmentCatalog, forestCrafting, craftingUi, presentationUi = {}, contentPortraits = null) {
  const expedition = run.expedition;
  const intro = expedition.depth >= Number(expedition.introductoryBand?.start || 1)
    && expedition.depth <= Number(expedition.introductoryBand?.end || 5);
  if (expedition.state === 'choosing-event') {
    return `
      <div class="expedition-heading-row">
        <div><h3>Choose a Route</h3><p class="muted">Exactly three possible events have been drawn for this Depth. Choosing one locks the route until its encounter is resolved.</p></div>
        ${intro ? '<span class="depth-badge">Introductory Depth</span>' : ''}
      </div>
      ${eventCards(expedition,contentPortraits)}`;
  }

  if (expedition.state === 'combat-pending') {
    if (run.combat) return combatBody(run, run.combat, baseAbilities, subclassAbilities, equipmentCatalog, presentationUi, forestCrafting);
    const card = selectedCard(expedition);
    const checkFollowup=expedition.encounter?.source==='stat-check-followup'||expedition.encounter?.source==='checkmark-followup';
    const source = checkFollowup?'The completed stat check has immediately triggered a regional battle. Its rewards and penalties were already applied.':'The chosen route has become a battle.';
    return `
      <div class="encounter-lock">
        <div class="kicker">Combat Encounter</div>
        <h3>${card ? escapeHtml(card.label) : 'Random Combat'}</h3>
        <p class="muted">${escapeHtml(source)} This encounter is permanently attached to Depth ${expedition.depth} until combat resolves it.</p>
      </div>`;
  }

  if (expedition.state === 'hell-merchant') {
    const broker=forestCrafting?.merchant; const bought=new Set(expedition.hellMerchantPurchases||[]); const eq=new Map((equipmentCatalog?.equipment||[]).map(x=>[x.id,x]));
    const stock=(broker?.items||[]).map(entry=>{const item=eq.get(entry.itemId);const sold=bought.has(entry.itemId);return `<article class="craft-card ${sold?'locked':'craftable'}"><div class="kept-card-title"><div><strong>${escapeHtml(item?.name||entry.itemId)}</strong><span class="item-type-tag">${escapeHtml(itemTypeTag(item||{}))}</span></div><span>${Math.round(Number(entry.onyxCost||0))} Onyx</span></div><p>${escapeHtml(listedStatsText(item||{}))}</p>${item?.passiveDescription?`<small class="mechanic-note">${escapeHtml(item.passiveDescription)}</small>`:''}<button data-action="hell-merchant-buy" data-item="${escapeHtml(entry.itemId)}" ${sold?'disabled':''}>${sold?'Purchased':'Buy'}</button></article>`;}).join('');
    return `<div class="encounter-lock infernal-broker"><div class="kicker">Neutral Demon Merchant</div><h3>${escapeHtml(broker?.name||'Infernal Broker')}</h3><p>A courteous demon sits behind a black-iron counter where no shop should exist. His prices are written only in Onyx.</p><div class="notice"><strong>Carried Onyx:</strong> ${Math.round(Number(run?.rewards?.carriedOnyx||0))}</div><p class="muted">The merchandise has almost no ordinary stat weight, but each piece carries an unusually powerful passive effect.</p><div class="craft-grid section">${stock}</div><button class="secondary" data-action="hell-merchant-leave">Leave the Broker</button></div>`;
  }

  if (expedition.state === 'noncombat-pending') {
    const card = selectedCard(expedition);
    if (card?.trainer) {
      return `
        <div class="encounter-lock">
          <div class="kicker">${escapeHtml(expedition.regionName)} Trainer</div>
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
        <div class="kicker">${escapeHtml(card?.kind==='landmark'?'Landmark':card?.kind==='helpful-person'?'Helpful Person':card?.kind==='discovery'?'Discovery':`${expedition.regionName || 'Regional'} Event`)}</div>
        <h3>${escapeHtml(card?.label || 'Noncombat Event')}</h3>
        <p>${escapeHtml(card?.description || '')}</p>
        <div class="notice"><strong>${escapeHtml(card?.check?.stat || '')} check</strong> · DC ${Math.round(Number(card?.check?.dc||0))}${best?` · Best current chance ${best.successChancePct}%`:''}</div>
        <label class="section"><span>Choose one living real party member</span><select data-forest-check-participant>${options}</select></label>
        <p class="muted">Roll: d20 + floor(relevant stat ÷ 2) + specialization modifier. A natural 20 is a Critical Success. A natural 1 only critically fails if the final total still misses the DC, so a sufficiently specialized character can reach a true 100% chance.</p>
        <p class="muted">After the roll resolves, its rewards or penalties are applied immediately and a normal regional combat begins at this same Depth. Winning that battle advances the expedition to the next Depth.</p>
        <button data-action="forest-event-roll">Attempt Check</button>
      </div>`;
  }

  if (expedition.state === 'event-result') {
    const d=expedition.lastEventResult||[...(expedition.history||[])].at(-1)?.resolution?.details||{};const label=d.criticalSuccess?'Critical Success':d.criticalFailure?'Critical Failure':d.outcome==='success'?'Success':'Failure';
    return `<div class="encounter-lock event-result-card"><div class="kicker">${escapeHtml(expedition.regionName || 'Regional')} Check Result</div><h3>${label}</h3><div class="notice"><strong>${escapeHtml(d.stat||'Check')}</strong> · Roll ${Number(d.roll||0)} + ${Number(d.modifier||0)} = ${Number(d.total||0)} vs DC ${Number(d.dc||0)}</div>${eventEffectSummary(d,forestCrafting,equipmentCatalog)}<button class="primary" data-action="forest-event-continue-combat">Begin Follow-Up Combat</button></div>`;
  }

  if (expedition.state === 'campsite') {
    const finalPreparation=Boolean(expedition.campsite?.finalPreparation),statCheckCamp=Boolean(expedition.campsite?.statCheckFollowup);
    return `
      <div class="campsite-owner">
        <div class="kicker">${finalPreparation?'Final Preparation · Full Heal':statCheckCamp?'Depth Advanced · Mandatory Campsite':'Mandatory Post-Battle Campsite'}</div>
        <h3>${finalPreparation?'The last camp waits beneath the Shadow Infused Dark Woods.':statCheckCamp?`The stat-check battle is won. The expedition is now at Depth ${Number(expedition.depth||1)}.`:'The party has stopped for camp.'}</h3>
        <p class="muted">${finalPreparation?'Every living real party member has been restored to full HP. There is no battle on Depth 1: adjust equipment, consumables, and crafting before confronting the cult leader on Depth 2.':statCheckCamp?'The battle already advanced the expedition by one Depth. Finish this mandatory campsite to continue at the current Depth; it will not advance a second time.':'The expedition cannot advance until the campsite is completed. Equipment and combat-consumable choices made here apply to the next battle.'}</p>
        ${campsiteLoadout(run,equipmentCatalog,forestCrafting,craftingUi,presentationUi)}
        <button class="expedition-continue-cta" data-action="expedition-leave-campsite"><span aria-hidden="true">➜</span><strong>${finalPreparation?'Enter the Shadow Infused Dark Woods':'Finish Campsite and Continue'}</strong><span aria-hidden="true">➜</span></button>
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
    const nextName=expedition.nextRegion?.name || (expedition.regionId==='heavenly-tower'?'Ruined Vampiric Plains':expedition.regionId==='ruined-vampiric-plains'?'Caverns to Hell':expedition.regionId==='caverns-to-hell'?"That Dragon’s Dungeon":expedition.regionId==='that-dragons-dungeon'?'Necropolis':expedition.regionId==='necropolis'?'Shadow Infused Dark Woods':'the next region');
    const clearedCopy=expedition.regionId==='forest'
      ?`The Heartwood Sovereign has fallen. Return safely and bank the campaign now, or carry every reward and every wound onward toward ${escapeHtml(nextName)}.`
      :expedition.regionId==='bog-of-lost-souls'
        ?`Mira and Bandit King Jack have fallen. The Bog is cleared. Return safely, or carry every reward and every wound upward into ${escapeHtml(nextName)}.`
        :expedition.regionId==='heavenly-tower'
          ?`The Divine Lich has exhausted all four lives and the Ascension Engine has opened its exterior descent. Return safely, or carry every reward and every wound onward toward ${escapeHtml(nextName)}.`
          :expedition.regionId==='ruined-vampiric-plains'
            ?`Tenairah and her Blood Roots have fallen. Her smoke canopy still stains the horizon, but the road beyond the ruined kingdom now descends toward ${escapeHtml(nextName)}. Return safely, or carry every reward and wound onward.`
            :expedition.regionId==='caverns-to-hell'
              ?`Serevakh has fallen and the Sevenfold Court lies silent. Beyond Hell, the path coils toward ${escapeHtml(nextName)}. Return safely, or carry every reward and wound onward.`
              :expedition.regionId==='that-dragons-dungeon'
                ?`Quentaliaus Devanpierus has finally accepted the party as worthy challengers—and fallen. His impossible hoard opens a death-cold road toward ${escapeHtml(nextName)}. Return safely, or carry every reward and wound onward.`
                :`The Ossuary King has fallen, but the cult leader is already fleeing with the Mirror. The chase enters ${escapeHtml(nextName)}. Return safely now, or follow immediately into the final region.`;
    return `
      <div class="region-boundary">
        <div class="kicker">Depth ${expedition.depth} / ${expedition.maxDepth}</div>
        <h3>${escapeHtml(expedition.regionName)} has reached its region boundary.</h3>
        <p class="muted">${clearedCopy}</p>
        <div class="button-row"><button class="primary" data-action="campaign-return-tavern">Return to the Tavern</button><button data-action="campaign-continue-beyond">Continue Beyond the Door</button></div>
      </div>`;
  }

  if (expedition.state === 'awaiting-next-region') {
    const nextName=run.regionTransition?.toRegionName || expedition.nextRegion?.name || 'The next region';
    return `<div class="region-boundary"><div class="kicker">Beyond the Door</div><h3>${escapeHtml(nextName)} lies ahead.</h3><p class="muted">This campaign remains active. Level, EXP, HP, equipment, materials, consumables, Tavern Adventurers, Exhaustion, Chronicle allocation, Mara quest state, and campaign records are all preserved at the transition.</p></div>`;
  }
  return '<p class="muted">The current expedition state is preserved.</p>';
}

function adventurerSheet(a,run,catalog,baseAbilities,subclassAbilities){const raw=combinedCharacterStats(a);const aggregate=aggregateEquipmentEffects(a.equipment||{},catalog,{baseClass:a.baseClass,classless:false});const core=aggregate.ok?applyEquipmentCoreStats(raw,aggregate):raw;const kept=applyKeptPreCombatStats(core,a.subclass,a.keptImpressions||[],a.keptImpressionChoices||{});const derived=baseDerivedStats(kept);const maxHp=Math.max(1,Math.round(10+Number(kept.CON||0)*2+Math.max(0,Number(a.level||1)-1)*3));const currentHp=Number.isFinite(Number(a.currentHp))?Math.max(0,Number(a.currentHp)):maxHp;const resource=resourceDefinition(a.baseClass);const abilities=[...(baseAbilities?.abilities||[]).filter(x=>x.baseClass===a.baseClass&&Number(x.level||1)<=Number(a.level||1)),...(subclassAbilities?.abilities||[]).filter(x=>x.subclass===a.subclass&&Number(x.level||1)<=Number(a.level||1))];const eqIdx=itemIndex(catalog,'equipment');const equipment=Object.entries(a.equipment||{}).map(([slot,id])=>`${equipmentSlotLabel(slot)}: ${eqIdx.get(typeof id==='string'?id:id?.id)?.name||'Empty'}`).join(' · ')||'No equipment';return `<details class="adventurer-sheet"><summary><strong>${escapeHtml(a.name)}</strong> Lv ${Number(a.level||1)} · ${Math.round(Number(a.exp||0))} EXP · ${escapeHtml(a.subclass||a.baseClass)}</summary><div class="inspection-body">${a.portrait?`<div class="adventurer-sheet-portrait">${portraitInnerMarkup({asset:a.portrait,alt:`Portrait of ${a.name}`,size:'full',loading:'lazy'})}</div>`:''}<p><strong>Role:</strong> ${escapeHtml(a.combatRole||'Tavern Adventurer')} · ${escapeHtml(a.race||'Unknown Race')} · ${escapeHtml(a.baseClass)}${a.subclass?` / ${escapeHtml(a.subclass)}`:''}</p><p><strong>HP:</strong> ${Math.round(currentHp)} / ${maxHp} · <strong>Exhaustion:</strong> ${Math.max(0,Math.trunc(Number(a.exhaustion||0)))}</p><p><strong>Core stats:</strong> ${escapeHtml(Object.entries(kept).map(([k,v])=>`${k} ${Math.round(Number(v||0))}`).join(' · '))}</p><p><strong>Derived combat stats:</strong> ${escapeHtml(formatDerivedStats(derived))}</p><p><strong>Class resource:</strong> ${escapeHtml(resource?`${resource.name} 0 / ${resource.max}`:'None')}</p><p><strong>Status effects:</strong> ${escapeHtml((a.statusEffects||[]).map(x=>x.name||x.id).join(', ')||'None between battles')}</p><p><strong>Equipment:</strong> ${escapeHtml(equipment)}</p><div><strong>Abilities</strong>${abilities.map(ab=>`<details class="ability-inspection compact"><summary>${escapeHtml(ab.name)}</summary><pre>${escapeHtml(readableAbilityText(ab))}</pre></details>`).join('')||'<p class="muted">No abilities unlocked yet.</p>'}</div></div></details>`;}


function partyStatMembers(run={}){
  const vessel={
    id:'vessel',name:run?.party?.find(p=>p.id==='vessel')?.name||'Otherworlder',kind:'Vessel',state:run.character||{},race:run.configuration?.race||'Unknown Race',baseClass:run.configuration?.effectiveBaseClass||run.configuration?.permanentBaseClass||'Classless',subclass:run.configuration?.classless?null:(run.configuration?.effectiveSubclass||null),classless:Boolean(run.configuration?.classless),equipment:run.configuration?.equipment||{},keptImpressions:run.configuration?.keptImpressions||[],keptChoices:run.configuration?.keptImpressionChoices||{},portrait:run.configuration?.portraitAsset||null,role:'Player-controlled Vessel'
  };
  const adventurers=Object.values(run?.adventurers||{}).map(a=>({id:a.id,name:a.name||a.id,kind:'Tavern Adventurer',state:a,race:a.race||'Unknown Race',baseClass:a.baseClass||'Unknown Class',subclass:a.subclass||null,classless:false,equipment:a.equipment||{},keptImpressions:a.keptImpressions||[],keptChoices:a.keptImpressionChoices||{},portrait:a.portrait||null,role:a.combatRole||'Tavern Adventurer'}));
  return [vessel,...adventurers];
}
function signedSheetValue(v,{pct=false}={}){const n=Number(v||0);return `${n>=0?'+':''}${Number.isInteger(n)?n:n.toFixed(1)}${pct?'%':''}`;}
function partyStatSheet(member,catalog,progression){
  if(!member)return '<div class="empty-state">That party member is not currently deployed.</div>';
  const state=member.state||{},raw=combinedCharacterStats(state),aggregate=aggregateEquipmentEffects(member.equipment||{},catalog,{baseClass:member.baseClass,classless:member.classless});
  const equipment=aggregate.ok?aggregate:{coreStats:{},modifiers:{},resistances:{},armorMitigationPct:0,initiativeBonus:0,startingShieldPctMax:0,setBonusesApplied:[],errors:aggregate.errors||[]};
  const equipped=aggregate.ok?applyEquipmentCoreStats(raw,equipment):raw;
  const finalCore=applyKeptPreCombatStats(equipped,member.subclass,member.keptImpressions||[],member.keptChoices||{});
  const derived=baseDerivedStats(finalCore),mods=equipment.modifiers||{},combatPreview={...derived};
  for(const [key,val] of Object.entries(mods))if(Number.isFinite(Number(val)))combatPreview[key]=Number(combatPreview[key]||0)+Number(val||0);
  combatPreview.blockChancePct=capBlockChance(combatPreview.blockChancePct);combatPreview.dodgeChancePct=capDodgeChance(combatPreview.dodgeChancePct);
  combatPreview.armorMitigationPct=Number(equipment.armorMitigationPct||0);
  combatPreview.initiativeBonus=Math.floor(Math.max(0,Number(state.level||1))/3)+Math.floor(Math.max(0,Number(finalCore.DEX||0))/9)+Number(equipment.initiativeBonus||0);
  const level=Math.max(1,Number(state.level||1));const maxHp=Math.max(1,Math.round(maxHpFor({level,con:Number(finalCore.CON||0),progression})*keptMaxHpMultiplier(member.keptImpressions||[])));const currentHp=Number.isFinite(Number(state.currentHp))?Math.max(0,Number(state.currentHp)):maxHp;
  const eqIdx=equipmentCatalogueIndex(catalog);const equippedRows=Object.entries(member.equipment||{}).filter(([,id])=>Boolean(id)).map(([slot,id])=>{const item=eqIdx.get(typeof id==='string'?id:id?.id);return `<div class="party-stat-equipment-row"><strong>${escapeHtml(equipmentSlotLabel(slot))}</strong><span>${escapeHtml(item?.name||String(id))}</span><small>${escapeHtml(item?formatListedStats(item):'Item details unavailable')}</small></div>`;}).join('')||'<div class="empty-state compact">No equipment equipped.</div>';
  const coreRows=['STR','DEX','CON','INT','FTH','CHA','LCK'].map(stat=>{const base=Number(raw[stat]||0),eq=Number(equipment.coreStats?.[stat]||0),other=Number(finalCore[stat]||0)-Number(equipped[stat]||0),total=Number(finalCore[stat]||0);return `<div class="party-core-stat"><span>${stat}</span><strong>${Number.isInteger(total)?total:total.toFixed(1)}</strong><small>Base/run ${Number.isInteger(base)?base:base.toFixed(1)}${eq?` · Equipment ${signedSheetValue(eq)}`:''}${other?` · Other ${signedSheetValue(other)}`:''}</small></div>`;}).join('');
  const resistances=Object.entries(equipment.resistances||{}).filter(([,v])=>Number(v)!==0);const setBonuses=(equipment.setBonusesApplied||[]).map(x=>`${x.setName||x.setId} (${x.pieces}-piece)`).join(' · ');
  const equipmentModifiers=Object.entries(mods).filter(([,v])=>Number(v)!==0).map(([k,v])=>`<span><strong>${escapeHtml(playerStatLabel(k))}</strong> ${escapeHtml(signedSheetValue(v,{pct:String(k).endsWith('Pct')}))}</span>`).join('');
  return `<div class="party-stat-sheet">${member.portrait?`<div class="party-stat-portrait">${portraitInnerMarkup({asset:member.portrait,alt:`Portrait of ${member.name}`,size:'full',loading:'lazy'})}</div>`:''}<div class="party-stat-heading"><div class="kicker">${escapeHtml(member.kind)}</div><h4>${escapeHtml(member.name)}</h4><p>${escapeHtml(member.race)} · ${escapeHtml(member.classless?'Classless':member.baseClass)}${member.subclass?` / ${escapeHtml(member.subclass)}`:''} · Level ${level}</p><p class="muted">${escapeHtml(member.role)} · ${Math.round(Number(state.exp||0))} EXP · HP ${Math.round(currentHp)} / ${maxHp} · Exhaustion ${Math.max(0,Math.trunc(Number(state.exhaustion||0)))}</p></div><section class="party-stat-block party-stat-full"><h5>Total Core Stats</h5><p class="muted">Totals include current run stats, equipped listed core stats, and pre-combat core-stat changes from Kept Impressions.</p><div class="party-core-grid">${coreRows}</div></section><section class="party-stat-block"><h5>Combat Stat Preview</h5><p class="muted">Core-derived values plus unconditional listed equipment modifiers. Conditional racial, class, subclass, Kept Impression, status, and encounter effects apply when their conditions are active.</p><div class="run-stat-strip party-derived-strip">${statLine(combatPreview)}</div></section><section class="party-stat-block"><h5>Equipment Bonuses</h5>${equipmentModifiers?`<div class="run-stat-strip">${equipmentModifiers}</div>`:'<p class="muted">No direct non-core equipment modifiers.</p>'}${resistances.length?`<div class="run-stat-strip section">${resistances.map(([type,val])=>`<span><strong>${escapeHtml(type)} Resistance</strong> ${escapeHtml(signedSheetValue(val,{pct:true}))}</span>`).join('')}</div>`:''}${Number(equipment.startingShieldPctMax||0)?`<p><strong>Starting Shield:</strong> ${Number(equipment.startingShieldPctMax||0)}% Maximum HP</p>`:''}${setBonuses?`<p><strong>Active set bonuses:</strong> ${escapeHtml(setBonuses)}</p>`:''}${!aggregate.ok?`<div class="notice notice-danger">Equipment validation: ${escapeHtml((aggregate.errors||[]).join(' · '))}</div>`:''}</section><section class="party-stat-block party-stat-full"><h5>Equipped Items</h5><div class="party-stat-equipment-list">${equippedRows}</div></section></div>`;
}
function partyStatsTabs(run,catalog,progression,selectedId='vessel'){
  const members=partyStatMembers(run);const selected=members.find(m=>m.id===selectedId)||members[0];
  return `<div class="party-stats-tabs" role="tablist" aria-label="Party stat sheets">${members.map(m=>`<button type="button" role="tab" aria-selected="${m.id===selected.id?'true':'false'}" class="party-stats-tab ${m.id===selected.id?'active':''}" data-action="run-stats-owner" data-owner="${escapeHtml(m.id)}"><strong>${escapeHtml(m.name)}</strong><small>${escapeHtml(m.id==='vessel'?'Player':m.subclass||m.baseClass)}</small></button>`).join('')}</div>${partyStatSheet(selected,catalog,progression)}`;
}

function materialInventory(run) {
  const entries = Object.entries(run?.inventory?.materials || {}).filter(([, item]) => Number(item?.quantity || 0) > 0);
  if (!entries.length) return '<p class="muted">No regional materials carried yet.</p>';
  return `<div class="run-stat-strip">${entries.map(([id, item]) => `<span><strong>${escapeHtml(item.name || id)}</strong> ${Math.round(Number(item.quantity || 0))}</span>`).join('')}</div>`;
}

export function renderCampaignRun({ run, baseAbilities, subclassAbilities, progression, equipmentCatalog, forestCrafting, forestTrainers, contentPortraits = null, maraQuestStatus = null, craftingUi, presentationUi = {} }) {
  const expedition = run.expedition;
  const progress = Math.max(0, Math.min(100, (Number(expedition.depth || 1) / Number(expedition.maxDepth || 30)) * 100));
  return shell(`
    <section class="campaign-run-hero panel ${run.configuration?.portraitAsset?'with-vessel-portrait':''}">
      ${run.configuration?.portraitAsset?`<div class="campaign-vessel-portrait">${portraitInnerMarkup({asset:run.configuration.portraitAsset,alt:'Selected Vessel portrait',size:'full'})}</div>`:''}
      <div><div class="kicker">Beyond the Door</div><h2>${escapeHtml(expedition.regionName)} · Depth ${expedition.depth} / ${expedition.maxDepth}</h2><p class="muted">The expedition is preserved exactly when you leave this screen. No Depth, card, encounter, campsite, or combat turn advances while you are away.</p></div>
      <div class="run-level"><span>Character Level</span><strong>${run.character.level}</strong><small>${Math.round(Number(run.character.exp||0))} EXP · ${Math.round(expToNextLevel(run.character,progression))} to next</small></div>
    </section>
    <div class="depth-track" aria-label="${escapeHtml(expedition.regionName)} depth progress"><span style="width:${progress.toFixed(2)}%"></span></div>
    <section class="identity-grid section">
      <div><span>Path</span><strong>${run.configuration.classless ? 'Classless' : escapeHtml(run.configuration.effectiveBaseClass || '')}</strong></div>
      <div><span>Subclass</span><strong>${run.configuration.classless ? 'Suppressed' : escapeHtml(run.configuration.effectiveSubclass || 'None')}</strong></div>
      <div><span>Carried Onyx</span><strong>${Math.round(run.rewards.carriedOnyx || 0)}</strong></div>
      <div><span>Chronicle Progress Earned</span><strong>${Math.round(run.rewards.chronicleProgress || 0)}</strong></div>
      <div><span>Difficulty</span><strong>${escapeHtml(run.configuration?.difficulty || 'Normal')}</strong></div>
      ${expedition.regionId==='bog-of-lost-souls'?`<div><span>Haunted Fog Pressure</span><strong>${Math.max(0,Number(expedition.fogPressure||0))} / 3</strong></div>`:''}
      ${expedition.regionId==='ruined-vampiric-plains'?`<div><span>Blood Moon</span><strong>${Math.max(0,Math.min(100,Number(expedition.bloodMoon||0)))} / 100</strong></div><div><span>Blood Moon Peak</span><strong>${Math.max(0,Math.min(100,Number(expedition.bloodMoonMax||0)))}</strong></div>`:''}
    </section>
    ${maraQuestStatus?`<section class="panel section"><div class="kicker">Mara Quest</div><h3>${escapeHtml(maraQuestStatus.label)}</h3><div class="reward-row"><span>${escapeHtml(maraQuestStatus.status)}</span><strong>${Math.min(Number(maraQuestStatus.progress||0),Number(maraQuestStatus.target||1))} / ${Number(maraQuestStatus.target||1)}</strong></div>${maraQuestStatus.complete?'<p class="field-help">The objective is complete. Its Onyx and Chronicle reward is secured for settlement; the Onyx remains part of the carried campaign total until you return or are defeated.</p>':''}</section>`:''}
    <section class="panel section expedition-panel">
      ${expeditionBody(run, baseAbilities, subclassAbilities, equipmentCatalog, forestCrafting, craftingUi, presentationUi, contentPortraits)}
    </section>
    <section class="panel section">
      <h3>${escapeHtml(expedition.regionName)} Materials</h3>
      ${materialInventory(run)}
    </section>
    <section class="panel section run-progression-panel">
      <div class="section-title"><div><div class="kicker">Player + Adventurers</div><h3>Run Progression & Party Stats</h3></div></div>
      <p class="muted">Choose the Player Vessel or any deployed Tavern Adventurer to inspect their current totals, including equipped core stats, direct equipment modifiers, Resistances, armor mitigation, Initiative bonus, and equipped items.</p>
      <div class="section">${partyStatsTabs(run,equipmentCatalog,progression,presentationUi.statsOwnerId||'vessel')}</div>
      <section class="party-stat-allocation section"><h4>Player Run-earned Stat Allocation</h4><div class="run-stat-strip">${statLine(combinedCharacterStats(run.character))}</div><p class="muted section">Maximum HP uses 10 base + 2 per CON + 3 per Character Level gained. Level-earned Stat Points are run-only and disappear when this campaign ends.</p><div class="notice">${run.character.unspentLevelStatPoints} run-earned Stat Point${run.character.unspentLevelStatPoints === 1 ? '' : 's'} currently unspent.</div>${Number(run.character.unspentLevelStatPoints||0)>0 && !run.combat ? `<div class="combat-actions section">${['STR','DEX','CON','INT','FTH','CHA','LCK'].map(stat=>`<button data-action="run-stat-add" data-stat="${stat}">+1 ${stat}</button>`).join('')}</div>` : ''}</section>
      ${run.lastCombatReward?`<div class="notice section">Last battle: +${Math.round(run.lastCombatReward.exp||0)} EXP to each living real party member · +${Math.round(run.lastCombatReward.onyxAwarded||0)} Onyx · +${Number(run.lastCombatReward.chronicleProgress||0).toFixed(2).replace(/\.00$/,'')} Chronicle Progress.</div>`:''}
    </section>
    <div class="section"><button class="secondary" data-action="pause-campaign">Leave Campaign Screen</button></div>
  `, { back: false });
}
