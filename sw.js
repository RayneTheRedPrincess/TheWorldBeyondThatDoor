const CACHE_NAME = 'twbtd-i22-beta2-candidate-2p5d-2026-08-08';
const STATIC_FILES = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './src/app.js', './src/constants.js', './src/combat-presentation.js', './src/player-facing.js', './src/tutorial-controller.js', './src/save-controller.js', './src/canon-registry.js', './src/router.js',
  './src/account-bootstrap.js', './src/tavern-services-controller.js', './src/character-creator.js', './src/tavern-controller.js', './src/progression-features.js',
  './src/kept-impression-controller.js', './src/mantle-controller.js', './src/chronicle-controller.js', './src/campaign-door.js',
  './src/campaign-controller.js', './src/character-progression.js', './src/expedition-controller.js', './src/forest-event-deck.js', './src/forest-event-controller.js', './src/combat-controller.js', './src/combat-math.js', './src/combat-resolution.js', './src/equipment-controller.js', './src/crafting-controller.js', './src/consumable-controller.js', './src/status-engine.js', './src/base-class-state.js', './src/ability-controller.js', './src/subclass-state.js', './src/subclass-controller.js', './src/classless-controller.js', './src/kept-impression-state.js', './src/kept-impression-runtime.js', './src/forest-encounter-builder.js', './src/forest-reward-controller.js', './src/enemy-ai.js', './src/ally-ai.js', './src/starting-stats.js',
  './src/views/shared.js', './src/views/home.js', './src/views/tutorial.js', './src/views/help.js', './src/views/credits.js', './src/views/slots.js', './src/views/create-character.js', './src/views/tavern.js', './src/views/chronicle.js', './src/views/campaign-prep.js', './src/views/campaign-run.js', './src/views/campaign-results.js', './src/views/settings.js',
  './assets/combat/forest-clearing.svg', './assets/combat/mossed-path.svg', './assets/combat/fungal-grove.svg', './assets/combat/deep-rootway.svg', './assets/combat/thorn-hollow.svg', './assets/combat/heartwood-sanctum.svg', './assets/combat/trainer-glade.svg',
  './assets/route-art/combat.svg', './assets/route-art/trainer.svg', './assets/route-art/landmark.svg', './assets/route-art/helpful-person.svg', './assets/route-art/discovery.svg', './assets/route-art/event.svg',
  './data/canon-authority.json', './data/kept-impressions.json', './data/kept-impression-runtime.json', './data/account-bootstrap.json', './data/chronicle-trees.json', './data/starting-stats.json', './data/regions.json', './data/combat-rules.json', './data/base-abilities.json', './data/base-class-resources.json', './data/subclass-abilities.json', './data/forest-enemies.json', './data/forest-events.json', './data/forest-trainers.json', './data/character-progression.json', './data/tavern-adventurers.json', './data/equipment-consumables-status.json', './data/forest-crafting.json', './data/tavern-services.json', './data/tutorials-help.json'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('twbtd-') && k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation remains network-first so a newly deployed shell can be discovered,
  // but always falls back to the pre-cached app shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  // Versioned static assets/data are cache-first. Each sealed build changes the cache name on
  // every sealed build, so this avoids redundant network latency without serving
  // stale files across releases.
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (!response.ok) return response;
      const copy = response.clone();
      return caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => response);
    });
  }));
});
