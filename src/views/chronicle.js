import { escapeHtml, shell } from './shared.js';
import { getChronicleAllocation } from '../chronicle-controller.js';
import { isProgressionFeatureUnlocked, PROGRESSION_FEATURES } from '../progression-features.js';

function chroniclePointLabel(value) {
  const amount = Number(value || 0);
  return `${amount} Chronicle Point${amount === 1 ? '' : 's'}`;
}

function lockedChronicle() {
  return shell(`
    <section class="panel locked-feature">
      <div class="kicker">Chronicle of Paths</div>
      <h2>The pages have not opened yet.</h2>
      <p class="muted">The Chronicle is a later Tavern remembrance. The Outside Door does not require it.</p>
    </section>
  `, { back: true });
}

function familyPicker(baseClasses, selectedFamily, account, trees) {
  return `<div class="chronicle-family-picker">${baseClasses.map(name => {
    const allocation = getChronicleAllocation(account, trees, name);
    return `<button class="chronicle-family-button ${name === selectedFamily ? 'selected' : ''}" data-action="chronicle-family" data-family="${escapeHtml(name)}"><strong>${escapeHtml(name)}</strong><span>Rank ${allocation?.state.rank || 0}</span></button>`;
  }).join('')}</div>`;
}

function nodeCard(node, allocation) {
  const owned = allocation.state.purchasedNodes.includes(node.id);
  const available = allocation.availableCP >= node.cost;
  const req = [];
  if (node.requirements?.rank) req.push(`Rank ${node.requirements.rank}`);
  if (node.requirements?.corePurchased) req.push(`${node.requirements.corePurchased} Core`);
  if (node.requirements?.spentCP) req.push(`${chroniclePointLabel(node.requirements.spentCP)} spent`);
  if (node.previous) req.push('previous node');
  return `<article class="chronicle-node ${owned ? 'owned' : ''}">
    <div class="chronicle-node-head"><strong>${escapeHtml(node.displayName || node.name)}</strong><span>${chroniclePointLabel(node.cost)}</span></div>
    <p>${escapeHtml(node.effect)}</p>
    ${req.length ? `<small>Requires: ${escapeHtml(req.join(' · '))}</small>` : '<small>Core foundation</small>'}
    <button class="${owned ? 'secondary' : 'primary'} node-buy" data-action="chronicle-buy" data-node="${node.id}" ${owned || !available ? 'disabled' : ''}>${owned ? 'Active' : 'Purchase'}</button>
  </article>`;
}

function familyTree(selectedFamily, account, trees, message) {
  const allocation = getChronicleAllocation(account, trees, selectedFamily);
  if (!allocation) return '<div class="empty-state">That Chronicle path could not be found.</div>';
  const groups = new Map();
  for (const node of allocation.tree.nodes) {
    if (!groups.has(node.group)) groups.set(node.group, []);
    groups.get(node.group).push(node);
  }
  return `<section class="section">
    <div class="panel chronicle-tree-header">
      <div><div class="kicker">${escapeHtml(selectedFamily)}</div><h2>${escapeHtml(selectedFamily)} Chronicle</h2><p class="muted">${escapeHtml(allocation.tree.resource)} · ${escapeHtml(allocation.tree.scaling.join(' / '))}</p></div>
      <div class="chronicle-budget"><strong>${allocation.availableCP}</strong><span>Chronicle Points available</span><small>${allocation.spentCP} / 30 Chronicle Points active</small></div>
    </div>
    ${message ? `<div class="notice section">${escapeHtml(message)}</div>` : ''}
    <div class="section"><button class="secondary inline-button" data-action="chronicle-respec" data-family="${escapeHtml(selectedFamily)}" ${allocation.spentCP ? '' : 'disabled'}>Refund this path</button></div>
    ${[...groups.entries()].map(([group,nodes]) => `<section class="section chronicle-group"><h3>${escapeHtml(group)}</h3><div class="chronicle-node-grid">${nodes.map(node => nodeCard(node, allocation)).join('')}</div></section>`).join('')}
  </section>`;
}

export function renderChronicle({ baseClasses, account, chronicle, trees, selectedFamily, message = '' }) {
  if (!isProgressionFeatureUnlocked(account, PROGRESSION_FEATURES.CHRONICLE)) return lockedChronicle();
  const family = baseClasses.includes(selectedFamily) ? selectedFamily : baseClasses[0];
  const cl = account.chronicle?.classless || { rank: 0, progress: 0 };
  return shell(`
    <section class="section-title"><div><h2>Chronicle of Paths</h2><div class="muted">Permanent class mastery remembered by the Tavern</div></div></section>
    <div class="notice">Progress comes from qualifying campaign accomplishments, never from Onyx. Allocations may be refunded freely at the Tavern while outside an active campaign.</div>
    <section class="section">${familyPicker(baseClasses, family, account, trees)}</section>
    ${familyTree(family, account, trees, message)}
    <section class="section panel classless-chronicle-card"><h3>Classless</h3><div class="rank">Rank ${cl.rank || 0} / ${chronicle.classless.rank_cap}</div><p class="muted">Classless has no Chronicle Point tree. Its approved selections unlock directly by Rank.</p></section>
  `, { back: true });
}
