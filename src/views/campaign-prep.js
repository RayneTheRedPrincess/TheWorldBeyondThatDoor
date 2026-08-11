import { escapeHtml, shell } from './shared.js';
import { getKeptSlotCost, KEPT_IMPRESSION_CAPACITY } from '../kept-impression-controller.js';
import { CORE_STATS } from '../starting-stats.js';
import { CAMPAIGN_DIFFICULTIES, CAMPAIGN_DIFFICULTY_DETAILS } from '../constants.js';

export function renderCampaignPreparation({ summary, keptEntries }) {
  const kept = summary.keptImpressions || [];
  const used = getKeptSlotCost(kept.map(entry => entry.id), keptEntries);
  return shell(`
    <section class="panel campaign-prep">
      <div class="kicker">Outside Door</div>
      <h2>Campaign Preparation</h2>
      <p class="muted">${escapeHtml(summary.vesselName)} can approach the world beyond now. A Mantle and the Chronicle of Paths are not required to begin a campaign.</p>
      <div class="identity-grid section">
        <div><span>Race</span><strong>${escapeHtml(summary.race)}</strong><small>${escapeHtml(summary.racialConfigurationSummary||'Fixed racial features')}</small></div>
        <div><span>Path</span><strong>${summary.classless ? 'Classless' : escapeHtml(summary.effectiveBaseClass || 'None')}</strong></div>
        <div><span>Subclass</span><strong>${summary.classless ? 'Suppressed by Classless' : escapeHtml(summary.effectiveSubclass || 'None')}</strong></div>
        <div><span>Kept Capacity</span><strong>${used} / ${KEPT_IMPRESSION_CAPACITY}</strong></div>
      </div>
      <div class="section">
        <h3>Starting Stats</h3>
        <div class="run-stat-strip">${CORE_STATS.map(stat => `<span><strong>${stat}</strong> ${Number(summary.startingStats?.[stat] || 0)}</span>`).join('')}</div>
        <div class="field-help">Fixed Level-0 pool: ${summary.startingStatPool} points. The campaign starts at Character Level 1.</div>
      </div>
      <div class="section">
        <h3>Kept Impressions</h3>
        ${kept.length ? `<div class="kept-summary-list">${kept.map(entry => `<div class="kept-summary"><strong>${escapeHtml(entry.name)}</strong><span>${entry.slots} slot${entry.slots === 1 ? '' : 's'}</span></div>`).join('')}</div>` : '<div class="empty-state">No Kept Impressions are equipped. An empty loadout does not prevent the Door from opening.</div>'}
      </div>
      <fieldset class="section difficulty-fieldset">
        <legend>Campaign Difficulty</legend>
        <p class="muted">Choose before opening the Door. Difficulty is locked for the entire campaign. Enemy Dodge is intentionally kept below player-side extremes on every difficulty.</p>
        <div class="difficulty-grid">
          ${CAMPAIGN_DIFFICULTIES.map(name => { const detail=CAMPAIGN_DIFFICULTY_DETAILS[name]; return `<label class="difficulty-choice"><input type="radio" name="campaign_difficulty" data-campaign-difficulty value="${escapeHtml(name)}" ${name==='Normal'?'checked':''}/><span class="difficulty-choice-body"><strong>${escapeHtml(detail.label)}</strong><small>${escapeHtml(detail.summary)}</small></span></label>`; }).join('')}
        </div>
      </fieldset>
      <div class="notice section">Opening the Door snapshots this preparation into a separate campaign save. Tavern changes will not rewrite an active run.</div>
      <div class="section"><button class="primary large-button" data-action="start-campaign">Open the Door</button></div>
    </section>
  `, { back: true, backAction: 'back-to-tavern', backLabel: 'Return to Main Hall' });
}
