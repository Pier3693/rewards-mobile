// ══════════════════════════════════════════════════
//  Service Worker — Rewards Mobile
//  Estrategia:
//  - Assets estáticos (íconos, manifest): cache-first
//  - Navegación (páginas): network-first con fallback
//    a /offline si no hay conexión
//  - Todo lo demás (API, /api/gs): siempre red, nunca
//    cache (los datos deben ser siempre frescos)
// ══════════════════════════════════════════════════

const CACHE_VERSION = 'rewards-v3';
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
    caches.open(ASSETS_CACHE).then((cache) =>
      // Individual, no atómico: si un recurso falla, no cancela
      // la instalación completa del Service Worker (a diferencia
      // de cache.addAll, que es todo-o-nada).
      Promise.allSettled(
        ASSETS_PRECACHE.map((url) =>
          fetch(url)
            .then((res) => {
              if (res.ok) return cache.put(url, res);
            })
            .catch(() => {}),
        ),
      ),
    ),
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
      fetch(request).catch(
        () =>
          caches.match('/offline').then(
            (cached) =>
              cached ||
              new Response(
                `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>Sin conexión</title>
                <style>
                  body{font-family:-apple-system,sans-serif;display:flex;
                    min-height:100vh;align-items:center;justify-content:center;
                    text-align:center;padding:24px;color:#0f172a;margin:0}
                  button{margin-top:20px;padding:12px 24px;border:none;
                    border-radius:14px;background:#2563eb;color:#fff;
                    font-size:14px;font-weight:600}
                </style></head><body>
                <div>
                  <h1 style="font-size:18px">Sin conexión</h1>
                  <p style="color:#64748b;font-size:14px">
                    Revisa tu señal e intenta de nuevo.</p>
                  <button onclick="location.reload()">Reintentar</button>
                </div></body></html>`,
                { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
              ),
          ),
      ),
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
