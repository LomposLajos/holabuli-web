// Holabuli service worker – a e988d71-hqyzs és /holabuli-web helyére a szerver (vagy a statikus build) ír értéket.
// Új build → új cache-név → a régi cache törlődik, skipWaiting + clients.claim után a kliens újratölt.
const BASE = '/holabuli-web';
const VERSION = 'holabuli-e988d71-hqyzs';
const STATIC = [BASE + '/css/tokens.css?v=e988d71-hqyzs', BASE + '/css/base.css?v=e988d71-hqyzs', BASE + '/css/components.css?v=e988d71-hqyzs', BASE + '/js/app.js?v=e988d71-hqyzs', BASE + '/manifest.webmanifest', BASE + '/img/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const p = BASE && url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
  // API, kapu, admin, socket, sw: soha ne cache-eljük.
  if (p.startsWith('/api/') || p.startsWith('/kapu/') || p.startsWith('/admin') || p.startsWith('/socket.io') || p === '/sw.js') return;
  const isStatic = /^\/(css|js|vendor|img|poster)\//.test(p) || p === '/manifest.webmanifest';
  if (isStatic) {
    // Cache-first, de csak a saját (aktuális build) cache-ből; a ?v= miatt régi fájl nem keveredik be.
    e.respondWith(caches.open(VERSION).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }))));
    return;
  }
  // Oldalak: hálózat elsőként, tartalék a cache (a passz offline is előjön, ha egyszer megnyitották).
  e.respondWith(fetch(e.request).then((res) => { if (res.ok) caches.open(VERSION).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request)));
});
