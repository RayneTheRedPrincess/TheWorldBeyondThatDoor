import { escapeHtml, shell } from './shared.js';
import { TAVERN_ROOMS } from '../tavern-controller.js';
import { getCampaignDoorState } from '../campaign-door.js';
import { getEquippedKeptIds, getKeptSlotCost, KEPT_IMPRESSION_CAPACITY, isClasslessEquipped } from '../kept-impression-controller.js';
import { getMantleAvailability } from '../mantle-controller.js';
import { isProgressionFeatureUnlocked, PROGRESSION_FEATURES } from '../progression-features.js';
import { CORE_STATS, getStartingStatPool } from '../starting-stats.js';
import { classlessLimits } from '../classless-controller.js';
import { buildRecords } from '../tavern-services-controller.js';
import { tutorialTokenBalance, tutorialStatus } from '../tutorial-controller.js';

const TUTORIALS = [
  ['character-creation','Character Creation'],['tavern-lobby','Tavern Lobby'],['kept-impressions','Kept Impressions & Slot Costs'],['getting-adventurer','Getting a Tavern Adventurer'],
  ['building-team','Building a Team'],['starting-campaign','Starting a Campaign'],['forest-combat','Forest Expedition & Combat'],['campsite','Mandatory Post-Battle Campsite']
];

function roomDoor(room) {
  return `<button class="room-door" data-action="tavern-room" data-room="${room.id}"><span>${escapeHtml(room.name)}</span><small>Enter</small></button>`;
}

function mainHall(slot) {
  const c = slot.character;
  const doors = TAVERN_ROOMS.filter(room => room.id !== 'main-hall').map(roomDoor).join('');
  const door = getCampaignDoorState(slot);
  return `
    <section class="hall-hero panel">
      <div><div class="kicker">The Growing Refuge</div><h2>Main Hall</h2><p class="muted">The protected heart of the Tavern. Every corridor returns here, and the outside door waits along the central spine.</p></div>
      <div class="active-vessel"><span>Active Vessel</span><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.race)} · ${escapeHtml(c.baseClass)}</small></div>
    </section>
    <section class="section room-grid">${doors}</section>
    <section class="section outside-door panel">
      <div><div class="kicker">Beyond the Tavern</div><h3>Outside Door</h3><p class="muted">A newly bound Vessel may prepare to leave without first obtaining a Mantle or opening the Chronicle.${door.reason ? ` ${escapeHtml(door.reason)}` : ''}</p></div>
      <button class="primary" data-action="campaign-prep" ${door.available ? '' : 'disabled'}>${escapeHtml(door.label)}</button>
    </section>`;
}

