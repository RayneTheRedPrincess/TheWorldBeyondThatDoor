import { escapeHtml, shell } from './shared.js';
import { portraitOptionsForBase, staticPortraitOptionsForSlot } from '../portrait-controller.js';
import { TAVERN_ROOMS } from '../tavern-controller.js';
import { getCampaignDoorState } from '../campaign-door.js';
import { getEquippedKeptIds, getKeptSlotCost, KEPT_IMPRESSION_CAPACITY, isClasslessEquipped } from '../kept-impression-controller.js';
import { getMantleAvailability } from '../mantle-controller.js';
import { isProgressionFeatureUnlocked, PROGRESSION_FEATURES } from '../progression-features.js';
import { CORE_STATS, getStartingStatPool } from '../starting-stats.js';
import { classlessLimits } from '../classless-controller.js';
import { buildRecords } from '../tavern-services-controller.js';
import { tutorialTokenBalance, tutorialStatus } from '../tutorial-controller.js';
import { formatListedStats, itemTypeTag, equipmentSlotLabel, weaponCompatibilityText } from '../player-facing.js';

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

function maraBar(slot, account, tavernServices, equipmentCatalog, message, ux={}) {
  const mara=slot.tavernServices?.mara||{offers:[],activeQuest:null}; const active=mara.activeQuest;
  const questHtml=active?`<article class="service-card active-service"><h3>Active Quest</h3><strong>${escapeHtml(active.label)}</strong><p>${escapeHtml(active.description||'')}</p><div class="reward-row"><span>Reward</span><strong>${Number(active.reward?.onyx||0)} Onyx · ${Number(active.reward?.chronicleProgress||0)} Chronicle</strong></div><button class="secondary" data-action="mara-quest-abandon">Abandon Quest</button></article>`:`<div class="quest-offers">${(mara.offers||[]).map(q=>`<article class="service-card"><h3>${escapeHtml(q.label)}</h3><p>${escapeHtml(q.description||'')}</p><div class="reward-row"><span>Reward</span><strong>${Number(q.reward?.onyx||0)} Onyx · ${Number(q.reward?.chronicleProgress||0)} Chronicle</strong></div><button class="primary" data-action="mara-quest-accept" data-quest="${escapeHtml(q.instanceId)}">Accept</button></article>`).join('')}</div>`;
  const collected=new Set(slot.lender?.collection||[]), selected=slot.lender?.selectedItemId||null;
  let items=(equipmentCatalog?.equipment||[]).filter(item=>!item.i12Fixture);
  const query=String(ux.lenderQuery||'').trim().toLowerCase(), slotFilter=ux.lenderSlot||'all', weaponFilter=ux.lenderWeaponType||'all', sort=ux.lenderSort||'name';
  if(query)items=items.filter(item=>`${item.name} ${item.itemType||''} ${item.weaponType||''} ${equipmentSlotLabel(item.slot)}`.toLowerCase().includes(query));
  if(slotFilter!=='all')items=items.filter(item=>item.slot===slotFilter);
  if(weaponFilter!=='all')items=items.filter(item=>(item.weaponType||'Non-weapon')===weaponFilter);
  items=[...items].sort((a,b)=>sort==='slot'?equipmentSlotLabel(a.slot).localeCompare(equipmentSlotLabel(b.slot))||a.name.localeCompare(b.name):sort==='type'?String(a.weaponType||a.itemType||'').localeCompare(String(b.weaponType||b.itemType||''))||a.name.localeCompare(b.name):a.name.localeCompare(b.name));
  const allItems=(equipmentCatalog?.equipment||[]).filter(item=>!item.i12Fixture), slots=[...new Set(allItems.map(x=>x.slot))].sort((a,b)=>equipmentSlotLabel(a).localeCompare(equipmentSlotLabel(b))), weaponTypes=[...new Set(allItems.map(x=>x.weaponType||'Non-weapon'))].sort();
  const filters=`<div class="catalog-controls"><label>Name search<input type="search" data-lender-search value="${escapeHtml(ux.lenderQuery||'')}" placeholder="Search lender collection…"></label><label>Equipment slot<select data-lender-slot><option value="all">All slots</option>${slots.map(v=>`<option value="${escapeHtml(v)}" ${slotFilter===v?'selected':''}>${escapeHtml(equipmentSlotLabel(v))}</option>`).join('')}</select></label><label>Item / weapon type<select data-lender-weapon-type><option value="all">All types</option>${weaponTypes.map(v=>`<option value="${escapeHtml(v)}" ${weaponFilter===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label><label>Sort<select data-lender-sort><option value="name" ${sort==='name'?'selected':''}>Name A–Z</option><option value="slot" ${sort==='slot'?'selected':''}>Equipment slot</option><option value="type" ${sort==='type'?'selected':''}>Item / weapon type</option></select></label></div>`;
  const cards=items.length?items.map(item=>{const owned=collected.has(item.id),active=selected===item.id;const statText=formatListedStats(item);const compat=item.itemType==='Weapon'?weaponCompatibilityText(item,slot.character?.baseClass):'';return `<article class="lender-item-card ${owned?'collected':'locked'} ${active?'selected':''}"><div class="kept-card-title"><div><strong>${escapeHtml(item.name)}</strong><span class="item-type-tag">${escapeHtml(itemTypeTag(item))}</span></div><small>${escapeHtml(equipmentSlotLabel(item.slot))}</small></div>${statText?`<p>${escapeHtml(statText)}</p>`:''}${compat?`<small class="compatibility-note">${escapeHtml(compat)}</small>`:''}<button data-action="lender-borrow" data-item="${escapeHtml(item.id)}" ${owned?'':'disabled'}>${owned?(active?'Selected for next campaign':'Borrow Next Campaign'):'Not yet brought home'}</button></article>`}).join(''):'<div class="empty-state">No lender items match these filters.</div>';
  const lender=`<div class="service-card lender-card"><h3>Lender Collection</h3><p>Each successful return may register exactly one item this Vessel brought home after having equipped it. Borrowing is free and never removes the remembered item.</p><div class="reward-row"><span>Collected</span><strong>${collected.size} / ${allItems.length}</strong></div><button class="secondary" data-action="lender-clear" ${selected?'':'disabled'}>Bring No Lender Item</button>${filters}<div class="lender-grid section">${cards}</div></div>`;
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
    ${(entry.tags||[]).length?`<div class="tag-row">${entry.tags.map(tag=>`<span class="mechanic-tag">${escapeHtml(tag)}</span>`).join('')}</div>`:''}
    ${equipped?keptChoiceControl(entry,runtimeEntry,slot,account,tavernAdventurers):''}
    <button class="${equipped ? 'secondary' : 'primary'}" data-action="${equipped ? 'kept-unequip' : 'kept-equip'}" data-ki="${entry.id}">${equipped ? 'Unequip' : 'Equip'}</button>
  </article>`;
}

function impressionCategory(entry){return entry.family?'Subclass-Specific':'Global';}
function krassLibrary(slot, account, keptEntries, runtimeEntries, tavernAdventurers, message, ux={}) {
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
  const tokenPanel=tokenBalance>0?`<section class="section starter-token-panel"><h3>Free Kept Impression Tokens</h3><p>You have <strong>${tokenBalance}</strong> starter token${tokenBalance===1?'':'s'} remaining. Each can permanently keep one Impression costing 3 slots or less.</p><div class="kept-grid compact">${redeemable.map(entry=>`<article class="kept-card"><div class="kept-card-title"><div><small>${escapeHtml(entry.id)}</small><strong>${escapeHtml(entry.name)}</strong></div><span>${entry.slots} slot${entry.slots===1?'':'s'}</span></div><p>${escapeHtml(entry.mechanic||entry.canonical_text||'')}</p><button class="primary" data-action="tutorial-token-redeem" data-ki="${escapeHtml(entry.id)}">Use Free Token</button></article>`).join('')}</div></section>`:'';
  const query=String(ux.libraryQuery||'').trim().toLowerCase(), slotFilter=String(ux.librarySlotCost||'all'), typeFilter=ux.libraryType||'all', familyFilter=ux.libraryFamily||'all', sort=ux.librarySort||'id', selectedTags=new Set(Array.isArray(ux.libraryTags)?ux.libraryTags:[]);
  let catalog=[...keptEntries];
  if(query)catalog=catalog.filter(entry=>`${entry.id} ${entry.name} ${entry.mechanic||entry.canonical_text||''} ${entry.subclass||''} ${entry.family||''} ${(entry.tags||[]).join(' ')}`.toLowerCase().includes(query));
  if(slotFilter!=='all')catalog=catalog.filter(entry=>Number(entry.slots)===Number(slotFilter));
  if(typeFilter!=='all')catalog=catalog.filter(entry=>impressionCategory(entry)===typeFilter);
  if(familyFilter!=='all')catalog=catalog.filter(entry=>(entry.family||'Global')===familyFilter);
  if(selectedTags.size)catalog=catalog.filter(entry=>[...selectedTags].every(tag=>(entry.tags||[]).includes(tag)));
  catalog.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='slots'?Number(a.slots)-Number(b.slots)||a.id.localeCompare(b.id):Number(a.id.slice(3))-Number(b.id.slice(3)));
  const slotCosts=[...new Set(keptEntries.map(e=>Number(e.slots)))].sort((a,b)=>a-b), families=[...new Set(keptEntries.filter(e=>e.family).map(e=>e.family))].sort(), tags=[...new Set(keptEntries.flatMap(e=>e.tags||[]))].sort();
  const controls=`<div class="catalog-controls"><label>Name / ID search<input type="search" data-library-search value="${escapeHtml(ux.libraryQuery||'')}" placeholder="Search names, IDs, mechanics…"></label><label>Slot cost<select data-library-slot><option value="all">All costs</option>${slotCosts.map(v=>`<option value="${v}" ${slotFilter===String(v)?'selected':''}>${v} slots</option>`).join('')}</select></label><label>Impression type<select data-library-type><option value="all">All types</option>${['Global','Subclass-Specific'].map(v=>`<option value="${v}" ${typeFilter===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Class family<select data-library-family><option value="all">All families</option><option value="Global" ${familyFilter==='Global'?'selected':''}>Global only</option>${families.map(v=>`<option value="${escapeHtml(v)}" ${familyFilter===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}</select></label><label>Sort<select data-library-sort><option value="id" ${sort==='id'?'selected':''}>KI number</option><option value="name" ${sort==='name'?'selected':''}>Name A–Z</option><option value="slots" ${sort==='slots'?'selected':''}>Slot cost</option></select></label></div>`;
  const tagControls=`<fieldset class="tag-filter-panel"><legend>Mechanic / Theme Tags <small>selected tags combine</small></legend><div class="tag-filter-grid">${tags.map(tag=>`<label class="tag-filter-chip"><input type="checkbox" data-library-tag value="${escapeHtml(tag)}" ${selectedTags.has(tag)?'checked':''}><span>${escapeHtml(tag)}</span></label>`).join('')}</div></fieldset>`;
  const catalogCards=catalog.length?catalog.map(entry=>{const status=equippedSet.has(entry.id)?'Equipped':owned.has(entry.id)?'Kept':'Not Kept';return `<article class="kept-card ${equippedSet.has(entry.id)?'equipped':''}"><div class="kept-card-title"><div><small>${escapeHtml(entry.id)} · ${escapeHtml(impressionCategory(entry))}${entry.subclass?` · ${escapeHtml(entry.subclass)}`:''}</small><strong>${escapeHtml(entry.name)}</strong></div><span>${entry.slots} slot${entry.slots===1?'':'s'}</span></div><p class="mechanic-copy">${escapeHtml(entry.mechanic||entry.canonical_text||'')}</p>${(entry.tags||[]).length?`<div class="tag-row">${entry.tags.map(tag=>`<span class="mechanic-tag">${escapeHtml(tag)}</span>`).join('')}</div>`:''}<small class="catalog-status">${escapeHtml(status)}</small></article>`}).join(''):'<div class="empty-state">No Kept Impressions match these filters.</div>';
  return `<section class="panel room-panel library-panel">
    <div class="kicker">The Library of Kept Impressions</div><h2>Krass's Magical Library</h2>
    <p class="muted">Kept Impressions belong to the account; each Vessel chooses its own loadout. Normal capacity is exactly ${KEPT_IMPRESSION_CAPACITY} slots.</p>
    ${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}
    <div class="library-capacity"><span>Slots Used</span><strong>${used} / ${KEPT_IMPRESSION_CAPACITY}</strong></div>
    ${tokenPanel}
    <section class="section"><h3>Equipped</h3>${equipped.length ? `<div class="kept-grid">${equipped.map(entry => keptCard(entry, true, runtimeIndex.get(entry.id), slot, account, tavernAdventurers)).join('')}</div>` : '<div class="empty-state">No Kept Impressions are equipped.</div>'}</section>
    <section class="section"><h3>Kept by this account</h3>${available.length ? `<div class="kept-grid">${available.map(entry => keptCard(entry, false, runtimeIndex.get(entry.id), slot, account, tavernAdventurers)).join('')}</div>` : `<div class="empty-state">No additional Kept Impressions are currently available.</div>`}</section>
    <section class="section full-kept-catalog"><div class="section-title"><div><h3>Complete Catalogue</h3><p class="muted">${keptEntries.length} canonical entries · ${catalog.length} shown. Catalogue browsing does not require ownership.</p></div></div>${controls}${tagControls}<div class="kept-grid section">${catalogCards}</div></section>
    <p class="muted section">${chronicleOpen ? 'The Chronicle is open. Kept Impression ownership remains account-wide.' : 'The Chronicle has not opened yet. Kept Impression ownership remains account-wide.'}</p>
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

function vesselRooms(slot, account, baseAbilities, subclassAbilities, unlockedRaces=[], baseClasses=[], portraitSystem=null, message = '') {
  const c = slot.character; const classless = isClasslessEquipped(slot);
  const stats = c.startingStats || {};
  const storedPool = Number(c.startingStatPool || 0);
  const pool = Number.isInteger(storedPool) && storedPool > 0 ? storedPool : getStartingStatPool(c.race);
  return `<section class="panel room-panel"><div class="kicker">Vessel / Player Rooms</div><h2>${escapeHtml(c.name)}</h2>
    <div class="identity-grid"><div><span>Race</span><strong>${escapeHtml(c.race)}</strong></div><div><span>Bound Class</span><strong>${escapeHtml(c.baseClass)}</strong></div><div><span>Selected Mantle</span><strong>${escapeHtml(c.subclass || 'None')}</strong></div><div><span>Next Path</span><strong>${classless ? 'Classless' : escapeHtml(c.subclass || c.baseClass)}</strong></div></div>
    <p class="muted section">Race and base class are the Vessel's current Tavern identity. They may be rebound here only between campaigns; an active campaign keeps the immutable race/class snapshot it started with.</p><div class="identity-grid section"><div><span>Known Subclasses</span><strong>${(account.unlocks?.subclasses||[]).length}</strong></div><div><span>Lender Collection</span><strong>${(slot.lender?.collection||[]).length}</strong></div><div><span>Campaign Records</span><strong>${(slot.history?.campaigns||[]).length}</strong></div><div><span>Borrowed Next Run</span><strong>${escapeHtml(slot.loadout?.borrowedItem?.name||'None')}</strong></div></div>
    <form id="vessel-rebind-form" class="section stat-panel vessel-rebind-panel"><div class="stat-panel-head"><div><div class="kicker">Tavern-only Identity</div><h3>Rebind Race / Base Class</h3></div></div><p class="muted">Rebinding affects future campaigns only. Campaign history, lender history, account unlocks, and this Vessel slot remain intact. Changing base class clears the currently selected Mantle because the new class must choose a compatible learned subclass.</p><div class="filter-grid"><label>Race<select name="rebind_race">${unlockedRaces.map(r=>`<option value="${escapeHtml(r)}" ${r===c.race?'selected':''}>${escapeHtml(r)}</option>`).join('')}</select></label><label>Base Class<select name="rebind_base_class">${baseClasses.map(x=>`<option value="${escapeHtml(x)}" ${x===c.baseClass?'selected':''}>${escapeHtml(x)}</option>`).join('')}</select></label></div><label class="confirm-line section"><input type="checkbox" name="rebind_confirmed" required /> <span>I understand this changes the Vessel only for future campaigns and may change its starting-stat pool.</span></label><div class="bind-actions"><button class="primary" type="submit">Apply Tavern Rebinding</button></div></form>
    ${message ? `<div class="notice section">${escapeHtml(message)}</div>` : ''}
    ${(()=>{
      const staticOptions=staticPortraitOptionsForSlot(slot,subclassAbilities,portraitSystem);
      if(staticOptions.length){
        const selectedId=c.appearance?.portraitIdentity||'';
        return `<section class="section portrait-library static-portrait-library"><div class="kicker">Appearance Atelier · Static Portraits</div><h3>Choose Your Vessel Portrait</h3><p class="muted">These portraits are fixed finished artwork: one portrait for each installed Race × Gender × Subclass identity. No recoloring or mask processing is used. This ${escapeHtml(c.race)} ${escapeHtml(c.baseClass)} currently has ${staticOptions.length} installed choices.</p><div class="portrait-choice-grid">${staticOptions.map(x=>`<button type="button" class="portrait-choice ${selectedId===x.id?'selected':''}" data-action="static-portrait-select" data-portrait="${escapeHtml(x.id)}"><img src="${escapeHtml(x.asset)}" alt="${escapeHtml(`${x.race} ${x.gender} ${x.subclass} portrait`)}" loading="lazy"><span>${escapeHtml(x.subclass)}</span><small>${escapeHtml(x.gender[0].toUpperCase()+x.gender.slice(1))} · ${escapeHtml(x.race)}</small></button>`).join('')}</div></section>`;
      }
      const portraitOptions=portraitOptionsForBase(c.baseClass,subclassAbilities);const selected=c.appearance?.portraitId||'';
      return `<section class="section portrait-library"><div class="kicker">Vessel Portrait Library · Compatibility</div><h3>Choose a Portrait</h3><p class="muted">Final static Race × Gender × Subclass artwork has not been installed for this class family yet, so the Beta 3 compatibility portraits remain available temporarily.</p><div class="portrait-choice-grid">${portraitOptions.map(x=>`<button type="button" class="portrait-choice ${selected===x.id?'selected':''}" data-action="vessel-portrait-select" data-portrait="${escapeHtml(x.id)}"><img src="${escapeHtml(x.asset)}" alt="${escapeHtml(`${x.subclass} ${x.presentation} portrait ${x.variant}`)}" loading="lazy"><span>${escapeHtml(x.subclass)}</span><small>${escapeHtml(x.presentation)} ${x.variant}</small></button>`).join('')}</div></section>`;
    })()}
    <form id="starting-stat-form" class="section stat-panel">
      <div class="stat-panel-head"><div><div class="kicker">Level 0 Setup</div><h3>Starting Stat Redistribution</h3></div><div class="stat-remaining"><strong data-stat-remaining>${pool}</strong><span>fixed total</span></div></div>
      <p class="muted">You may remove and re-add these starting points whenever you are between campaigns. The current ${escapeHtml(c.race)} race sets this pool to ${pool}; rebinding race between campaigns recalculates it. Run-earned Stat Points never enter this pool.</p>
      <div class="stat-allocation-grid">${CORE_STATS.map(stat => `<div class="stat-allocator-row"><strong>${stat}</strong><button type="button" class="stat-step" data-action="stat-step" data-stat-step="-1" data-stat="${stat}">−</button><input class="stat-input" type="number" name="stat_${stat}" data-stat-input="${stat}" min="0" step="1" value="${Number(stats[stat] || 0)}" inputmode="numeric"/><button type="button" class="stat-step" data-action="stat-step" data-stat-step="1" data-stat="${stat}">+</button></div>`).join('')}</div>
      <div class="bind-actions section"><button type="submit" class="primary">Save Redistribution</button></div>
    </form>
    ${classlessConfiguration(slot, account, baseAbilities, subclassAbilities)}
  </section>`;
}
function adventurerQuarters(slot, account, tavernAdventurers, tavernServices, message='') {
  const recruited=new Set(account.unlocks?.tavernAdventurers||[]), selected=new Set(slot.party?.tavernAdventurerIds||[]), entries=tavernAdventurers?.entries||[]; const recruitMap=new Map((tavernServices?.tavernAdventurerRecruitment?.remaining||[]).map(r=>[r.id,r.label]));
  return `<section class="panel room-panel"><div class="kicker">Tavern Adventurer Quarters</div><h2>Adventurer Quarters</h2><p class="muted">Tavern Adventurers act on their own in combat according to personality, class, subclass, and role. Up to three recruited Adventurers may deploy; they never use consumables.</p>${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}<div class="kept-grid section">${entries.map(a=>{const joined=recruited.has(a.id),active=selected.has(a.id);return `<article class="kept-card adventurer-card ${active?'equipped':''}">${a.portrait?`<img class="adventurer-portrait" src="${escapeHtml(a.portrait)}" alt="Portrait of ${escapeHtml(a.name)}" loading="lazy">`:''}<div class="kept-card-title"><div><small>${escapeHtml(a.personality)} · ${escapeHtml(a.combatRole)}</small><strong>${escapeHtml(a.name)}</strong></div><span>${escapeHtml(a.baseClass)}</span></div><p>${escapeHtml(a.subclass)} · ${escapeHtml(a.priority)}</p>${joined?'':`<p class="field-help">Recruitment: ${escapeHtml(recruitMap.get(a.id)||'Available from Forest accomplishments')}</p>`}<button data-action="adventurer-toggle" data-adventurer="${escapeHtml(a.id)}" ${joined?'':'disabled'}>${active?'Remove from Party':joined?'Deploy':'Not Recruited'}</button></article>`}).join('')}</div><p class="muted section">Only Tavern Adventurers who have joined this account can be deployed.</p></section>`;
}

function roomContent(roomId, ctx) {
  if (roomId === 'mara-bar') return maraBar(ctx.slot,ctx.account,ctx.tavernServices,ctx.equipmentCatalog,ctx.message,ctx.ux);
  if (roomId === 'krass-library') return krassLibrary(ctx.slot, ctx.account, ctx.keptEntries, ctx.keptRuntimeEntries, ctx.tavernAdventurers, ctx.message,ctx.ux);
  if (roomId === 'mantle-room') return mantleRoom(ctx.slot, ctx.account, ctx.subclassesForBase, ctx.message);
  if (roomId === 'training-chambers') return trainingChambers(ctx.account,ctx.message);
  if (roomId === 'records-room') return recordsRoom(ctx.slot,ctx.account,ctx.tavernAdventurers);
  if (roomId === 'vessel-rooms') return vesselRooms(ctx.slot, ctx.account, ctx.baseAbilities, ctx.subclassAbilities, ctx.unlockedRaces, ctx.baseClasses, ctx.portraitSystem, ctx.message);
  if (roomId === 'adventurer-quarters') return adventurerQuarters(ctx.slot, ctx.account, ctx.tavernAdventurers, ctx.tavernServices, ctx.message);
  return mainHall(ctx.slot);
}

export function renderTavern({ room, slot, account, subclassesForBase = [], unlockedRaces = [], baseClasses = [], keptEntries = [], keptRuntimeEntries = [], tavernAdventurers = null, tavernServices = null, equipmentCatalog = null, baseAbilities = null, subclassAbilities = null, portraitSystem = null, message = '', ux = {} }) {
  const inMain = room.id === 'main-hall';
  return shell(`${roomContent(room.id, { slot, account, subclassesForBase, unlockedRaces, baseClasses, keptEntries, keptRuntimeEntries, tavernAdventurers, tavernServices, equipmentCatalog, baseAbilities, subclassAbilities, portraitSystem, message, ux })}${inMain ? '' : '<div class="section"><button class="secondary" data-action="tavern-main-hall">Return to Main Hall</button></div>'}`, { back: inMain, backAction: 'leave-tavern', backLabel: 'Return Home' });
}
