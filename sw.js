const CACHE_NAME = 'twbtd-production-shell-v2-2026-08-10-kharvax-hotfix';
const ART_CACHE_NAME = 'twbtd-portrait-static-runtime-v3-adaptive-full';
const THUMB_ART_CACHE_NAME = 'twbtd-portrait-static-runtime-v3-adaptive-thumbs';
const CONTENT_ART_CACHE_NAME = 'twbtd-content-portrait-runtime-v1';
const MAX_RUNTIME_ART_ENTRIES = 96; // compatibility ceiling retained from the sealed baseline
const MAX_RUNTIME_FULL_ENTRIES = 36;
const MAX_RUNTIME_THUMB_ENTRIES = 72;
const MAX_RUNTIME_CONTENT_ENTRIES = 96;
// Legacy compatibility source path: assets/portraits/vessels/ (source-only; not install-precached).
const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './.nojekyll',
  './src/ability-controller.js',
  './src/account-bootstrap.js',
  './src/ally-ai.js',
  './src/app.js',
  './src/base-class-state.js',
  './src/bog-encounter-builder.js',
  './src/bog-event-deck.js',
  './src/tower-encounter-builder.js',
  './src/tower-event-deck.js',
  './src/plains-encounter-builder.js',
  './src/plains-event-deck.js',
  './src/hell-encounter-builder.js',
  './src/hell-event-deck.js',
  './src/hell-merchant-controller.js',
  './src/dragon-encounter-builder.js',
  './src/dragon-event-deck.js',
  './src/necropolis-encounter-builder.js',
  './src/necropolis-event-deck.js',
  './src/final-region-encounter-builder.js',
  './src/campaign-controller.js',
  './src/campaign-door.js',
  './src/canon-registry.js',
  './src/character-creator.js',
  './src/character-progression.js',
  './src/chronicle-controller.js',
  './src/classless-controller.js',
  './src/combat-controller.js',
  './src/combat-math.js',
  './src/combat-presentation.js',
  './src/combat-resolution.js',
  './src/content-portrait.js',
  './src/constants.js',
  './src/consumable-controller.js',
  './src/crafting-controller.js',
  './src/enemy-ai.js',
  './src/enemy-special-mechanics.js',
  './src/equipment-ability-controller.js',
  './src/racial-ability-controller.js',
  './src/racial-configuration.js',
  './src/equipment-controller.js',
  './src/expedition-controller.js',
  './src/forest-encounter-builder.js',
  './src/forest-event-controller.js',
  './src/forest-event-deck.js',
  './src/forest-reward-controller.js',
  './src/gameplay-efficiency.js',
  './src/kept-impression-controller.js',
  './src/kept-impression-runtime.js',
  './src/legacy-lender.js',
  './src/kept-impression-state.js',
  './src/library-ui.js',
  './src/mantle-controller.js',
  './src/player-facing.js',
  './src/portrait-controller.js',
  './src/portrait-preload.js',
  './src/progression-features.js',
  './src/router.js',
  './src/save-controller.js',
  './src/storage-efficiency.js',
  './src/starting-stats.js',
  './src/status-engine.js',
  './src/subclass-controller.js',
  './src/subclass-state.js',
  './src/tavern-controller.js',
  './src/tavern-services-controller.js',
  './src/tutorial-controller.js',
  './src/vessel-controller.js',
  './src/views/campaign-prep.js',
  './src/views/campaign-results.js',
  './src/views/campaign-run.js',
  './src/views/chronicle.js',
  './src/views/create-character.js',
  './src/views/credits.js',
  './src/views/help.js',
  './src/views/home.js',
  './src/views/portrait.js',
  './src/views/racial-configuration.js',
  './src/views/settings.js',
  './src/views/shared.js',
  './src/views/slots.js',
  './src/views/tavern.js',
  './src/views/tutorial.js',
  './data/account-bootstrap.json',
  './data/base-abilities.json',
  './data/base-class-resources.json',
  './data/bog-crafting.json',
  './data/bog-enemies.json',
  './data/bog-events.json',
  './data/bog-trainers.json',
  './data/canon-authority.json',
  './data/character-progression.json',
  './data/chronicle-trees-canon.txt',
  './data/chronicle-trees.json',
  './data/classless-chronicle-canon.txt',
  './data/combat-rules.json',
  './data/content-portraits.json',
  './data/equipment-consumables-status.json',
  './data/forest-crafting.json',
  './data/forest-enemies.json',
  './data/forest-events.json',
  './data/forest-trainers.json',
  './data/kept-impression-runtime.json',
  './data/kept-impressions.json',
  './data/portrait-system.json',
  './data/regions.json',
  './data/racial-configurations.json',
  './data/starting-stats.json',
  './data/subclass-abilities.json',
  './data/tavern-adventurers.json',
  './data/tavern-services.json',
  './data/tower-crafting.json',
  './data/tower-enemies.json',
  './data/tower-events.json',
  './data/plains-crafting.json',
  './data/plains-enemies.json',
  './data/plains-events.json',
  './data/hell-crafting.json',
  './data/hell-enemies.json',
  './data/hell-events.json',
  './data/dragon-crafting.json',
  './data/dragon-enemies.json',
  './data/dragon-events.json',
  './data/necropolis-crafting.json',
  './data/necropolis-enemies.json',
  './data/necropolis-events.json',
  './data/final-region-enemies.json',
  './data/tutorials-help.json',
  './assets/combat/deep-rootway.svg',
  './assets/combat/forest-clearing.svg',
  './assets/combat/fungal-grove.svg',
  './assets/combat/heartwood-sanctum.svg',
  './assets/combat/mossed-path.svg',
  './assets/combat/thorn-hollow.svg',
  './assets/combat/trainer-glade.svg',
  './assets/icons/favicon.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/route-art/combat.svg',
  './assets/route-art/discovery.svg',
  './assets/route-art/event.svg',
  './assets/route-art/helpful-person.svg',
  './assets/route-art/landmark.svg',
  './assets/route-art/trainer.svg'
];

