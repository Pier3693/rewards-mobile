// ══════════════════════════════════════════════════
//  Service Worker — Rewards Mobile
//  Estrategia:
//  - Assets estáticos (íconos, manifest): cache-first
//  - Navegación (páginas): network-first con fallback
//    a /offline si no hay conexión
//  - Todo lo demás (API, /api/gs): siempre red, nunca
//    cache (los datos deben ser siempre frescos)
// ══════════════════════════════════════════════════

const CACHE_VERSION = 'rewards-v1';
const ASSETS_CACHE = `${CACHE_VERSION}-assets`;

const ASSETS_PRECACHE = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/logo-login.png',
  '/offline',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSETS_CACHE).then((cache) => cache.addAll(ASSETS_PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('rewards-') && k !== ASSETS_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nunca cachear llamadas al API — siempre datos frescos
  if (url.pathname.startsWith('/api/')) return;

  // Navegación de página (el usuario abre/navega la app)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline')),
    );
    return;
  }

  // Assets estáticos: cache-first, actualizando en segundo plano
  if (
    request.method === 'GET' &&
    (url.pathname.startsWith('/icon') ||
      url.pathname.startsWith('/logo-') ||
      url.pathname === '/manifest.json')
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const clone = res.clone();
            caches.open(ASSETS_CACHE).then((c) => c.put(request, clone));
            return res;
          }),
      ),
    );
  }
});
