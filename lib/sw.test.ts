// ══════════════════════════════════════════════════
//  Pruebas del service worker (lib/sw/sw.js)
//
//  Lo que se fija aquí es el fallo de "trying to install"
//  para siempre: ningún fetch, lectura o cache.put que no
//  termine puede dejar la instalación colgada.
//
//  El script se carga en un contexto de node:vm con
//  self, caches y fetch de mentira, y un reloj falso.
// ══════════════════════════════════════════════════

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import vm from 'node:vm';

import { GET } from '../app/sw.js/route.ts';
import { listarRecursosEstaticos } from './sw/recursos.ts';

const CODIGO = readFileSync(join(process.cwd(), 'lib', 'sw', 'sw.js'), 'utf8');
const MS_LIMITE = 10_000;

const CRITICOS = [
  '/offline',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
];

// ── Navegador de mentira ──────────────────────────

interface RespuestaFalsa {
  status: number;
  statusText: string;
  type: string;
  redirected: boolean;
  headers: Headers;
  text: () => Promise<string>;
}

function respuesta(cuerpo = 'ok', campos: Partial<RespuestaFalsa> = {}): RespuestaFalsa {
  return {
    status: 200,
    statusText: 'OK',
    type: 'basic',
    redirected: false,
    headers: new Headers(),
    text: async () => cuerpo,
    ...campos,
  };
}

/** Una promesa que no se resuelve nunca, ni con el aborto. */
const nunca = () => new Promise<never>(() => {});

type Fetch = (url: string) => Promise<unknown>;

/**
 * @param recursosApp la lista que pondría el build en RECURSOS_APP.
 * @param opciones.version la VERSION que pondría el build.
 * @param opciones.caches compartirlas entre dos montajes simula una
 *   actualización: la versión nueva encuentra lo que dejó la vieja.
 */
function montarSw(
  fetchFalso: Fetch,
  recursosApp: string[] = [],
  {
    version = '__VERSION__',
    caches = new Map<string, Map<string, unknown>>(),
  }: { version?: string; caches?: Map<string, Map<string, unknown>> } = {},
) {
  const oyentes = new Map<string, (e: unknown) => void>();
  const pedidos: string[] = [];
  let reclamado = false;

  const cacheStorage = {
    async open(nombre: string) {
      if (!caches.has(nombre)) caches.set(nombre, new Map());
      const c = caches.get(nombre)!;
      // Como la Cache API: una petición se busca por su URL, sin el origen.
      const clave = (k: string | { url: string }) =>
        typeof k === 'string' ? k : new URL(k.url).pathname;
      return {
        match: async (k: string | { url: string }) => c.get(clave(k)),
        put: async (k: string | { url: string }, v: unknown) => void c.set(clave(k), v),
        keys: async () => [...c.keys()].map((k) => ({ url: `http://localhost${k}` })),
      };
    },
    keys: async () => [...caches.keys()],
    delete: async (k: string) => caches.delete(k),
  };

  const contexto = vm.createContext({
    self: {
      addEventListener: (tipo: string, fn: (e: unknown) => void) => oyentes.set(tipo, fn),
      location: { origin: 'http://localhost' },
      clients: { claim: async () => void (reclamado = true) },
      skipWaiting: () => {},
    },
    caches: cacheStorage,
    fetch: (url: string) => {
      pedidos.push(String(url));
      return fetchFalso(String(url));
    },
    // El reloj de mentira de node:test reemplaza los globales: se leen
    // en cada llamada para usar siempre los de la prueba en curso.
    setTimeout: (...a: Parameters<typeof setTimeout>) => setTimeout(...a),
    clearTimeout: (t: ReturnType<typeof setTimeout>) => clearTimeout(t),
    console: { log: () => {}, warn: () => {} },
    AbortController,
    Response,
    Headers,
    URL,
  });
  vm.runInContext(
    CODIGO.replace("'__VERSION__'", JSON.stringify(version)).replace(
      '[] /* __RECURSOS_APP__ */',
      JSON.stringify(recursosApp),
    ),
    contexto,
  );

  /** Lanza un evento y devuelve lo que se pasó a waitUntil, con su estado. */
  function lanzar(tipo: string, extra: Record<string, unknown> = {}) {
    let promesa: Promise<unknown> = Promise.resolve();
    oyentes.get(tipo)!({ ...extra, waitUntil: (p: Promise<unknown>) => (promesa = p) });
    const estado = { terminada: false, error: null as unknown };
    promesa.then(
      () => void (estado.terminada = true),
      (e) => {
        estado.terminada = true;
        estado.error = e;
      },
    );
    return estado;
  }

  /** Una petición del navegador: devuelve lo que respondió el service worker. */
  async function pedir(url: string, mode = 'no-cors') {
    let respuesta: Promise<unknown> | undefined;
    oyentes.get('fetch')!({
      request: { method: 'GET', url: `http://localhost${url}`, mode, headers: new Headers() },
      respondWith: (r: Promise<unknown>) => (respuesta = r),
    });
    return respuesta ? await respuesta : undefined;
  }

  return {
    lanzar,
    pedir,
    caches,
    /** La caché de esta versión. */
    cache: () => caches.get(`rewards-${version}`)!,
    pedidos,
    reclamado: () => reclamado,
    /** Las funciones del script, para probarlas sueltas. */
    // Los arrays del contexto de vm tienen otro prototipo: se copian.
    sw: {
      recursosDe: (html: string): string[] => [...contexto.recursosDe(html)],
      claveDe: (ruta: string): string => contexto.claveDe(ruta),
    },
  };
}

