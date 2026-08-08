export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

export function shell(content, { back = false, backAction = 'home', backLabel = 'Return Home' } = {}) {
  return `<main class="shell">
    <div class="topbar">
      <div class="brand-small">The World Beyond the Door</div>
      ${back ? `<button class="back" data-action="${backAction}">${backLabel}</button>` : ''}
    </div>
    ${content}
    <div class="footer-note">Return Home. Step Beyond. Begin Again.</div>
  </main>`;
}
