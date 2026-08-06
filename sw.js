// Cache version — bump this whenever you change any app files.
// The activate handler automatically cleans up old caches.
const CACHE_NAME = 'progpomo-v34';

// Static assets that never change between deploys (fonts, icons, images).
// These are served cache-first for instant loading.
const IMMUTABLE_ASSETS = [
  './fonts/nunito.css',
  './fonts/nunito-latin.woff2',
  './icons/regular.css',
  './icons/Phosphor.woff2',
  './icons/fill.css',
  './icons/Phosphor-Fill.woff2',
  './images/logo.svg',
  './images/favicon-32.png',
  './images/apple-touch-icon.png',
  './images/icon-192.png',
  './images/icon-512.png',
];

// App shell files — JS modules, CSS, HTML.
// Served network-first so a normal refresh always shows the latest
// deployed files; the cache is only a fallback for offline use.
const SHELL_ASSETS = [
  './index.html',
  './landing.html',
  './style.css',
  './css/base.css',
  './css/layout.css',
  './css/timer.css',
  './css/beats.css',
  './css/rating.css',
  './css/cards.css',
  './css/settings.css',
  './css/animations.css',
  './css/overlays.css',
  './css/pages.css',
  './css/responsive.css',
  './js/app.js',
  './js/state.js',
  './js/storage.js',
  './js/themes.js',
  './js/ui.js',
  './js/timer.js',
  './js/events.js',
  './js/beats.js',
  './js/sounds.js',
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

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const url = new URL('./index.html', self.location.href).href;
    const targets = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of targets) {
      if (new URL(c.url).pathname === new URL(url).pathname) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
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
    // Network-first for the app shell: always serve the latest deployed
    // files when online, fall back to cache (or the app shell) offline.
    // This means normal refreshes are never stale — no cache-busting dance.
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() =>
        caches.match(e.request).then(cached =>
          cached || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
    );
  }
});
