/*
 * Service worker Buku Kas LBM MWC NU Ngantang.
 * Cangkang aplikasi (HTML, JS, ikon) tersedia offline untuk dibaca. Data transaksi tidak disimpan di sini
 * (cache data ada di aplikasi) dan panggilan Supabase selalu langsung ke jaringan.
 */
'use strict';

var VERSION = '71468af51b';
var SHELL_CACHE = 'kas-shell-' + VERSION;
var RUNTIME_CACHE = 'kas-runtime-v1';
var PRECACHE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "assets/js/nur3d.min.js?v=4272d1bb",
  "assets/js/hero-glue.js?v=8dbd1305",
  "assets/js/kas-extras.js?v=429dfdfe",
  "assets/js/app.js?v=0b408ef7",
  "assets/icons/icon-192.png"
];
var CDN_HOSTS = ['cdn.jsdelivr.net', 'cdn.sheetjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
var SCOPE = self.registration.scope;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf('kas-shell-') === 0 && key !== SHELL_CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(sameOrigin(request, url));
    return;
  }
  if (CDN_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith(staleWhileRevalidate(request, true));
    return;
  }
  /* lainnya (mis. Supabase): biarkan ke jaringan */
});

function networkFirstPage(request) {
  return fetch(request)
    .then(function (response) {
      if (response && response.ok) {
        var copy = response.clone();
        caches.open(SHELL_CACHE).then(function (cache) {
          cache.put(SCOPE + 'index.html', copy);
        });
      }
      return response;
    })
    .catch(function () {
      return caches
        .match(SCOPE + 'index.html')
        .then(function (hit) {
          return hit || caches.match(SCOPE);
        })
        .then(function (hit) {
          return hit || Response.error();
        });
    });
}

function sameOrigin(request, url) {
  var isAsset = url.pathname.indexOf('/assets/') !== -1 || /manifest\.webmanifest$/.test(url.pathname);
  return isAsset ? cacheFirst(request) : staleWhileRevalidate(request, false);
}

function cacheFirst(request) {
  return caches.match(request).then(function (hit) {
    if (hit) return hit;
    return fetch(request)
      .then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(SHELL_CACHE).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function () {
        return caches.match(request, { ignoreSearch: true }).then(function (fallback) {
          return fallback || Response.error();
        });
      });
  });
}

function staleWhileRevalidate(request, cors) {
  return caches.open(RUNTIME_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      var fresh = cors
        ? fetch(request.url, { mode: 'cors', credentials: 'omit' }).catch(function () {
            return fetch(request);
          })
        : fetch(request);
      var network = fresh
        .then(function (response) {
          if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
          return response;
        })
        .catch(function () {
          return hit || Response.error();
        });
      return hit || network;
    });
  });
}