function maraBar(slot, account, tavernServices, equipmentCatalog, message) {
  const mara=slot.tavernServices?.mara||{offers:[],activeQuest:null}; const active=mara.activeQuest;
  const questHtml=active?`<article class="service-card active-service"><h3>Active Quest</h3><strong>${escapeHtml(active.label)}</strong><p>${escapeHtml(active.description||'')}</p><div class="reward-row"><span>Reward</span><strong>${Number(active.reward?.onyx||0)} Onyx · ${Number(active.reward?.chronicleProgress||0)} Chronicle</strong></div><button class="secondary" data-action="mara-quest-abandon">Abandon Quest</button></article>`:`<div class="quest-offers">${(mara.offers||[]).map(q=>`<article class="service-card"><h3>${escapeHtml(q.label)}</h3><p>${escapeHtml(q.description||'')}</p><div class="reward-row"><span>Reward</span><strong>${Number(q.reward?.onyx||0)} Onyx · ${Number(q.reward?.chronicleProgress||0)} Chronicle</strong></div><button class="primary" data-action="mara-quest-accept" data-quest="${escapeHtml(q.instanceId)}">Accept</button></article>`).join('')}</div>`;
  const collected=new Set(slot.lender?.collection||[]), selected=slot.lender?.selectedItemId||null, items=(equipmentCatalog?.equipment||[]).filter(item=>!item.i12Fixture);
  const lender=`<div class="service-card lender-card"><h3>Lender Collection</h3><p>Each successful return may register exactly one item this Vessel brought home after having equipped it. Borrowing is free and never removes the remembered item.</p><div class="reward-row"><span>Collected</span><strong>${collected.size} / ${items.length}</strong></div><button class="secondary" data-action="lender-clear" ${selected?'':'disabled'}>Bring No Lender Item</button><div class="lender-grid section">${items.map(item=>{const owned=collected.has(item.id),active=selected===item.id;return `<button class="lender-item ${owned?'collected':'locked'} ${active?'selected':''}" data-action="lender-borrow" data-item="${escapeHtml(item.id)}" ${owned?'':'disabled'}><strong>${escapeHtml(item.name)}</strong><small>${owned?(active?'Selected for next campaign':'Available to borrow'):'Not yet brought home'}</small></button>`}).join('')}</div></div>`;
  return `<section class="panel room-panel"><div class="kicker">Mara</div><h2>Mara's Bar</h2><p class="muted">Mara keeps three expedition jobs ready and remembers the equipment this Vessel has deliberately brought back for future lending.</p>${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}<section class="section"><h3>Quest Board</h3><p class="muted">One active quest at a time. Offers change only after a completed campaign, and impossible objectives are removed before the board is dealt.</p>${questHtml}</section><section class="section"><h3>Lending</h3>${lender}</section></section>`;
}
function keptChoiceControl(entry, runtimeEntry, slot, account, tavernAdventurers) {
  const schema=runtimeEntry?.choice;if(!schema||schema.type==='combat-start-toggle')return '';
  const current=slot.loadout?.keptImpressionChoices?.[entry.id]?.[schema.key];
  if(schema.type==='single')return `<label class="kept-choice">Choice <select data-kept-choice data-ki="${escapeHtml(entry.id)}" data-choice-key="${escapeHtml(schema.key)}">${(schema.options||[]).map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
  if(schema.type==='multiple')return `<label class="kept-choice">Choose ${Number(schema.count||0)} <select multiple data-kept-choice data-ki="${escapeHtml(entry.id)}" data-choice-key="${escapeHtml(schema.key)}">${(schema.options||[]).map(v=>`<option value="${escapeHtml(v)}" ${Array.isArray(current)&&current.includes(v)?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label>`;
  if(schema.type==='party-ally'){
    const selected=new Set(slot.party?.tavernAdventurerIds||[]), entries=tavernAdventurers?.entries||[];
    const allies=[{id:'vessel',name:slot.character?.name||'Otherworlder'},...entries.filter(a=>selected.has(a.id)).map(a=>({id:a.id,name:a.name}))];
    return `<label class="kept-choice">Linked Ally <select data-kept-choice data-ki="${escapeHtml(entry.id)}" data-choice-key="${escapeHtml(schema.key)}">${allies.map(a=>`<option value="${escapeHtml(a.id)}" ${current===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('')}</select></label>`;
  }
  return '';
}
function keptCard(entry, equipped, runtimeEntry, slot, account, tavernAdventurers) {
  return `<article class="kept-card ${equipped ? 'equipped' : ''}">
    <div class="kept-card-title"><div><small>${escapeHtml(entry.id)}</small><strong>${escapeHtml(entry.name)}</strong></div><span>${entry.slots} slot${entry.slots === 1 ? '' : 's'}</span></div>
    <p>${escapeHtml(entry.mechanic || entry.canonical_text || '')}</p>
    ${equipped?keptChoiceControl(entry,runtimeEntry,slot,account,tavernAdventurers):''}
    <button class="${equipped ? 'secondary' : 'primary'}" data-action="${equipped ? 'kept-unequip' : 'kept-equip'}" data-ki="${entry.id}">${equipped ? 'Unequip' : 'Equip'}</button>
  </article>`;
}

function krassLibrary(slot, account, keptEntries, runtimeEntries, tavernAdventurers, message) {
  const owned = new Set(account.unlocks?.keptImpressions || []);
  const equippedIds = getEquippedKeptIds(slot);
  const equippedSet = new Set(equippedIds);
  const equipped = equippedIds.map(id => keptEntries.find(entry => entry.id === id)).filter(Boolean);
  const available = keptEntries.filter(entry => owned.has(entry.id) && !equippedSet.has(entry.id));
  const used = getKeptSlotCost(equippedIds, keptEntries);
  const chronicleOpen = isProgressionFeatureUnlocked(account, PROGRESSION_FEATURES.CHRONICLE);
  const runtimeIndex=new Map((runtimeEntries||[]).map(entry=>[entry.id,entry]));
  const tokenBalance=tutorialTokenBalance(account);
  const redeemable=keptEntries.filter(entry=>Number(entry.slots)<=3&&!owned.has(entry.id));
  const tokenPanel=tokenBalance>0?`<section class="section starter-token-panel"><h3>Free Kept Impression Tokens</h3><p>You have <strong>${tokenBalance}</strong> starter token${tokenBalance===1?'':'s'} remaining. Each can permanently keep one Impression costing 3 slots or less.</p><div class="kept-grid compact">${redeemable.map(entry=>`<article class="kept-card"><div class="kept-card-title"><div><small>${escapeHtml(entry.id)}</small><strong>${escapeHtml(entry.name)}</strong></div><span>${entry.slots} slot${entry.slots===1?'':'s'}</span></div><p>${escapeHtml(entry.mechanic||'')}</p><button class="primary" data-action="tutorial-token-redeem" data-ki="${escapeHtml(entry.id)}">Use Free Token</button></article>`).join('')}</div></section>`:'';
  return `<section class="panel room-panel library-panel">
    <div class="kicker">The Library of Kept Impressions</div><h2>Krass's Magical Library</h2>
    <p class="muted">Kept Impressions belong to the account; each Vessel chooses its own loadout. Normal capacity is exactly ${KEPT_IMPRESSION_CAPACITY} slots.</p>
    ${message ? `<div class="notice section">${escapeHtml(message)}</div>` : ''}
    <div class="capacity-bar section"><div><strong>${used} / ${KEPT_IMPRESSION_CAPACITY}</strong><span>slots used</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, used / KEPT_IMPRESSION_CAPACITY * 100)}%"></div></div></div>
    ${tokenPanel}
    <section class="section"><h3>Equipped</h3>${equipped.length ? `<div class="kept-grid">${equipped.map(entry => keptCard(entry, true, runtimeIndex.get(entry.id), slot, account, tavernAdventurers)).join('')}</div>` : '<div class="empty-state">No Kept Impressions are equipped.</div>'}</section>
    <section class="section"><h3>Kept by this account</h3>${available.length ? `<div class="kept-grid">${available.map(entry => keptCard(entry, false, runtimeIndex.get(entry.id), slot, account, tavernAdventurers)).join('')}</div>` : `<div class="empty-state">No additional Kept Impressions are currently available. The complete catalogue contains ${keptEntries.length} Impressions.</div>`}</section>
    <section class="section library-chronicle-link"><div><h3>Chronicle of Paths</h3><p class="muted">${chronicleOpen ? 'The Chronicle is open.' : 'The Chronicle has not opened yet. This does not prevent campaigns.'}</p></div><button class="secondary inline-button" data-action="chronicle">${chronicleOpen ? 'Open Chronicle' : 'View Chronicle'}</button></section>
  </section>`;
}

function mantleRoom(slot, account, subclassesForBase, message) {
  const c = slot.character;
  const state = getMantleAvailability({ slot, account, subclassesForBase });
  if (!state.available) return `<section class="panel room-panel"><div class="kicker">Mantle Room</div><h2>${escapeHtml(c.baseClass)} Mantles</h2><div class="empty-state">${escapeHtml(state.reason)}</div><p class="muted section">The Outside Door remains available without a Mantle.</p></section>`;
  const current = c.subclass || null;
  return `<section class="panel room-panel"><div class="kicker">Mantle Room</div><h2>${escapeHtml(c.baseClass)} Mantles</h2><p class="muted">Only already-unlocked subclasses from this Vessel's class family may be selected between campaigns.</p>
    ${message ? `<div class="notice section">${escapeHtml(message)}</div>` : ''}
    <div class="mantle-grid section"><button class="mantle-choice ${current === null ? 'selected' : ''}" data-action="mantle-select" data-subclass="">No Mantle</button>${state.unlockedChoices.map(name => `<button class="mantle-choice ${current === name ? 'selected' : ''}" data-action="mantle-select" data-subclass="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</div>
    ${state.unlockedChoices.length ? '' : '<div class="empty-state">No subclass Mantles from this class family have been unlocked yet.</div>'}
  </section>`;
}

function trainingChambers(account,message='') { return `<section class="panel room-panel"><div class="kicker">Training Chambers</div><h2>Tutorials & Training</h2><p class="muted">Eight optional lessons remain available for replay. Replays use isolated tutorial state and never grant additional starter rewards.</p>${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}<div class="tutorial-list section">${TUTORIALS.map(([id,name]) => `<button class="service-card tutorial-choice" data-action="tutorial-select" data-tutorial="${escapeHtml(id)}"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(tutorialStatus(account,id))} · Replay lesson</small></button>`).join('')}</div><button class="secondary section" data-action="help">Open Help Codex</button></section>`; }
function recordsRoom(slot,account,tavernAdventurers) { const r=buildRecords(account,slot,tavernAdventurers);const perf=r.notableCombat||{};return `<section class="panel room-panel"><div class="kicker">Trophy / Records Room</div><h2>Chronicle of Returns</h2><div class="identity-grid"><div><span>Campaigns</span><strong>${r.campaignsCompleted}</strong></div><div><span>Victories / Returns</span><strong>${r.victories}</strong></div><div><span>Defeats</span><strong>${r.defeats}</strong></div><div><span>Highest Forest Depth</span><strong>${r.highestForestDepth}</strong></div><div><span>Minibosses Defeated</span><strong>${r.minibossesDefeated}</strong></div><div><span>Bosses Defeated</span><strong>${r.bossesDefeated}</strong></div><div><span>Trainers Encountered</span><strong>${r.trainersEncountered.length}</strong></div><div><span>Trainers Fought / Learned</span><strong>${r.trainersFought.length} / ${r.trainersLearnedFrom.length}</strong></div><div><span>Subclasses Discovered</span><strong>${r.subclassesDiscovered}</strong></div><div><span>Adventurers Recruited</span><strong>${r.tavernAdventurersRecruited} / ${r.tavernAdventurerTotal}</strong></div></div><section class="section"><h3>Notable Combat Records</h3><div class="run-stat-strip"><span><strong>Damage Dealt</strong> ${Number(perf.mostDamageDealt?.value||0)}</span><span><strong>Damage Taken</strong> ${Number(perf.mostDamageTaken?.value||0)}</span><span><strong>Healing Done</strong> ${Number(perf.mostHealingDone?.value||0)}</span></div></section></section>`; }
function classlessConfiguration(slot, account, baseAbilities, subclassAbilities) {
  if (!isClasslessEquipped(slot)) return '';
  const rank = Number(account?.chronicle?.classless?.rank || 0), limits = classlessLimits(rank), config = slot.classlessConfig || {};
  const base = [...(baseAbilities?.abilities || [])].sort((a,b)=>a.baseClass.localeCompare(b.baseClass)||a.level-b.level||a.slot-b.slot);
  const sub = [...(subclassAbilities?.abilities || [])].sort((a,b)=>a.subclass.localeCompare(b.subclass)||a.level-b.level||a.slot-b.slot);
  const option = (value,label,selected) => `<option value="${escapeHtml(value)}" ${selected===value?'selected':''}>${escapeHtml(label)}</option>`;
  const baseSelect = i => `<label>Base Ability ${i+1}<select name="classless_base_${i}"><option value="">Unselected</option>${base.map(a=>option(a.id,`${a.baseClass} · ${a.name} · Lv ${a.level}`,config.baseAbilityIds?.[i])).join('')}</select></label>`;
  const subSelect = i => `<label>Subclass Ability ${i+1}<select name="classless_subclass_${i}"><option value="">Unselected</option>${sub.map(a=>option(a.id,`${a.subclass} · ${a.name} · Lv ${a.level}`,config.subclassAbilityIds?.[i])).join('')}</select></label>`;
  const baseClasses=[...new Set(base.map(a=>a.baseClass))].sort(), subclasses=[...new Set(sub.map(a=>a.subclass))].sort();
  const currentImprint=config.resourceImprint?.baseClass?`base:${config.resourceImprint.baseClass}`:config.resourceImprint?.subclass?`subclass:${config.resourceImprint.subclass}`:'';
  const imprint = limits.resourceImprint ? `<label>Resource Imprint<select name="classless_resource_imprint"><option value="">Unselected</option><optgroup label="Base-class resource systems">${baseClasses.map(x=>option(`base:${x}`,x,currentImprint)).join('')}</optgroup><optgroup label="Subclass resource systems">${subclasses.map(x=>option(`subclass:${x}`,x,currentImprint)).join('')}</optgroup></select></label>` : '<p class="muted">Resource Imprint unlocks at Classless Chronicle Rank 4.</p>';
  return `<form id="classless-config-form" class="section stat-panel"><div class="stat-panel-head"><div><div class="kicker">Classless Chronicle Rank ${rank}</div><h3>Classless Combat Selections</h3></div></div><p class="muted">Classless keeps only its unlocked selections. Selected abilities retain their normal Character Level requirements. Resource Imprint grants exactly that resource system, not its source passive.</p><div class="classless-config-grid">${Array.from({length:limits.base},(_,i)=>baseSelect(i)).join('')}${Array.from({length:limits.subclass},(_,i)=>subSelect(i)).join('')}${imprint}</div><div class="bind-actions section"><button type="submit" class="primary">Save Classless Selections</button></div></form>`;
}

function vesselRooms(slot, account, baseAbilities, subclassAbilities, message = '') {
  const c = slot.character; const classless = isClasslessEquipped(slot);
  const stats = c.startingStats || {};
  const storedPool = Number(c.startingStatPool || 0);
  const pool = Number.isInteger(storedPool) && storedPool > 0 ? storedPool : getStartingStatPool(c.race);
  return `<section class="panel room-panel"><div class="kicker">Vessel / Player Rooms</div><h2>${escapeHtml(c.name)}</h2>
    <div class="identity-grid"><div><span>Race</span><strong>${escapeHtml(c.race)}</strong></div><div><span>Bound Class</span><strong>${escapeHtml(c.baseClass)}</strong></div><div><span>Selected Mantle</span><strong>${escapeHtml(c.subclass || 'None')}</strong></div><div><span>Next Path</span><strong>${classless ? 'Classless' : escapeHtml(c.subclass || c.baseClass)}</strong></div></div>
    <p class="muted section">A bound Vessel keeps its race and base class until this slot is deleted.</p><div class="identity-grid section"><div><span>Known Subclasses</span><strong>${(account.unlocks?.subclasses||[]).length}</strong></div><div><span>Lender Collection</span><strong>${(slot.lender?.collection||[]).length}</strong></div><div><span>Campaign Records</span><strong>${(slot.history?.campaigns||[]).length}</strong></div><div><span>Borrowed Next Run</span><strong>${escapeHtml(slot.loadout?.borrowedItem?.name||'None')}</strong></div></div>
    ${message ? `<div class="notice section">${escapeHtml(message)}</div>` : ''}
    <form id="starting-stat-form" class="section stat-panel">
      <div class="stat-panel-head"><div><div class="kicker">Level 0 Setup</div><h3>Starting Stat Redistribution</h3></div><div class="stat-remaining"><strong data-stat-remaining>${pool}</strong><span>fixed total</span></div></div>
      <p class="muted">You may remove and re-add these starting points whenever you are between campaigns. The total is permanently fixed at ${pool} for this Vessel; run-earned Stat Points never enter this pool.</p>
      <div class="stat-allocation-grid">${CORE_STATS.map(stat => `<div class="stat-allocator-row"><strong>${stat}</strong><button type="button" class="stat-step" data-stat-step="-1" data-stat="${stat}">−</button><input class="stat-input" type="number" name="stat_${stat}" data-stat-input="${stat}" min="0" step="1" value="${Number(stats[stat] || 0)}" inputmode="numeric"/><button type="button" class="stat-step" data-stat-step="1" data-stat="${stat}">+</button></div>`).join('')}</div>
      <div class="bind-actions section"><button type="submit" class="primary">Save Redistribution</button></div>
    </form>
    ${classlessConfiguration(slot, account, baseAbilities, subclassAbilities)}
  </section>`;
}
function adventurerQuarters(slot, account, tavernAdventurers, tavernServices, message='') {
  const recruited=new Set(account.unlocks?.tavernAdventurers||[]), selected=new Set(slot.party?.tavernAdventurerIds||[]), entries=tavernAdventurers?.entries||[]; const recruitMap=new Map((tavernServices?.tavernAdventurerRecruitment?.remaining||[]).map(r=>[r.id,r.label]));
  return `<section class="panel room-panel"><div class="kicker">Tavern Adventurer Quarters</div><h2>Adventurer Quarters</h2><p class="muted">Tavern Adventurers act on their own in combat according to personality, class, subclass, and role. Up to three recruited Adventurers may deploy; they never use consumables.</p>${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}<div class="kept-grid section">${entries.map(a=>{const joined=recruited.has(a.id),active=selected.has(a.id);return `<article class="kept-card ${active?'equipped':''}"><div class="kept-card-title"><div><small>${escapeHtml(a.personality)} · ${escapeHtml(a.combatRole)}</small><strong>${escapeHtml(a.name)}</strong></div><span>${escapeHtml(a.baseClass)}</span></div><p>${escapeHtml(a.subclass)} · ${escapeHtml(a.priority)}</p>${joined?'':`<p class="field-help">Recruitment: ${escapeHtml(recruitMap.get(a.id)||'Available from Forest accomplishments')}</p>`}<button data-action="adventurer-toggle" data-adventurer="${escapeHtml(a.id)}" ${joined?'':'disabled'}>${active?'Remove from Party':joined?'Deploy':'Not Recruited'}</button></article>`}).join('')}</div><p class="muted section">Only Tavern Adventurers who have joined this account can be deployed.</p></section>`;
}

function roomContent(roomId, ctx) {
  if (roomId === 'mara-bar') return maraBar(ctx.slot,ctx.account,ctx.tavernServices,ctx.equipmentCatalog,ctx.message);
  if (roomId === 'krass-library') return krassLibrary(ctx.slot, ctx.account, ctx.keptEntries, ctx.keptRuntimeEntries, ctx.tavernAdventurers, ctx.message);
  if (roomId === 'mantle-room') return mantleRoom(ctx.slot, ctx.account, ctx.subclassesForBase, ctx.message);
  if (roomId === 'training-chambers') return trainingChambers(ctx.account,ctx.message);
  if (roomId === 'records-room') return recordsRoom(ctx.slot,ctx.account,ctx.tavernAdventurers);
  if (roomId === 'vessel-rooms') return vesselRooms(ctx.slot, ctx.account, ctx.baseAbilities, ctx.subclassAbilities, ctx.message);
  if (roomId === 'adventurer-quarters') return adventurerQuarters(ctx.slot, ctx.account, ctx.tavernAdventurers, ctx.tavernServices, ctx.message);
  return mainHall(ctx.slot);
}

export function renderTavern({ room, slot, account, subclassesForBase = [], keptEntries = [], keptRuntimeEntries = [], tavernAdventurers = null, tavernServices = null, equipmentCatalog = null, baseAbilities = null, subclassAbilities = null, message = '' }) {
  const inMain = room.id === 'main-hall';
  return shell(`${roomContent(room.id, { slot, account, subclassesForBase, keptEntries, keptRuntimeEntries, tavernAdventurers, tavernServices, equipmentCatalog, baseAbilities, subclassAbilities, message })}${inMain ? '' : '<div class="section"><button class="secondary" data-action="tavern-main-hall">Return to Main Hall</button></div>'}`, { back: inMain, backAction: 'leave-tavern', backLabel: 'Return Home' });
}
