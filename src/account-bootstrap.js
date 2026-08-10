import { normalizeProgressionFeatures } from './progression-features.js';

function list(value) { return Array.isArray(value) ? value : []; }
function unique(values = []) { return [...new Set(list(values).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))]; }
function union(a = [], b = []) { return unique([...list(a), ...list(b)]); }

export function applyAccountBootstrap(account, policy) {
  const unlocks = account.unlocks || {};
  const existingFeatures = normalizeProgressionFeatures(account.progressionFeatures);
  const starterFeatures = normalizeProgressionFeatures(policy.startingProgressionFeatures);
  const priorBootstrapVersion = Math.max(0, Number(account.meta?.accountBootstrapVersion || 0));
  const targetBootstrapVersion = Math.max(0, Number(policy.version || 0));
  const tutorials = account.tutorials && typeof account.tutorials === 'object' ? { ...account.tutorials } : {};
  const starter = tutorials.starter && typeof tutorials.starter === 'object' ? { ...tutorials.starter } : {};
  const tokenWallet = tutorials.tokenWallet && typeof tutorials.tokenWallet === 'object' ? { ...tutorials.tokenWallet } : {};

  // Bootstrap v5 retroactively grants the new one-time account Race Choice token to
  // accounts that had already resolved the starter onboarding under Phase 10.
  if (targetBootstrapVersion >= 5 && priorBootstrapVersion < 5 && starter.resolved && starter.rewardGranted) {
    tokenWallet.raceChoice = 1;
    starter.raceChoiceGranted = true;
  }

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
    tutorials: { ...tutorials, starter, tokenWallet },
    meta: {
      ...(account.meta || {}),
      accountBootstrapVersion: Math.max(priorBootstrapVersion, targetBootstrapVersion)
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
