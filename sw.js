/* ==========================================================================
   THE SYSTEM — service worker.
   Cache-first with background revalidation: the site opens instantly and
   works offline; a new deploy appears on the second launch after the push.

   BUMP VERSION ON EVERY DEPLOY THAT CHANGES A CACHED FILE.
   ========================================================================== */
var VERSION = 'v1';
var SHELL_CACHE = 'the-system-shell-' + VERSION;
var FONT_CACHE = 'the-system-fonts';

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
        if (key !== SHELL_CACHE && key !== FONT_CACHE) return caches.delete(key);
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

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (isFont(url)) {
    event.respondWith(staleWhileRevalidate(event, FONT_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return;

  event.respondWith(staleWhileRevalidate(event, SHELL_CACHE));
});
