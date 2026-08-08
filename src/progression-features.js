export const PROGRESSION_FEATURES = Object.freeze({
  MANTLE: 'mantle',
  CHRONICLE: 'chronicle'
});

export function normalizeProgressionFeatures(features = {}) {
  return {
    mantle: Boolean(features.mantle),
    chronicle: Boolean(features.chronicle)
  };
}

export function isProgressionFeatureUnlocked(account, feature) {
  if (!Object.values(PROGRESSION_FEATURES).includes(feature)) return false;
  return Boolean(account?.progressionFeatures?.[feature]);
}

export function setProgressionFeature(account, feature, unlocked = true) {
  if (!Object.values(PROGRESSION_FEATURES).includes(feature)) throw new Error(`Unknown progression feature: ${feature}`);
  return {
    ...account,
    progressionFeatures: {
      ...normalizeProgressionFeatures(account?.progressionFeatures),
      [feature]: Boolean(unlocked)
    }
  };
}
