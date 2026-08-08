import { escapeHtml, shell } from './shared.js';

function performerCard(label, result) {
  const names = result?.names?.length ? result.names.join(' & ') : 'No real party member';
  return `<article class="result-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(names)}</strong><small>${Math.round(Number(result?.value || 0)).toLocaleString()}</small></article>`;
}

export function renderCampaignResults({ settlement, equipmentCatalog = null, message = '' }) {
  const c = settlement.chronicle;
  const classless = c.family === 'Classless';
  return shell(`
    <section class="results-hero panel ${settlement.outcome}">
      <div class="kicker">Campaign Complete</div>
      <h1>${settlement.outcome === 'defeat' ? 'Defeat' : settlement.outcome === 'return' ? 'Successful Return' : 'Victory'}</h1>
      <p>${escapeHtml(settlement.vesselName)} has returned from the world beyond the Door.</p>
    </section>

    <section class="section">
      <h2>Campaign Performance</h2>
      <div class="result-grid">
        ${performerCard('Most Damage Dealt', settlement.performance.mostDamageDealt)}
        ${performerCard('Most Damage Taken', settlement.performance.mostDamageTaken)}
        ${performerCard('Most Healing Done', settlement.performance.mostHealingDone)}
      </div>
    </section>

    <section class="panel section reward-panel">
      <h2>Rewards</h2>
      <div class="reward-row"><span>Onyx Banked</span><strong>+${settlement.onyx.banked}</strong></div>
      ${settlement.outcome === 'defeat' ? `<div class="field-help">${settlement.onyx.carried} Onyx carried · defeat banks half.</div>` : `<div class="field-help">All ${settlement.onyx.carried} carried Onyx will be banked.</div>`}
      <div class="reward-row"><span>${escapeHtml(c.family)} Chronicle Progress</span><strong>+${c.progressEarned}</strong></div>
      <div class="reward-row"><span>Chronicle Rank</span><strong>${c.rankBefore} → ${c.rankAfter}</strong></div>
      <div class="reward-row"><span>Chronicle Points Earned</span><strong>+${c.chroniclePointsEarned}</strong></div>
      ${classless ? '<div class="field-help">Classless unlocks directly by Chronicle Rank and does not award spendable Chronicle Points.</div>' : ''}
    </section>

    ${settlement.maraQuest?`<section class="panel section"><h2>Mara Quest</h2><div class="reward-row"><span>${escapeHtml(settlement.maraQuest.label)}</span><strong>${settlement.maraQuest.complete?'Completed':'Incomplete'}</strong></div>${settlement.maraQuest.complete?`<div class="field-help">Reward earned: +${Number(settlement.maraQuest.reward?.onyx||0)} Onyx and +${Number(settlement.maraQuest.reward?.chronicleProgress||0)} Chronicle Progress. Quest Onyx is included in the carried total before the return/defeat banking rule.</div>`:'<div class="field-help">The quest expires without punishment.</div>'}</section>`:''}
    ${message?`<div class="notice section">${escapeHtml(message)}</div>`:''}
    ${(settlement.lender?.candidates||[]).length?`<section class="panel section"><h2>Choose One Item for Mara's Lender</h2><p class="muted">This successful return may permanently register exactly one eligible item for this Vessel's lender collection.</p><div class="lender-grid">${settlement.lender.candidates.map(id=>{const item=(equipmentCatalog?.equipment||[]).find(x=>x.id===id);return `<button class="lender-item ${settlement.lender.selectedItemId===id?'selected':''}" data-action="campaign-lender-select" data-item="${escapeHtml(id)}"><strong>${escapeHtml(item?.name||id)}</strong><small>${settlement.lender.selectedItemId===id?'Selected':'Register this item'}</small></button>`}).join('')}</div></section>`:''}
    <section class="panel section result-reset-note">
      <h3>The next campaign begins again at Character Level 1.</h3>
      <p class="muted">Run Level, EXP, and level-earned Stat Points end with this campaign. Your permanent starting-stat allocation remains on the Vessel and may be redistributed between campaigns without changing its fixed total.</p>
    </section>

    <div class="results-done section"><button class="primary large-button" data-action="campaign-results-done">Done</button></div>
  `, { back: false });
}
