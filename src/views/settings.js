import { shell } from './shared.js';

export function renderSettings({ combatSpeed, autoEndTurn = true, reducedMotion = false, combatNumbers = true, screenFlash = 'standard' }) {
  const values = [0.1,0.25,0.5,0.75,1,1.25,1.5,1.75,2,3,4];
  return shell(`
    <section class="section-title"><div><div class="kicker">Preferences</div><h2>Settings</h2><div class="muted">Account-wide readability and presentation preferences. None of these options change combat rules.</div></div></section>
    <section class="panel section">
      <div class="settings-row">
        <div><h3>Combat Speed</h3><div class="muted">Scales combat-event playback only. Rules and turn timing are unchanged.</div></div>
        <select data-setting="combatSpeed" aria-label="Combat speed">
          ${values.map(v => `<option value="${v}" ${Number(combatSpeed) === v ? 'selected' : ''}>${v}×</option>`).join('')}
        </select>
      </div>
      <div class="settings-row">
        <div><h3>Auto End Turn</h3><div class="muted">After your one allowed combat action resolves, immediately ends that combatant’s turn. Turn-end effects and cooldowns are unchanged; turn this off to keep the manual End Turn button.</div></div>
        <label class="toggle-control"><input type="checkbox" data-setting="autoEndTurn" ${autoEndTurn ? 'checked' : ''}/> <span>${autoEndTurn ? 'On' : 'Off'}</span></label>
      </div>
      <div class="settings-row">
        <div><h3>Reduced Motion</h3><div class="muted">Removes lunges, recoil, floating-number travel, and most impact motion while keeping combat feedback visible.</div></div>
        <label class="toggle-control"><input type="checkbox" data-setting="reducedMotion" ${reducedMotion ? 'checked' : ''}/> <span>${reducedMotion ? 'On' : 'Off'}</span></label>
      </div>
      <div class="settings-row">
        <div><h3>Combat Numbers</h3><div class="muted">Show exact HP, Shield, damage, healing, and floating combat values. Turning this off keeps percentage and text feedback.</div></div>
        <label class="toggle-control"><input type="checkbox" data-setting="combatNumbers" ${combatNumbers ? 'checked' : ''}/> <span>${combatNumbers ? 'On' : 'Off'}</span></label>
      </div>
      <div class="settings-row">
        <div><h3>Screen Flash Intensity</h3><div class="muted">Controls brief impact emphasis for Crits and major hits. Color is never the only indicator.</div></div>
        <select data-setting="screenFlash" aria-label="Screen flash intensity">
          <option value="off" ${screenFlash === 'off' ? 'selected' : ''}>Off</option>
          <option value="low" ${screenFlash === 'low' ? 'selected' : ''}>Low</option>
          <option value="standard" ${screenFlash === 'standard' ? 'selected' : ''}>Standard</option>
        </select>
      </div>
    </section><section class="panel section"><h3>Help & Accessibility</h3><p class="muted">Mechanical explanations never rely on color alone. The Help Codex is available from Home, and combat tooltips use tap-accessible text on mobile.</p><button class="secondary" data-action="help">Open Help Codex</button></section>
  `, { back: true });
}