function isRuntimeVesselPortrait(url){
  // Keep the sealed compatibility matcher for canonical/full WebP paths while
  // also recognizing the adaptive AVIF and 128px delivery directories.
  if(/\/assets\/portraits\/vessels-static(?:-webp)?\//.test(url.pathname))return true;
  return /\/assets\/portraits\/vessels-static-(?:avif|128-(?:avif|webp))\//.test(url.pathname);
}


function isRuntimeContentPortrait(url){
  return /\/assets\/portraits\/(?:enemies\/|enemies-static(?:-avif|-webp)?\/|events-static(?:-400-(?:avif|webp))?\/|trainers-static(?:-400-(?:avif|webp))?\/|adventurers-static(?:-(?:avif|webp))?\/)/.test(url.pathname);
}

function portraitCacheProfile(url){
  if(/\/assets\/portraits\/vessels-static-128-(?:avif|webp)\//.test(url.pathname))return {name:THUMB_ART_CACHE_NAME,limit:MAX_RUNTIME_THUMB_ENTRIES};
  return {name:ART_CACHE_NAME,limit:MAX_RUNTIME_FULL_ENTRIES};
}

async function trimRuntimeArt(cache,limit){
  const keys=await cache.keys();
  const excess=keys.length-limit;
  if(excess>0)await Promise.all(keys.slice(0,excess).map(request=>cache.delete(request)));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('twbtd-') && k !== CACHE_NAME && k !== ART_CACHE_NAME && k !== THUMB_ART_CACHE_NAME && k !== CONTENT_ART_CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

async function safeNetwork(request,cacheName=CACHE_NAME,limit=null) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
      if(limit)await trimRuntimeArt(cache,limit);
    }
    return response;
  } catch (_error) {
    return null;
  }
}

async function runtimePortraitResponse(request,url){
  const profile=isRuntimeContentPortrait(url)?{name:CONTENT_ART_CACHE_NAME,limit:MAX_RUNTIME_CONTENT_ENTRIES}:portraitCacheProfile(url);
  const cache=await caches.open(profile.name);
  const cached=await cache.match(request);
  if(cached)return cached;
  return (await safeNetwork(request,profile.name,profile.limit)) || new Response('Offline portrait unavailable until it has been viewed once.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const network = await safeNetwork(request);
      if (network) return network;
      return (await caches.match('./index.html')) || new Response('TWBTD is offline and the app shell is unavailable.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }

  if(isRuntimeVesselPortrait(url)||isRuntimeContentPortrait(url)){event.respondWith(runtimePortraitResponse(request,url));return;}
  event.respondWith(caches.match(request).then(cached => cached || safeNetwork(request).then(network => network || new Response('Offline asset unavailable.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
});