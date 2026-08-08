import { escapeHtml, shell } from './shared.js';
import { CORE_STATS, BASE_STARTING_STAT_POINTS } from '../starting-stats.js';

function statAllocator({ values = {}, prefix = 'stat_' } = {}) {
  return `<div class="stat-allocation-grid">${CORE_STATS.map(stat => `<div class="stat-allocator-row">
    <strong>${stat}</strong>
    <button type="button" class="stat-step" data-action="stat-step" data-stat-step="-1" data-stat="${stat}" aria-label="Remove one ${stat}">−</button>
    <input class="stat-input" type="number" name="${prefix}${stat}" data-stat-input="${stat}" min="0" step="1" value="${Number(values[stat] || 0)}" inputmode="numeric" />
    <button type="button" class="stat-step" data-action="stat-step" data-stat-step="1" data-stat="${stat}" aria-label="Add one ${stat}">+</button>
  </div>`).join('')}</div>`;
}

export function renderCharacterCreation({ slotNumber, unlockedRaces, classDetails, errors = [] }) {
  const errorBlock = errors.length
    ? `<div class="notice notice-danger" role="alert"><strong>The Vessel could not be bound.</strong><ul>${errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`
    : '';

  return shell(`
    <section class="section-title"><div><h2>Bind a Vessel</h2><div class="muted">Vessel Slot ${slotNumber}</div></div></section>
    <div class="notice">Race and base class remain bound to this Vessel unless the slot is deleted. Starting stats are a Level-0 Vessel setup; every campaign begins at Character Level 1.</div>
    ${errorBlock}
    <form id="vessel-form" class="section creation-layout" autocomplete="off">
      <section class="panel">
        <label class="field-label" for="vessel-name">Vessel Name</label>
        <input id="vessel-name" class="text-input" name="name" maxlength="24" required placeholder="Name this Vessel" />
        <div class="field-help">1–24 characters.</div>
      </section>

      <section class="panel">
        <label class="field-label" for="vessel-race">Race</label>
        <select id="vessel-race" name="race" required data-starting-race>
          <option value="">Choose an unlocked race</option>
          ${unlockedRaces.map(race => `<option value="${escapeHtml(race)}">${escapeHtml(race)}</option>`).join('')}
        </select>
        <div class="field-help">Unlocked races are shared across all nine Vessel slots.</div>
      </section>

      <section class="panel creation-wide">
        <fieldset class="class-fieldset">
          <legend>Base Class</legend>
          <div class="class-choice-grid">
            ${classDetails.map((entry, index) => `<label class="class-choice">
              <input type="radio" name="baseClass" value="${escapeHtml(entry.name)}" ${index === 0 ? 'required' : ''} />
              <span class="class-choice-body">
                <strong>${escapeHtml(entry.name)}</strong>
                <span>${escapeHtml(entry.role)}</span>
                <small>Scales with ${entry.scalingIdentity.map(escapeHtml).join(' / ')}</small>
              </span>
            </label>`).join('')}
          </div>
        </fieldset>
      </section>

      <section class="panel creation-wide stat-panel">
        <div class="stat-panel-head"><div><div class="kicker">Level 0 Setup</div><h3>Starting Stats</h3></div><div class="stat-remaining"><strong data-stat-remaining>Choose a race</strong><span>points remaining</span></div></div>
        <p class="muted">Every Vessel receives ${BASE_STARTING_STAT_POINTS} base starting points. A race may add free starting points. Once the Vessel is bound, its resulting total pool is permanent: you may redistribute those points later, but you can never gain or lose points from this pool.</p>
        ${statAllocator()}
      </section>

      <section class="panel creation-wide bind-panel">
        <label class="confirm-line"><input type="checkbox" name="bindingConfirmed" required /> <span>I understand this race and base class stay bound to this Vessel until the slot is deleted.</span></label>
        <div class="bind-actions">
          <button type="button" class="secondary" data-action="cancel-create">Cancel</button>
          <button type="submit" class="primary">Complete Vessel</button>
        </div>
      </section>
    </form>
  `, { back: false });
}
