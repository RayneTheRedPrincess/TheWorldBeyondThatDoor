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
      tavernAdventurers: union(unlocks.tavernAdventurers, policy.startingUnlockedTavernAdventurers),
      mantleBaseClasses: unique(unlocks.mantleBaseClasses)
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

export function migrateMantleUnlocksFromTrainerHistory(account, forestTrainers) {
  const next = { ...account, unlocks:{...(account?.unlocks||{})} };
  const learned = new Set(Array.isArray(account?.records?.trainersLearnedFrom) ? account.records.trainersLearnedFrom.map(String) : []);
  const unlockedSubclasses = new Set(Array.isArray(account?.unlocks?.subclasses) ? account.unlocks.subclasses.map(String) : []);
  const mantle = new Set(Array.isArray(account?.unlocks?.mantleBaseClasses) ? account.unlocks.mantleBaseClasses.map(String) : []);
  for (const trainer of forestTrainers?.entries || []) {
    if (learned.has(String(trainer.id)) && unlockedSubclasses.has(String(trainer.subclass))) mantle.add(String(trainer.baseClass));
  }
  next.unlocks.mantleBaseClasses=[...mantle];
  if(next.unlocks.mantleBaseClasses.length)next.progressionFeatures={...(next.progressionFeatures||{}),mantle:true};
  return next;
}