/** Deja correr las promesas pendientes, sin mover el reloj. */
async function soltar(vueltas = 30) {
  for (let i = 0; i < vueltas; i++) await new Promise((r) => setImmediate(r));
}

/** Avanza el reloj de mentira y deja correr lo que despierte. */
async function avanzar(ms: number) {
  await soltar();
  mock.timers.tick(ms);
  await soltar();
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

// ══════════════════════════════════════════════════
describe('instalación', () => {
  // El fallo que se corrige: "trying to install" durante minutos.
  test('un fetch que nunca responde no la deja colgada', async () => {
    const sw = montarSw(nunca);
    const install = sw.lanzar('install');

    await soltar();
    assert.equal(install.terminada, false, 'todavía dentro del límite');

    await avanzar(MS_LIMITE);
    assert.equal(install.terminada, true, 'tiene que terminar al vencer el límite');
    assert.match(String((install.error as Error)?.message), /faltan/);
  });

  test('con lo crítico disponible termina bien, aunque las pantallas no respondan', async () => {
    const sw = montarSw(async (url) =>
      CRITICOS.includes(url) ? respuesta() : nunca(),
    );
    const install = sw.lanzar('install');

    await soltar();
    assert.equal(install.terminada, true);
    assert.equal(install.error, null);
  });

  test('solo pide lo crítico: las pantallas y /_next/static van después', async () => {
    const sw = montarSw(async () => respuesta());
    sw.lanzar('install');
    await soltar();

    assert.deepEqual([...sw.pedidos].sort(), [...CRITICOS].sort());
    const cache = sw.cache();
    assert.deepEqual([...cache.keys()].sort(), [...CRITICOS].sort());
  });

  // La protección de despliegue de Vercel redirige: eso no se guarda.
  test('un crítico redirigido no se guarda y la instalación falla', async () => {
    const sw = montarSw(async (url) =>
      url === '/offline' ? respuesta('login', { redirected: true }) : respuesta(),
    );
    const install = sw.lanzar('install');
    await soltar();

    assert.equal(install.terminada, true);
    assert.match(String((install.error as Error)?.message), /\/offline/);
    const cache = sw.cache();
    assert.equal(cache.has('/offline'), false);
  });

  test('un crítico con error tampoco se guarda', async () => {
    const sw = montarSw(async (url) =>
      url === '/icon-192.png' ? respuesta('', { status: 404 }) : respuesta(),
    );
    const install = sw.lanzar('install');
    await soltar();
    assert.match(String((install.error as Error)?.message), /icon-192/);
  });
});

describe('activación', () => {
  test('borra las cachés viejas y toma el control', async () => {
    const sw = montarSw(async () => respuesta());
    sw.caches.set('rewards-v3-assets', new Map());
    sw.caches.set('rewards-otra-version', new Map());
    sw.caches.set('de-otra-app', new Map());

    const activate = sw.lanzar('activate');
    await soltar();

    assert.equal(activate.terminada, true);
    assert.equal(sw.caches.has('rewards-v3-assets'), false);
    assert.equal(sw.caches.has('rewards-otra-version'), false);
    assert.equal(sw.caches.has('de-otra-app'), true, 'lo ajeno no se toca');
    assert.equal(sw.reclamado(), true);
  });
});

describe('guardar las pantallas después de activarse', () => {
  test('con fetch colgado, termina igual al vencer los límites', async () => {
    const sw = montarSw(nunca);
    const tarea = sw.lanzar('message', { data: { tipo: 'PRECALENTAR_BASE' } });

    // 5 pantallas de 4 en 4, y luego el logo: tres tandas de límites.
    for (let i = 0; i < 4 && !tarea.terminada; i++) await avanzar(MS_LIMITE);

    assert.equal(tarea.terminada, true);
    assert.equal(tarea.error, null, 'lo que se pueda: nunca falla');
  });

  test('guarda las páginas y los /_next/static que usan', async () => {
    const html = '<script src="/_next/static/chunks/app-1.js"></script>' +
      '<link href="/_next/static/css/a.css" rel="stylesheet">';
    const sw = montarSw(async (url) => respuesta(url === '/hoy' ? html : ''));

    const tarea = sw.lanzar('message', { data: { tipo: 'precalentar', rutas: ['/hoy'] } });
    await soltar();

    assert.equal(tarea.terminada, true);
    const cache = sw.cache();
    assert.ok(cache.has('/hoy'));
    assert.ok(cache.has('/_next/static/chunks/app-1.js'));
    assert.ok(cache.has('/_next/static/css/a.css'));
  });

  test('no descarga más de 4 cosas a la vez', async () => {
    let enCurso = 0;
    let maximo = 0;
    const sw = montarSw(async () => {
      enCurso++;
      maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setImmediate(r));
      enCurso--;
      return respuesta();
    });
    const rutas = Array.from({ length: 12 }, (_, i) => `/local/PC-${i}`);
    sw.lanzar('message', { data: { tipo: 'precalentar', rutas } });
    await soltar(100);

    assert.ok(maximo <= 4, `llegó a ${maximo} a la vez`);
  });

  test('ignora rutas que no son de la app', async () => {
    const sw = montarSw(async () => respuesta());
    sw.lanzar('message', {
      data: { tipo: 'precalentar', rutas: ['https://otro.com/x', 42, '/hoy'] },
    });
    await soltar();
    assert.deepEqual(sw.pedidos, ['/hoy']);
  });
});

