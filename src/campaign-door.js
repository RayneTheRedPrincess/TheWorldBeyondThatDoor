import { CLASSLESS_ID, getEquippedKeptIds, isClasslessEquipped } from './kept-impression-controller.js';
import { canStartCampaign } from './campaign-controller.js';

// Intentionally accepts only slot state. Mantle/Chronicle account unlocks cannot gate campaign access.
export function getCampaignDoorState(slot) {
  if (!slot?.character) return { available: false, label: 'Open the Door', reason: 'A bound Vessel is required.' };
  if (slot?.campaign?.settlement) return { available: true, label: 'View Campaign Results', reason: '' };
  if (slot?.campaign?.active) return { available: true, label: 'Return Beyond the Door', reason: '' };
  const readiness = canStartCampaign(slot);
  return readiness.ok
    ? { available: true, label: 'Prepare Campaign', reason: '' }
    : { available: false, label: 'Prepare Campaign', reason: readiness.reason };
}

export function getCampaignPreparationSummary(slot, keptEntries = []) {
  const byId = new Map(keptEntries.map(entry => [entry.id, entry]));
  const keptIds = getEquippedKeptIds(slot);
  const classless = isClasslessEquipped(slot);
  return {
    vesselName: slot?.character?.name || '',
    race: slot?.character?.race || '',
    permanentBaseClass: slot?.character?.baseClass || '',
    effectiveBaseClass: classless ? null : (slot?.character?.baseClass || null),
    effectiveSubclass: classless ? null : (slot?.character?.subclass || null),
    classless,
    keptImpressions: keptIds.map(id => byId.get(id)).filter(Boolean),
    classlessId: CLASSLESS_ID,
    startingStats: slot?.character?.startingStats || {},
    startingStatPool: slot?.character?.startingStatPool || 0
  };
}
