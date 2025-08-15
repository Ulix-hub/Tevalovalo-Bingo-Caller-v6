// Tevalovalo Bingo Caller — Safe Service Worker
// - Bypasses ALL POST requests
// - Bypasses Netlify Functions (/.netlify/functions/*)
// - Network-first for GET, caches fallback
// Bump CACHE when you ship changes.

const CACHE = 'tvlv-bingo-v8';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/style.css',
      // Cache the current script version if you add a query param in index.html
      '/script.js?v=fix8',
      '/icon-192.png',
      '/icon-512.png',
      '/favicon.ico',
      '/manifest.json',
    ])).catch(()=>{})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1) Never intercept POST/PUT/PATCH/DELETE/etc.
  if (req.method !== 'GET') return; // let the network handle it

  // 2) Never intercept Netlify Functions
  if (url.pathname.startsWith('/.netlify/functions/')) return; // go straight to network

  // 3) For same-origin GET requests, do network-first, cache-fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => caches.match(req))
    );
  }
  // For cross-origin, do nothing (default network behavior)
});