// ══════════════════════════════════════════════════
describe('lo que sirve /sw.js', () => {
  test('es JavaScript válido y lleva la versión puesta', async () => {
    const codigo = await GET().text();

    assert.doesNotThrow(() => new vm.Script(codigo));
    assert.equal(codigo.includes("'__VERSION__'"), false);
    assert.match(codigo, /const VERSION = "[^"]+";/);
    assert.match(codigo, /const RECURSOS_APP = \[[^\]]*\];/);
    assert.equal(codigo.includes('__RECURSOS_APP__'), false);
  });

  test('se sirve como JavaScript', () => {
    assert.match(GET().headers.get('Content-Type') || '', /javascript/);
  });
});

// ══════════════════════════════════════════════════
describe('rutas de los chunks', () => {
  const VISITA = '/_next/static/chunks/app/(app)/visita/%5Bid%5D/page-aea1f8ab5aad3f12.js';

  // El fallo que se corrige: se cortaba en el primer ")" y quedaba
  // "/_next/static/chunks/app/(app", así que el chunk nunca se guardaba.
  test('recursosDe saca la ruta completa con (app) y %5Bid%5D', () => {
    const { sw } = montarSw(async () => respuesta());
    const html = `<script src="${VISITA}" async=""></script>`;
    assert.deepEqual(sw.recursosDe(html), [VISITA]);
  });

  test('también las que vienen en los datos RSC, sin /_next/', () => {
    const { sw } = montarSw(async () => respuesta());
    const html =
      '<script>self.__next_f.push([1,"3:I[\\"static/chunks/app/(app)/hoy/page-42f2.js\\",' +
      '\\"static/chunks/app/(app)/layout-e66a.js\\"]"])</script>';
    assert.deepEqual(sw.recursosDe(html).sort(), [
      '/_next/static/chunks/app/(app)/hoy/page-42f2.js',
      '/_next/static/chunks/app/(app)/layout-e66a.js',
    ]);
  });

  test('un url(...) de CSS no se lleva el paréntesis', () => {
    const { sw } = montarSw(async () => respuesta());
    const html = '<style>@font-face{src:url(/_next/static/media/inter.woff2) format("woff2")}</style>';
    assert.deepEqual(sw.recursosDe(html), ['/_next/static/media/inter.woff2']);
  });

  test('no repite la misma ruta', () => {
    const { sw } = montarSw(async () => respuesta());
    const html = `<link rel="preload" href="${VISITA}"><script src="${VISITA}"></script>`;
    assert.equal(sw.recursosDe(html).length, 1);
  });

  // El manifest de Next escribe [id]; el navegador pide %5Bid%5D.
  test('[id] y %5Bid%5D dan la misma clave, la que pide el navegador', () => {
    const { sw } = montarSw(async () => respuesta());
    const conCorchetes = '/_next/static/chunks/app/(app)/visita/[id]/page-aea1f8ab5aad3f12.js';
    assert.equal(sw.claveDe(conCorchetes), VISITA);
    assert.equal(sw.claveDe(VISITA), VISITA);
  });

  test('un % suelto no revienta', () => {
    const { sw } = montarSw(async () => respuesta());
    assert.equal(sw.claveDe('/_next/static/x%zz.js'), '/_next/static/x%zz.js');
  });

  test('la petición del navegador encuentra lo guardado', async () => {
    const html = `<script src="${VISITA}"></script>`;
    let conRed = true;
    const sw = montarSw(async (url) => {
      if (!conRed) throw new TypeError('Failed to fetch');
      return respuesta(url === '/visita/PC-1' ? html : 'codigo');
    });

    sw.lanzar('message', { data: { tipo: 'precalentar', rutas: ['/visita/PC-1'] } });
    await soltar();

    conRed = false;
    const r = (await sw.pedir(VISITA)) as RespuestaFalsa;
    assert.equal(await r.text(), 'codigo');
  });
});

