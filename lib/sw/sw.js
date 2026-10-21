// ══════════════════════════════════════════════════
//  Service Worker — Rewards Mobile
//
//  Lo sirve app/sw.js/route.ts, que pone en VERSION el
//  commit del despliegue: cada despliegue es una versión
//  nueva y su caché propia, sin acordarse de subir nada.
//
//  Estrategia:
//  - /_next/static e íconos: primero la caché. Los nombres
//    llevan hash, así que no cambian sin cambiar de nombre.
//  - Páginas: primero la red. Si tarda más de 4 s y hay
//    copia, la copia; sin copia, se sigue esperando a la red.
//    Sin red: la copia, o /offline.
//  - /api y las peticiones RSC de Next: siempre a la red.
//
//  Nunca se guarda una redirección, una respuesta de otro
//  origen o un error. En las vistas previas de Vercel, la
//  protección de despliegue redirige a vercel.com/sso-api:
//  eso no se guarda y, si falla, se responde un error de red
//  normal en vez de romper el service worker.
//
//  No hay skipWaiting a ciegas: la versión nueva espera a
//  que el CAP toque "Actualizar" (components/ActualizacionApp).
// ══════════════════════════════════════════════════

const VERSION = '__VERSION__';
const CACHE = `rewards-${VERSION}`;

/** Pantallas que tienen que abrir sin señal desde el primer día. */
const PAGINAS_BASE = ['/hoy', '/login', '/buscar', '/perfil', '/registrar', '/offline'];

const ESTATICOS = [
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/logo-login.png',
];

/** Lo que se espera a la red antes de enseñar la copia de una página. */
const MS_ESPERA_RED = 4000;

/** Solo respuestas propias, completas y sin redirección. */
function esGuardable(res) {
  return !!res && res.status === 200 && res.type === 'basic' && !res.redirected;
}

/** Los /_next/static que usa una página, para que abra sin señal. */
function recursosDe(html) {
  const encontrados = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) {
    encontrados.add(m[0]);
  }
  return [...encontrados];
}

async function guardarRecurso(cache, url) {
  if (await cache.match(url)) return;
  const res = await fetch(url);
  if (esGuardable(res)) await cache.put(url, res);
}

/** Guarda una página por su ruta, sin la query, con sus recursos. */
async function guardarPagina(cache, ruta) {
  const res = await fetch(ruta, { credentials: 'same-origin' });
  if (!esGuardable(res)) return;
  const html = await res.clone().text();
  await cache.put(ruta, res);
  await Promise.allSettled(recursosDe(html).map((u) => guardarRecurso(cache, u)));
}

// ── Ciclo de vida ─────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Uno a uno y sin todo-o-nada: si algo falla (sin señal, la
      // protección de Vercel), la instalación sigue.
      await Promise.allSettled([
        ...PAGINAS_BASE.map((ruta) => guardarPagina(cache, ruta)),
        ...ESTATICOS.map((u) => guardarRecurso(cache, u)),
      ]);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      // Incluye las de versiones viejas, como rewards-v3-assets.
      await Promise.all(
        claves
          .filter((k) => k.startsWith('rewards-') && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const datos = event.data || {};

  // El CAP tocó "Actualizar".
  if (datos.tipo === 'SALTAR_ESPERA') {
    self.skipWaiting();
    return;
  }

  // Hoy manda las páginas de las paradas del día para que abran sin señal.
  if (datos.tipo === 'precalentar' && Array.isArray(datos.rutas)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE);
        for (const ruta of datos.rutas) {
          if (typeof ruta !== 'string' || !ruta.startsWith('/')) continue;
          if (await cache.match(ruta)) continue;
          try {
            await guardarPagina(cache, ruta);
          } catch {
            return; // sin señal: se intenta en la próxima carga de Hoy
          }
        }
      })(),
    );
  }
});

// ── Peticiones ────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // Datos de navegación de Next: si fallan, Next hace una navegación
  // normal y esa sí la atiende la copia de abajo.
  if (request.headers.get('RSC') || url.searchParams.has('_rsc')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navegar(request, url.pathname));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || ESTATICOS.includes(url.pathname)) {
    event.respondWith(primeroCache(request));
  }
});

async function primeroCache(request) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  try {
    const res = await fetch(request);
    if (esGuardable(res)) cache.put(request, res.clone());
    return res;
  } catch {
    // Lo mismo que vería el navegador sin service worker.
    return Response.error();
  }
}

async function navegar(request, ruta) {
  const cache = await caches.open(CACHE);

  const desdeRed = fetch(request).then((res) => {
    if (esGuardable(res)) cache.put(ruta, res.clone());
    return res;
  });

  const espera = new Promise((resolver) => setTimeout(() => resolver(null), MS_ESPERA_RED));

  try {
    const primera = await Promise.race([desdeRed, espera]);
    if (primera) return primera;

    // La red tarda: si hay copia, la copia ya. La red sigue y la deja al día.
    const guardada = await cache.match(ruta);
    if (guardada) {
      desdeRed.catch(() => {});
      return guardada;
    }
    return await desdeRed;
  } catch {
    return (
      (await cache.match(ruta)) ||
      (await cache.match('/offline')) ||
      new Response(
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<title>Sin conexión</title></head>' +
          '<body style="font-family:-apple-system,sans-serif;text-align:center;padding:48px 24px;color:#0f172a">' +
          '<h1 style="font-size:18px">Sin conexión</h1>' +
          '<p style="color:#64748b;font-size:14px">Revisa tu señal e intenta de nuevo.</p>' +
          '<button onclick="location.reload()" style="margin-top:20px;padding:12px 24px;border:0;border-radius:14px;background:#3d35c8;color:#fff;font-size:14px">Reintentar</button>' +
          '</body></html>',
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
      )
    );
  }
}
