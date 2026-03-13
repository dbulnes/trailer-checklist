/**
 * Service Worker — enables offline support for this PWA.
 *
 * Caching strategies:
 *   - App assets (index.html, manifest.json): cache-first, fallback to network
 *   - CDN scripts (Supabase JS, barcode polyfill): network-first, fallback to cache
 *   - Supabase API calls: network-only, never cached
 *
 * Bump CACHE_NAME whenever you change index.html or manifest.json so that
 * returning users pick up the new version instead of seeing stale cache.
 */
const CACHE_NAME = 'rv-inspect-v10';
const ASSETS = ['./index.html', './manifest.json', './checklist-data.js', './app.js', './cloud.js'];
const CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
     .then(() => self.clients.matchAll().then(clients =>
       clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' }))
     ))
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // CDN requests: network-first (update cache), fall back to cache
  if (url.startsWith('https://cdn.jsdelivr.net/')) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Supabase API calls: network only, no caching
  if (url.includes('supabase.co')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // App assets: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});