// ══════════════════════════════════════════════════
describe('todos los chunks del build', () => {
  const VISITA = '/_next/static/chunks/app/(app)/visita/%5Bid%5D/page-aea1.js';
  const LOCAL = '/_next/static/chunks/app/(app)/local/%5Bid%5D/page-836d.js';

  test('listarRecursosEstaticos recorre .next/static con las claves del navegador', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'rw-static-'));
    try {
      const archivo = (rel: string) => {
        const completo = join(raiz, ...rel.split('/'));
        mkdirSync(join(completo, '..'), { recursive: true });
        writeFileSync(completo, 'x');
      };
      archivo('chunks/app/(app)/visita/[id]/page-aea1.js');
      archivo('chunks/app/(app)/hoy/page-42f2.js');
      archivo('chunks/646.f342.js'); // los que se cargan bajo demanda también
      archivo('css/4c61.css');
      archivo('chunks/pages/_app-1.js'); // router de páginas: fuera
      archivo('t8QJ/_buildManifest.js'); // fuera de chunks/css/media

      assert.deepEqual(listarRecursosEstaticos(raiz), [
        '/_next/static/chunks/646.f342.js',
        '/_next/static/chunks/app/(app)/hoy/page-42f2.js',
        '/_next/static/chunks/app/(app)/visita/%5Bid%5D/page-aea1.js',
        '/_next/static/css/4c61.css',
      ]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  test('sin .next/static devuelve una lista vacía', () => {
    assert.deepEqual(listarRecursosEstaticos(join(tmpdir(), 'no-existe-rw')), []);
  });

  // Punto 5: el registro abre sin señal aunque el CAP nunca haya entrado
  // a esa pantalla con señal. El HTML de la parada NO nombra el chunk:
  // tiene que venir de la lista del build.
  test('el registro abre sin señal sin haberlo visitado antes', async () => {
    let conRed = true;
    const sw = montarSw(async (url) => {
      if (!conRed) throw new TypeError('Failed to fetch');
      if (url === '/visita/PC-1') return respuesta('<html>registro</html>');
      return respuesta(`contenido de ${url}`);
    }, [VISITA, LOCAL]);

    // Con señal: lo que pasa al abrir Hoy, sin tocar ninguna parada.
    const base = sw.lanzar('message', { data: { tipo: 'PRECALENTAR_BASE' } });
    const paradas = sw.lanzar('message', { data: { tipo: 'precalentar', rutas: ['/visita/PC-1'] } });
    await soltar(100);
    assert.equal(base.terminada && paradas.terminada, true);

    // Sin señal: la página y su chunk salen de la caché.
    conRed = false;
    const pagina = (await sw.pedir('/visita/PC-1', 'navigate')) as RespuestaFalsa;
    assert.match(await pagina.text(), /registro/);

    const chunk = (await sw.pedir(VISITA)) as RespuestaFalsa;
    assert.equal(await chunk.text(), `contenido de ${VISITA}`);
    const chunkLocal = (await sw.pedir(LOCAL)) as RespuestaFalsa;
    assert.equal(await chunkLocal.text(), `contenido de ${LOCAL}`);
  });
});

// ══════════════════════════════════════════════════
describe('actualizar sin perder lo guardado', () => {
  const CHUNK = {
    A: '/_next/static/chunks/app/(app)/local/%5Bid%5D/page-aaaa.js',
    B: '/_next/static/chunks/app/(app)/local/%5Bid%5D/page-bbbb.js',
  };
  const PARADAS = ['/local/PC-0737', '/visita/PC-0737'];

  /** Un servidor que sirve la versión que toque, o nada si no hay señal. */
  function servidor() {
    const estado = { version: 'A' as 'A' | 'B', conRed: true, colgado: false };
    const fetch = async (url: string) => {
      if (estado.colgado) return nunca();
      if (!estado.conRed) throw new TypeError('Failed to fetch');
      const v = estado.version;
      if (url.startsWith('/_next/')) return respuesta(`codigo de ${url}`);
      if (url.startsWith('/local/') || url.startsWith('/visita/') || url === '/hoy') {
        return respuesta(`<html>pagina ${v}<script src="${CHUNK[v]}"></script></html>`);
      }
      return respuesta(`archivo ${v}`);
    };
    return { estado, fetch };
  }

  /** La versión A instalada, activa y con las paradas precalentadas. */
  async function versionAConTodo() {
    const caches = new Map<string, Map<string, unknown>>();
    const srv = servidor();
    const a = montarSw(srv.fetch, [CHUNK.A], { version: 'A', caches });
    a.lanzar('install');
    await soltar();
    a.lanzar('activate');
    await soltar(100);
    a.lanzar('message', { data: { tipo: 'precalentar', rutas: PARADAS } });
    await soltar(100);
    assert.ok(a.cache().has('/local/PC-0737'), 'A tenía la parada guardada');
    return { caches, srv };
  }

  async function textoDe(r: unknown) {
    return (r as RespuestaFalsa).text();
  }

  // Tu punto 3: A con todo → se instala B → activate → sin señal.
  test('con señal al activar, sin señal después abre todo con la versión B', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    const b = montarSw(srv.fetch, [CHUNK.B], { version: 'B', caches });
    b.lanzar('install');
    await soltar();
    const activate = b.lanzar('activate');
    await soltar(200);
    assert.equal(activate.terminada, true);

    srv.estado.conRed = false;
    for (const ruta of ['/hoy', ...PARADAS]) {
      assert.match(await textoDe(await b.pedir(ruta, 'navigate')), /pagina B/, ruta);
    }
    assert.equal(await textoDe(await b.pedir(CHUNK.B)), `codigo de ${CHUNK.B}`);
    assert.equal(caches.has('rewards-A'), false, 'la caché de A ya se borró');
  });

  // Sin señal al activar: la copia de A sirve, con SUS chunks.
  test('sin señal al activar, las páginas de A siguen abriendo con sus chunks', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    srv.estado.conRed = false;
    const b = montarSw(srv.fetch, [CHUNK.B], { version: 'B', caches });
    const activate = b.lanzar('activate');
    await soltar(200);
    assert.equal(activate.terminada, true);

    assert.match(await textoDe(await b.pedir('/local/PC-0737', 'navigate')), /pagina A/);
    assert.equal(await textoDe(await b.pedir(CHUNK.A)), `codigo de ${CHUNK.A}`);
    assert.equal(caches.has('rewards-A'), false);
  });

  test('la caché vieja no se borra antes de terminar la copia', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    srv.estado.colgado = true;
    const b = montarSw(srv.fetch, [CHUNK.B], { version: 'B', caches });
    const activate = b.lanzar('activate');

    await soltar(100);
    assert.equal(activate.terminada, false, 'sigue guardando');
    assert.equal(caches.has('rewards-A'), true, 'A sigue ahí mientras tanto');

    // Cada descarga colgada se corta a los 10 s; el tope total es de 45 s.
    for (let i = 0; i < 6 && !activate.terminada; i++) await avanzar(MS_LIMITE);
    assert.equal(activate.terminada, true);
    assert.equal(caches.has('rewards-A'), false);
  });

  // Sin que la página mande nada: el service worker se acuerda.
  test('recuerda las paradas y las vuelve a pedir al activarse', async () => {
    const { caches, srv } = await versionAConTodo();
    assert.ok(caches.has('rw-meta'));

    srv.estado.version = 'B';
    const b = montarSw(srv.fetch, [CHUNK.B], { version: 'B', caches });
    b.lanzar('activate');
    await soltar(200);

    for (const ruta of PARADAS) assert.ok(b.pedidos.includes(ruta), `pidió ${ruta}`);
    assert.ok(caches.has('rw-meta'), 'la memoria sobrevive a la limpieza');
  });
});
