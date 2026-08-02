// Cache version — bump this whenever you change any app files.
// The activate handler automatically cleans up old caches.
const CACHE_NAME = 'progpomo-v29';

// Static assets that never change between deploys (fonts, icons).
// These are served cache-first for instant loading.
const IMMUTABLE_ASSETS = [
  './fonts/nunito.css',
  './fonts/nunito-latin.woff2',
  './icons/regular.css',
  './icons/Phosphor.woff2',
  './icons/fill.css',
  './icons/Phosphor-Fill.woff2',
];

// App shell files — JS modules, CSS, HTML.
// These use stale-while-revalidate: serve the cached copy instantly
// while fetching a fresh copy in the background for the next load.
// No ?v=N cache-busting needed; bumping CACHE_NAME on deploy is enough.
const SHELL_ASSETS = [
  './index.html',
  './landing.html',
  './style.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/themes.js',
  './js/ui.js',
  './js/timer.js',
  './js/events.js',
  './js/beats.js',
  './manifest.json',
];

const ALL_ASSETS = [...SHELL_ASSETS, ...IMMUTABLE_ASSETS];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ALL_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Only handle same-origin GET requests.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isImmutable = IMMUTABLE_ASSETS.some(a => url.pathname.endsWith(a.replace('./', '/')));

  if (isImmutable) {
    // Cache-first: fonts/icons never change.
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
          return res;
        })
      )
    );
  } else {
    // Stale-while-revalidate: serve cached copy immediately,
    // fetch fresh copy in the background and update cache.
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone());
            return res;
          }).catch(() => cached); // network offline → fall back to cache
          return cached || fetchPromise;
        })
      )
    );
  }
});
