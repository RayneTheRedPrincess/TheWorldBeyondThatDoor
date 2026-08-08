import { normalizeProgressionFeatures } from './progression-features.js';

function list(value) { return Array.isArray(value) ? value : []; }
function unique(values = []) { return [...new Set(list(values).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]; }
function union(a = [], b = []) { return unique([...list(a), ...list(b)]); }

export function applyAccountBootstrap(account, policy) {
  const unlocks = account.unlocks || {};
  const existingFeatures = normalizeProgressionFeatures(account.progressionFeatures);
  const starterFeatures = normalizeProgressionFeatures(policy.startingProgressionFeatures);
  return {
    ...account,
    unlocks: {
      ...unlocks,
      races: union(unlocks.races, policy.startingUnlockedRaces),
      subclasses: union(unlocks.subclasses, policy.startingUnlockedSubclasses),
      keptImpressions: union(unlocks.keptImpressions, policy.startingUnlockedKeptImpressions),
      tavernAdventurers: union(unlocks.tavernAdventurers, policy.startingUnlockedTavernAdventurers)
    },
    progressionFeatures: {
      mantle: existingFeatures.mantle || starterFeatures.mantle,
      chronicle: existingFeatures.chronicle || starterFeatures.chronicle
    },
    meta: {
      ...(account.meta || {}),
      accountBootstrapVersion: Math.max(Number(account.meta?.accountBootstrapVersion || 0), Number(policy.version || 0))
    }
  };
}
