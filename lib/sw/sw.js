// ══════════════════════════════════════════════════
//  Service Worker — Rewards Mobile
//
//  Lo sirve app/sw.js/route.ts, que pone en VERSION el
//  commit del despliegue: cada despliegue es una versión
//  nueva y su caché propia, sin acordarse de subir nada.
//
//  Instalación: SOLO lo crítico (/offline, manifest e
//  íconos), cada cosa con su límite de tiempo. Nada puede
//  dejarla colgada: o termina bien, o falla en ~10 s y el
//  navegador la reintenta. Las pantallas y sus /_next/static
//  se guardan "lo que se pueda" después de activarse, cuando
//  la página manda PRECALENTAR_BASE.
//
//  Estrategia de peticiones:
//  - /_next/static e íconos: primero la caché. Los nombres
//    llevan hash, así que no cambian sin cambiar de nombre.
//  - Páginas: primero la red. Si tarda más de 4 s y hay
//    copia, la copia; sin copia, la red un rato más. Sin red:
//    la copia, o /offline.
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
//
//  Cada paso deja un log con la versión: en DevTools, elige
//  "sw.js" en el selector de contexto de la consola.
// ══════════════════════════════════════════════════

const VERSION = '__VERSION__';
const CACHE = `rewards-${VERSION}`;

/** Lo único que puede hacer fallar la instalación. */
const CRITICOS = [
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

/** Se guardan después de activarse, lo que se pueda. */
const PAGINAS_BASE = ['/hoy', '/login', '/buscar', '/perfil', '/registrar'];
const EXTRAS = ['/logo-login.png'];

/** Lo que se sirve primero de la caché, aparte de /_next/static. */
const ESTATICOS = [...CRITICOS.filter((u) => u !== '/offline'), ...EXTRAS];

/** Lo que se espera a la red antes de enseñar la copia de una página. */
const MS_ESPERA_RED = 4000;

/** Tope para cada cosa que se guarda: nada puede quedarse esperando. */
const MS_LIMITE_PRECACHE = 10000;

/** Cuántas descargas a la vez al guardar "lo que se pueda". */
const EN_PARALELO = 4;

function log(...partes) {
  console.log(`[sw ${VERSION}]`, ...partes);
}

function aviso(...partes) {
  console.warn(`[sw ${VERSION}]`, ...partes);
}

// ── Utilidades ────────────────────────────────────

/**
 * Corre la operación con un tope de tiempo. Al vencer aborta el fetch y
 * rechaza igual, aunque la operación ignore el aborto: un fetch, una
 * lectura o un cache.put que no terminan ya no cuelgan a nadie.
 */
function conLimite(nombre, ms, operacion) {
  const control = new AbortController();
  let temporizador;
  const limite = new Promise((_, rechazar) => {
    temporizador = setTimeout(() => {
      control.abort();
      rechazar(new Error(`${nombre}: sin respuesta en ${ms} ms`));
    }, ms);
  });
  return Promise.race([
    Promise.resolve().then(() => operacion(control.signal)),
    limite,
  ]).finally(() => clearTimeout(temporizador));
}

function esperar(ms) {
  return new Promise((resolver) => setTimeout(() => resolver(null), ms));
}

/** Corre `fn` sobre cada elemento, de `n` en `n`. Nunca rechaza. */
async function enLotes(elementos, n, fn) {
  const resultados = [];
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      try {
        resultados[i] = { ok: true, valor: await fn(elementos[i]) };
      } catch (error) {
        resultados[i] = { ok: false, error };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(n, elementos.length) }, trabajador),
  );
  return resultados;
}

/** Solo respuestas propias, completas y sin redirección. */
function esGuardable(res) {
  return !!res && res.status === 200 && res.type === 'basic' && !res.redirected;
}

function motivoNoGuardable(res) {
  if (!res) return 'sin respuesta';
  if (res.redirected || res.type === 'opaqueredirect') return 'vino redirigida';
  if (res.type !== 'basic') return `respuesta de tipo ${res.type}`;
  return `estado ${res.status}`;
}

/** Los /_next/static que usa una página, para que abra sin señal. */
function recursosDe(html) {
  const encontrados = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s)\\]+/g)) {
    encontrados.add(m[0]);
  }
  return [...encontrados];
}

function abrirCache() {
  return conLimite('caches.open', MS_LIMITE_PRECACHE, () => caches.open(CACHE));
}

/** Guarda un archivo tal cual. Rechaza si no se pudo. */
function guardarRecurso(cache, url) {
  return conLimite(url, MS_LIMITE_PRECACHE, async (signal) => {
    if (await cache.match(url)) return;
    const res = await fetch(url, { signal });
    if (!esGuardable(res)) throw new Error(`${url}: ${motivoNoGuardable(res)}`);
    await cache.put(url, res);
  });
}

