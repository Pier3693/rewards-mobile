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
//  Activación: SOLO local y rápida. Mientras un service worker
//  se activa, el navegador retiene las peticiones de la app:
//  si aquí se esperara a la red, con mala señal la pantalla
//  quedaría en blanco. Se copian de la caché vieja las páginas
//  de las paradas (con sus chunks) y los archivos de esta
//  versión que ya estaban, se borra la vieja y listo.
//
//  Las descargas (archivos que falten, pantallas y paradas
//  recordadas) van DESPUÉS, en la "puesta al día", que se
//  mantiene viva con el waitUntil de cada petición o mensaje
//  que llegue.
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
const PAGINAS_BASE = ['/hoy', '/login', '/mapa', '/perfil', '/registrar', '/historial'];
const EXTRAS = ['/logo-login.png'];

/**
 * Todos los archivos de .next/static: los pone app/sw.js/route.ts en el
 * build. Así el chunk de /visita/[id] se guarda aunque el CAP nunca haya
 * entrado con señal. Vacío en desarrollo.
 */
const RECURSOS_APP = [] /* __RECURSOS_APP__ */;

/** Lo que se sirve primero de la caché, aparte de /_next/static. */
const ESTATICOS = [...CRITICOS.filter((u) => u !== '/offline'), ...EXTRAS];

/** Lo que se espera a la red antes de enseñar la copia de una página. */
const MS_ESPERA_RED = 4000;

/** Tope para cada cosa que se guarda: nada puede quedarse esperando. */
const MS_LIMITE_PRECACHE = 10000;

/** Cuántas descargas a la vez al guardar "lo que se pueda". */
const EN_PARALELO = 4;

/**
 * Tope de la copia local al activarse. Solo por seguridad: copiar entre
 * cachés del propio celular tarda milisegundos, y mientras dura la app
 * no puede cargar nada.
 */
const MS_LIMITE_ACTIVACION = 5000;

/**
 * Caché que sobrevive a las versiones: no empieza por "rewards-", así
 * que la limpieza del activate no la toca. Guarda la última lista de
 * páginas que mandó Hoy, para volver a guardarlas al activarse sin
 * esperar a la página.
 */
const CACHE_META = 'rw-meta';
const CLAVE_RUTAS = '/__rw/rutas.json';

/**
 * Los mosaicos del mapa ya vistos, para abrirlo sin señal. Caché aparte
 * que sobrevive a las versiones, como rw-meta.
 *
 * Solo se guarda lo que el CAP ya miró, con tope: nada de descargar
 * zonas enteras por adelantado, que la política de uso de OpenStreetMap
 * no lo permite.
 */
const CACHE_MOSAICOS = 'rw-mosaicos';
const SERVIDOR_MOSAICOS = 'tile.openstreetmap.org';
const MAX_MOSAICOS = 300;
/** Pasado esto se vuelve a pedir; si no hay señal, sirve el viejo. */
const MS_MOSAICO_FRESCO = 7 * 24 * 60 * 60 * 1000;
const CABECERA_GUARDADO = 'x-rw-guardado';

/**
 * La foto de perfil (miniatura de Drive), para verla sin señal. Caché
 * aparte, como los mosaicos, y con tope: es una sola persona por celular.
 * Al cerrar sesión la borra la página (clearSession).
 */
const CACHE_AVATAR = 'rw-avatar';
const SERVIDOR_AVATAR = 'drive.google.com';
const MAX_AVATARES = 2;

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

/**
 * La ruta tal como la pide el navegador, para que la caché la encuentre.
 *
 * El manifest de Next escribe `[id]` y el navegador pide `%5Bid%5D`;
 * los paréntesis de `(app)` van literales. encodeURI deja las dos formas
 * iguales.
 */
function claveDe(ruta) {
  try {
    return encodeURI(decodeURI(ruta));
  } catch {
    return ruta; // un % suelto: mejor tal cual que perderla
  }
}

/**
 * Los /_next/static que usa una página, para que abra sin señal.
 *
 * Las rutas llevan `(app)` y `%5Bid%5D`: se aceptan paréntesis y
 * corchetes, y se corta en la extensión para que un `url(...)` de CSS no
 * se lleve el `)`. Los datos RSC del HTML las traen sin `/_next/`.
 */
