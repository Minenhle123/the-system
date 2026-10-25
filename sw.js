/* ==========================================================================
   THE SYSTEM — service worker.
   Cache-first with background revalidation: the site opens instantly and
   works offline; a new deploy appears on the second launch after the push.

   BUMP VERSION ON EVERY DEPLOY THAT CHANGES A CACHED FILE.
   ========================================================================== */
var VERSION = 'v2';
var SHELL_CACHE = 'the-system-shell-' + VERSION;
var FONT_CACHE = 'the-system-fonts';
var NEWS_CACHE = 'the-system-news';

var SHELL = [
  './',
  './index.html',
  './app/',
  './app/index.html',
  './how-it-works.html',
  './privacy.html',
  './404.html',
  './manifest.webmanifest',
  './assets/css/tokens.css',
  './assets/css/site.css',
  './assets/css/app.css',
  './assets/js/system.js',
  './assets/js/app.js',
  './assets/js/demo.js',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== SHELL_CACHE && key !== FONT_CACHE && key !== NEWS_CACHE) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

/* Serve from cache, refresh the cache in the background. */
function staleWhileRevalidate(event, cacheName) {
  var req = event.request;
  return caches.open(cacheName).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var network = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      });
      if (cached) {
        event.waitUntil(network.then(null, function () {}));
        return cached;
      }
      return network.then(null, function () {
        if (req.mode === 'navigate') return caches.match('./404.html');
        return Response.error();
      });
    });
  });
}

/* The morning briefing changes daily: always try the network first and
   fall back to the last copy only when offline. */
function isNews(url) { return /\/news\/[^\/]+\.json$/.test(url.pathname); }

function networkFirst(event, cacheName) {
  var key = event.request.url;
  return fetch(key, { cache: 'no-store' }).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      event.waitUntil(caches.open(cacheName).then(function (cache) { return cache.put(key, copy); }).then(null, function () {}));
    }
    return res;
  }, function () {
    return caches.match(key).then(function (hit) { return hit || Response.error(); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isNews(url)) {
    event.respondWith(networkFirst(event, NEWS_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
});