/**
 * Guarda una página por su ruta, sin la query.
 * @return los /_next/static que usa, para guardarlos después.
 */
function guardarPagina(cache, ruta) {
  return conLimite(ruta, MS_LIMITE_PRECACHE, async (signal) => {
    if (await cache.match(ruta)) return [];
    const res = await fetch(ruta, { credentials: 'same-origin', signal });
    if (!esGuardable(res)) throw new Error(`${ruta}: ${motivoNoGuardable(res)}`);
    // Se lee una sola vez y se guarda una copia nueva: sin clone() no
    // quedan dos lecturas del mismo cuerpo esperándose entre sí.
    const html = await res.text();
    await cache.put(
      ruta,
      new Response(html, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      }),
    );
    return recursosDe(html);
  });
}

/** Guarda páginas y sus recursos, lo que se pueda. Nunca rechaza. */
async function precalentar(rutas, extras = []) {
  log('precalentar: inicio,', rutas.length, 'páginas');
  let guardadas = 0;
  let fallidas = 0;
  try {
    const cache = await abrirCache();
    const recursos = new Set(extras);

    const paginas = await enLotes(rutas, EN_PARALELO, (ruta) => guardarPagina(cache, ruta));
    for (const r of paginas) {
      if (r.ok) {
        guardadas++;
        r.valor.forEach((u) => recursos.add(u));
      } else {
        fallidas++;
        aviso('precalentar: falló', r.error?.message || r.error);
      }
    }

    const archivos = await enLotes([...recursos], EN_PARALELO, (u) => guardarRecurso(cache, u));
    for (const r of archivos) {
      if (r.ok) guardadas++;
      else fallidas++;
    }
  } catch (e) {
    aviso('precalentar: no se pudo abrir la caché:', e?.message || e);
  }
  log(`precalentar: listo, ${guardadas} guardadas, ${fallidas} fallidas`);
}

// ── Ciclo de vida ─────────────────────────────────

async function instalar() {
  const cache = await abrirCache();
  log('install: caché abierta', CACHE);

  const resultados = await Promise.allSettled(CRITICOS.map((u) => guardarRecurso(cache, u)));
  const fallidos = [];
  resultados.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      log('install: crítico OK', CRITICOS[i]);
    } else {
      fallidos.push(CRITICOS[i]);
      aviso('install: crítico FALLÓ', r.reason?.message || r.reason);
    }
  });

  if (fallidos.length) {
    // Sin /offline ni íconos la app no es instalable ni abre sin señal:
    // mejor fallar ya. El navegador lo reintenta en la próxima carga.
    throw new Error(`install: faltan ${fallidos.join(', ')}`);
  }
  log(`install: listo (${CRITICOS.length}/${CRITICOS.length})`);
}

self.addEventListener('install', (event) => {
  log('install: inicio');
  event.waitUntil(
    instalar().catch((e) => {
      aviso(e?.message || e);
      throw e;
    }),
  );
});

self.addEventListener('activate', (event) => {
  log('activate: inicio');
  event.waitUntil(
    (async () => {
      const claves = await caches.keys();
      // Incluye las de versiones viejas, como rewards-v3-assets.
      const viejas = claves.filter((k) => k.startsWith('rewards-') && k !== CACHE);
      await Promise.all(viejas.map((k) => caches.delete(k)));
      if (viejas.length) log('activate: borradas', viejas.join(', '));
      await self.clients.claim();
      log('activate: listo, controla las pestañas');
    })(),
  );
});

self.addEventListener('message', (event) => {
  const datos = event.data || {};

  // El CAP tocó "Actualizar".
  if (datos.tipo === 'SALTAR_ESPERA') {
    log('mensaje: SALTAR_ESPERA');
    self.skipWaiting();
    return;
  }

  // La página ya cargó: se guardan las pantallas principales. waitUntil
  // mantiene vivo el service worker mientras tanto.
  if (datos.tipo === 'PRECALENTAR_BASE') {
    event.waitUntil(precalentar(PAGINAS_BASE, EXTRAS));
    return;
  }

  // Hoy manda las páginas de las paradas del día para que abran sin señal.
  if (datos.tipo === 'precalentar' && Array.isArray(datos.rutas)) {
    const rutas = datos.rutas.filter((r) => typeof r === 'string' && r.startsWith('/'));
    event.waitUntil(precalentar(rutas));
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

  try {
    const primera = await Promise.race([desdeRed, esperar(MS_ESPERA_RED)]);
    if (primera) return primera;

    // La red tarda: si hay copia, la copia ya. La red sigue y la deja al día.
    const guardada = await cache.match(ruta);
    if (guardada) return guardada;

    // Sin copia se espera un rato más, pero no para siempre.
    const tarde = await Promise.race([desdeRed, esperar(MS_LIMITE_PRECACHE)]);
    if (tarde) return tarde;
    throw new Error(`${ruta}: sin respuesta`);
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
