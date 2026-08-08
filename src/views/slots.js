import { escapeHtml, shell } from './shared.js';

function slotCard(slot, index, mode) {
  const number = index + 1;
  if (!slot?.character) {
    return `<article class="panel slot">
      <div><div class="slot-number">Vessel Slot ${number}</div><h3>Empty Vessel</h3><p class="slot-empty">No character is bound to this slot.</p></div>
      <button class="slot-button" data-action="empty-slot" data-slot="${number}" ${mode === 'continue' ? 'disabled' : ''}>${mode === 'continue' ? 'Empty' : 'Choose Vessel'}</button>
    </article>`;
  }
  const c = slot.character;
  const campaignStatus = slot.campaign?.settlement ? 'Campaign results awaiting review' : (slot.campaign?.active ? 'Campaign paused' : 'At the Tavern');
  return `<article class="panel slot">
    <div>
      <div class="slot-number">Vessel Slot ${number}</div>
      <h3>${escapeHtml(c.name || 'Unnamed Vessel')}</h3>
      <div class="slot-meta">${escapeHtml(c.race || 'Race unbound')} · ${escapeHtml(c.baseClass || 'Class unbound')}<br>${campaignStatus}</div>
    </div>
    <div class="slot-actions">
      <button class="slot-button" data-action="select-slot" data-slot="${number}">${slot.campaign?.settlement ? 'View Results' : (slot.campaign?.active ? 'Continue Campaign' : (mode === 'continue' ? 'Continue' : 'Enter Tavern'))}</button>
      <button class="danger" data-action="delete-slot" data-slot="${number}">Delete</button>
    </div>
  </article>`;
}

export function renderSlots({ slots, mode }) {
  const title = mode === 'continue' ? 'Continue' : 'Choose a Vessel';
  const note = mode === 'continue'
    ? 'Each vessel preserves its own exact campaign state. Character Level is intentionally not shown here.'
    : 'A character remains bound to its vessel slot until that slot is deleted.';
  return shell(`
    <section class="section-title"><div><h2>${title}</h2><div class="muted">Nine persistent character slots</div></div></section>
    <div class="notice">${note}</div>
    <section class="grid section">${slots.map((s,i) => slotCard(s,i,mode)).join('')}</section>
  `, { back: true });
}