function recursosDe(html) {
  const encontrados = new Set();
  const patron =
    /(?:\/_next\/)?static\/[^"'\s<>\\]+?\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|ico|json)(?![\w])/g;
  for (const m of html.matchAll(patron)) {
    const ruta = m[0].startsWith('/_next/') ? m[0] : `/_next/${m[0]}`;
    encontrados.add(claveDe(ruta));
  }
  return [...encontrados];
}

function abrirCache() {
  return conLimite('caches.open', MS_LIMITE_PRECACHE, () => caches.open(CACHE));
}

/** Guarda un archivo tal cual. Rechaza si no se pudo. */
function guardarRecurso(cache, ruta) {
  const url = claveDe(ruta);
  return conLimite(url, MS_LIMITE_PRECACHE, async (signal) => {
    if (await cache.match(url)) return;
    const res = await fetch(url, { signal });
    if (!esGuardable(res)) throw new Error(`${url}: ${motivoNoGuardable(res)}`);
    await cache.put(url, res);
  });
}

/**
 * Guarda una página por su ruta, sin la query.
 * @param forzar la vuelve a pedir aunque haya copia. La copia solo se
 *   reemplaza si la red responde bien: sin señal se queda la que había.
 * @return los /_next/static que usa, para guardarlos después.
 */
function guardarPagina(cache, ruta, forzar = false) {
  return conLimite(ruta, MS_LIMITE_PRECACHE, async (signal) => {
    if (!forzar && (await cache.match(ruta))) return [];
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
  log('precalentar: inicio,', rutas.length, 'páginas y', extras.length, 'archivos');
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

// ── Lo que sobrevive a las versiones ──────────────

async function recordarRutas(rutas) {
  try {
    const meta = await conLimite('rw-meta', MS_LIMITE_PRECACHE, () => caches.open(CACHE_META));
    await meta.put(
      CLAVE_RUTAS,
      new Response(JSON.stringify(rutas), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch (e) {
    aviso('no se pudo recordar la lista de páginas:', e?.message || e);
  }
}

async function rutasRecordadas() {
  try {
    const meta = await caches.open(CACHE_META);
    const res = await meta.match(CLAVE_RUTAS);
    if (!res) return [];
    const rutas = await res.json();
    return Array.isArray(rutas)
      ? rutas.filter((r) => typeof r === 'string' && r.startsWith('/'))
      : [];
  } catch {
    return [];
  }
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

/** Las páginas que vale la pena llevar de una versión a la siguiente. */
function esPaginaCopiable(ruta) {
  return ruta === '/hoy' || ruta.startsWith('/local/') || ruta.startsWith('/visita/');
}

/**
 * Copia de las cachés viejas a la nueva, sin tocar la red:
 * - las páginas que el CAP tenía sin señal, con los /_next/static que
 *   nombran: son de la versión vieja, y sin ellos la página vieja daría
 *   ChunkLoadError. Sirven hasta que haya señal y se reemplacen;
 * - los archivos de esta versión que ya estaban: los nombres llevan
 *   hash, así que los chunks que no cambiaron no hay que volver a bajarlos.
 */
async function copiarDeViejas(nueva, viejas) {
  for (const nombre of viejas) {
    try {
      const vieja = await caches.open(nombre);
      const recursos = new Set(RECURSOS_APP);
      let copiadas = 0;

      for (const peticion of await vieja.keys()) {
        const ruta = new URL(peticion.url).pathname;
        if (!esPaginaCopiable(ruta) || (await nueva.match(ruta))) continue;
        const res = await vieja.match(peticion);
        if (!res) continue;
        const html = await res.text();
        await nueva.put(
          ruta,
          new Response(html, { status: res.status, statusText: res.statusText, headers: res.headers }),
        );
        recursosDe(html).forEach((u) => recursos.add(u));
        copiadas++;
      }

      for (const u of recursos) {
        if (await nueva.match(u)) continue;
        const res = await vieja.match(u);
        if (res) await nueva.put(u, res);
      }
      log(`activate: copiadas ${copiadas} páginas de ${nombre}`);
    } catch (e) {
      aviso(`activate: no se pudo copiar de ${nombre}:`, e?.message || e);
    }
  }
}

// ── Puesta al día, después de activarse ───────────

/** La que está en curso: nunca van dos a la vez. */
let puestaAlDia = null;

/**
 * Descarga lo que falte para trabajar sin señal: los archivos de esta
 * versión, las pantallas base y las paradas que recordaba rw-meta. De 4
 * en 4 y con 10 s por archivo. Nunca rechaza.
 * @param refrescar vuelve a pedir el HTML aunque haya copia: tras
 *   activarse, la copia es de la versión vieja. Sin señal se queda.
 */
function ponerAlDia({ refrescar }) {
  if (puestaAlDia) return puestaAlDia;
  puestaAlDia = (async () => {
    log('puesta al día: inicio', refrescar ? '(tras activarse)' : '(retomando)');
    try {
      const cache = await abrirCache();

      const archivos = [...EXTRAS, ...RECURSOS_APP];
      const ra = await enLotes(archivos, EN_PARALELO, (u) => guardarRecurso(cache, u));
      log(`puesta al día: archivos ${ra.filter((r) => r.ok).length}/${archivos.length}`);

      const rutas = await rutasRecordadas();
      const paginas = [...new Set([...PAGINAS_BASE, ...rutas])];
      const rp = await enLotes(paginas, EN_PARALELO, (r) => guardarPagina(cache, r, refrescar));
      log(
        `puesta al día: páginas ${rp.filter((r) => r.ok).length}/${paginas.length}`,
        `(${rutas.length} paradas recordadas)`,
      );

      // Los recursos que nombran (en desarrollo RECURSOS_APP va vacía).
      const nombrados = new Set();
      rp.forEach((r) => r.ok && r.valor.forEach((u) => nombrados.add(u)));
      await enLotes([...nombrados], EN_PARALELO, (u) => guardarRecurso(cache, u));
    } catch (e) {
      aviso('puesta al día: falló', e?.message || e);
    }
    log('puesta al día: listo');
  })().finally(() => {
    puestaAlDia = null;
  });
  return puestaAlDia;
}

/**
 * Mientras haya una puesta al día en curso, cada evento que llega la
 * mantiene viva: sin esto el navegador podría dormir el service worker
 * a mitad de las descargas.
 */
function mantenerVivo(event) {
  if (puestaAlDia && typeof event.waitUntil === 'function') event.waitUntil(puestaAlDia);
}

async function activar() {
  const claves = await caches.keys();
  // Incluye las de versiones viejas, como rewards-v3-assets.
  const viejas = claves.filter((k) => k.startsWith('rewards-') && k !== CACHE);

  // Solo local: nada de red aquí, o la app esperaría a la señal.
  try {
    await conLimite('activate', MS_LIMITE_ACTIVACION, async () =>
      copiarDeViejas(await caches.open(CACHE), viejas),
    );
  } catch (e) {
    aviso('activate: la copia no terminó a tiempo, se sigue igual:', e?.message || e);
  }

  await Promise.all(viejas.map((k) => caches.delete(k)));
  if (viejas.length) log('activate: borradas', viejas.join(', '));
  await self.clients.claim();
  log('activate: listo, controla las pestañas');

  // Las descargas, sin retener la activación.
  ponerAlDia({ refrescar: true });
}

self.addEventListener('activate', (event) => {
  log('activate: inicio');
  event.waitUntil(activar());
});

self.addEventListener('message', (event) => {
  mantenerVivo(event);
  const datos = event.data || {};

  // Perfil pregunta qué versión está corriendo. Contesta por el canal
  // que trae el mensaje.
  if (datos.tipo === 'VERSION') {
    event.ports?.[0]?.postMessage({ version: VERSION });
    return;
  }

  // El CAP tocó "Actualizar".
  if (datos.tipo === 'SALTAR_ESPERA') {
    log('mensaje: SALTAR_ESPERA');
    self.skipWaiting();
    return;
  }

  // La página ya cargó, una vez por sesión. Retoma la puesta al día por
  // si el navegador durmió al service worker a medias: lo ya guardado no
  // se vuelve a bajar.
  if (datos.tipo === 'PRECALENTAR_BASE') {
    log('mensaje: PRECALENTAR_BASE');
    event.waitUntil(ponerAlDia({ refrescar: false }));
    return;
  }

  // Hoy manda las páginas de las paradas del día para que abran sin señal.
  // La lista se recuerda para volver a guardarla al activar otra versión.
  if (datos.tipo === 'precalentar' && Array.isArray(datos.rutas)) {
    const rutas = datos.rutas.filter((r) => typeof r === 'string' && r.startsWith('/'));
    log('mensaje: precalentar', rutas.length, 'rutas');
    event.waitUntil(Promise.all([recordarRutas(rutas), precalentar(rutas)]));
  }
});

// ── Peticiones ────────────────────────────────────

self.addEventListener('fetch', (event) => {
  mantenerVivo(event);
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.hostname === SERVIDOR_MOSAICOS) {
    event.respondWith(mosaico(request));
    return;
  }
  if (url.hostname === SERVIDOR_AVATAR && url.pathname === '/thumbnail') {
    event.respondWith(avatar(event));
    return;
  }
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

// ── Mosaicos del mapa ─────────────────────────────

/**
 * Primero la copia si tiene menos de 7 días; si no, la red, y si falla,
 * la copia vieja. Solo se guardan respuestas CORS con 200: una opaca no
 * se puede comprobar y el navegador la cuenta como varios MB de cuota.
 */
async function mosaico(request) {
  const cache = await caches.open(CACHE_MOSAICOS);
  const guardado = await cache.match(request);
  const edad = Date.now() - Number(guardado?.headers.get(CABECERA_GUARDADO) || 0);
  if (guardado && edad < MS_MOSAICO_FRESCO) return guardado;

  try {
    const res = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
    if (res.status !== 200 || res.type !== 'cors') return res;
    const cuerpo = await res.blob();
    const cabeceras = new Headers(res.headers);
    cabeceras.set(CABECERA_GUARDADO, String(Date.now()));
    await cache.put(request.url, new Response(cuerpo, { status: 200, headers: cabeceras }));
    recortarMosaicos(cache);
    return new Response(cuerpo, { status: 200, headers: res.headers });
  } catch {
    return guardado || Response.error();
  }
}

let recortando = null;

/** Deja solo los MAX_MOSAICOS más nuevos: la caché los lista por orden de entrada. */
function recortarMosaicos(cache) {
  recortando ||= (async () => {
    try {
      const claves = await cache.keys();
      const sobran = claves.slice(0, Math.max(0, claves.length - MAX_MOSAICOS));
      for (const k of sobran) await cache.delete(k);
    } catch (e) {
      aviso('no se pudieron recortar los mosaicos', e);
    } finally {
      recortando = null;
    }
  })();
  return recortando;
}

// ── Foto de perfil ────────────────────────────────

/**
 * Primero la copia, y se renueva por detrás (por si el admin cambió la
 * foto); sin copia, la red. Drive no manda CORS: la respuesta llega opaca
 * y se guarda así (la imagen la puede mostrar igual). Sin señal y sin
 * copia, falla, y la página enseña las iniciales.
 */
async function avatar(event) {
  const url = event.request.url;
  const cache = await caches.open(CACHE_AVATAR);
  const guardada = await cache.match(url);
  const renovar = (async () => {
    const res = await fetch(url, { mode: 'no-cors', credentials: 'omit' });
    if (res.type === 'opaque' || res.status === 200) {
      await cache.put(url, res.clone());
      const claves = await cache.keys();
      for (const k of claves.slice(0, Math.max(0, claves.length - MAX_AVATARES))) await cache.delete(k);
    }
    return res;
  })();
  if (guardada) {
    const enSegundoPlano = renovar.catch(() => {});
    if (typeof event.waitUntil === 'function') event.waitUntil(enSegundoPlano);
    return guardada;
  }
  try {
    return await renovar;
  } catch {
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
        // El service worker no puede leer la apariencia elegida en Perfil:
        // aquí manda la del sistema.
        '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">' +
          '<meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<meta name="color-scheme" content="light dark">' +
          '<title>Sin conexión</title><style>' +
          'body{font-family:-apple-system,sans-serif;text-align:center;padding:48px 24px;margin:0;background:#f4f6fb;color:#0f172a}' +
          'h1{font-size:18px}p{color:#64748b;font-size:14px}' +
          'button{margin-top:20px;padding:12px 24px;border:0;border-radius:14px;background:#3d35c8;color:#fff;font-size:14px}' +
          '@media (prefers-color-scheme:dark){body{background:#000;color:#fff}p{color:rgba(235,235,245,.6)}}' +
          '</style></head><body>' +
          '<h1>Sin conexión</h1>' +
          '<p>Revisa tu señal e intenta de nuevo.</p>' +
          '<button onclick="location.reload()">Reintentar</button>' +
          '</body></html>',
        { headers: { 'Content-Type': 'text/html;charset=utf-8' } },
      )
    );
  }
}
