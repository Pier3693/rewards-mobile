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
      const clave = (k: string | { url: string }) => {
        const u = typeof k === 'string' ? k : k.url;
        return u.startsWith('http') ? new URL(u).pathname : u;
      };
      return {
        match: async (k: string | { url: string }) => c.get(clave(k)),
        // Como la Cache API: volver a guardar algo lo pone al final.
        put: async (k: string | { url: string }, v: unknown) => {
          c.delete(clave(k));
          c.set(clave(k), v);
        },
        delete: async (k: string | { url: string }) => c.delete(clave(k)),
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

  /** Cuántas veces un evento pidió que lo mantuvieran vivo. */
  let mantenidoVivo = 0;

  /** Una petición del navegador: devuelve lo que respondió el service worker. */
  async function pedir(url: string, mode = 'no-cors') {
    let respuesta: Promise<unknown> | undefined;
    const completa = url.startsWith('http') ? url : `http://localhost${url}`;
    oyentes.get('fetch')!({
      request: { method: 'GET', url: completa, mode, headers: new Headers() },
      respondWith: (r: Promise<unknown>) => (respuesta = r),
      waitUntil: () => void mantenidoVivo++,
    });
    return respuesta ? await respuesta : undefined;
  }

  return {
    lanzar,
    pedir,
    caches,
    mantenidoVivo: () => mantenidoVivo,
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
describe('la versión', () => {
  // Perfil la muestra: el service worker contesta por el canal del mensaje.
  test('contesta su versión por el canal del mensaje', async () => {
    const sw = montarSw(async () => respuesta(), [], { version: 'abc123' });
    const recibidos: unknown[] = [];
    sw.lanzar('message', {
      data: { tipo: 'VERSION' },
      ports: [{ postMessage: (m: unknown) => recibidos.push(m) }],
    });
    await soltar();
    assert.equal(recibidos.length, 1);
    assert.equal((recibidos[0] as { version: string }).version, 'abc123');
  });

  test('sin canal no revienta', async () => {
    const sw = montarSw(async () => respuesta());
    assert.doesNotThrow(() => sw.lanzar('message', { data: { tipo: 'VERSION' } }));
  });
});

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
  /** Lleva hash: si no cambió, A y B lo comparten. */
  const COMUN = '/_next/static/chunks/255-comun.js';
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
    const a = montarSw(srv.fetch, [CHUNK.A, COMUN], { version: 'A', caches });
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

  // Con señal, todo lo de B llega DESPUÉS de activarse, sin que la
  // página mande nada.
  test('con señal, tras activar se guardan los archivos de B y las paradas', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    const b = montarSw(srv.fetch, [CHUNK.B, COMUN], { version: 'B', caches });
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
  test('sin señal tras activar, las páginas de A abren con sus chunks de A', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    srv.estado.conRed = false;
    const b = montarSw(srv.fetch, [CHUNK.B, COMUN], { version: 'B', caches });
    const activate = b.lanzar('activate');
    await soltar(200);
    assert.equal(activate.terminada, true);

    assert.match(await textoDe(await b.pedir('/local/PC-0737', 'navigate')), /pagina A/);
    assert.equal(await textoDe(await b.pedir(CHUNK.A)), `codigo de ${CHUNK.A}`);
    // El de esta versión que ya tenía A, copiado sin bajarlo.
    assert.equal(await textoDe(await b.pedir(COMUN)), `codigo de ${COMUN}`);
    assert.equal(caches.has('rewards-A'), false);
  });

  // El riesgo que se corrige: mientras se activa, el navegador retiene
  // las peticiones de la app. Con mala señal, la pantalla en blanco.
  test('el activate termina rápido aunque la red no responda', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    srv.estado.colgado = true;
    const b = montarSw(srv.fetch, [CHUNK.B, COMUN], { version: 'B', caches });
    const activate = b.lanzar('activate');

    // Sin mover el reloj: no espera a ninguna descarga.
    await soltar(100);
    assert.equal(activate.terminada, true);
    assert.equal(activate.error, null);
    assert.ok(b.cache().has('/local/PC-0737'), 'ya copió la parada');
    assert.ok(b.cache().has(COMUN), 'y el chunk que no cambió');
    assert.equal(caches.has('rewards-A'), false, 'y borró la vieja');
  });

  test('una navegación durante las descargas no queda retenida', async () => {
    const { caches, srv } = await versionAConTodo();

    srv.estado.version = 'B';
    srv.estado.colgado = true;
    const b = montarSw(srv.fetch, [CHUNK.B, COMUN], { version: 'B', caches });
    b.lanzar('activate');
    await soltar(100);

    // Las descargas siguen colgadas (10 s cada una). La navegación solo
    // espera los 4 s de la red y responde con la copia.
    let respuesta: unknown;
    b.pedir('/local/PC-0737', 'navigate').then((r) => (respuesta = r));
    await soltar();
    assert.equal(respuesta, undefined, 'todavía esperando a la red');

    await avanzar(4000);
    assert.ok(respuesta, 'respondió a los 4 s, sin esperar a las descargas');
    assert.match(await textoDe(respuesta), /pagina A/);
    assert.ok(b.mantenidoVivo() > 0, 'y mantuvo viva la puesta al día');
  });

  // Sin que la página mande nada: el service worker se acuerda.
  test('recuerda las paradas y las vuelve a pedir al activarse', async () => {
    const { caches, srv } = await versionAConTodo();
    assert.ok(caches.has('rw-meta'));

    srv.estado.version = 'B';
    const b = montarSw(srv.fetch, [CHUNK.B, COMUN], { version: 'B', caches });
    b.lanzar('activate');
    await soltar(200);

    for (const ruta of PARADAS) assert.ok(b.pedidos.includes(ruta), `pidió ${ruta}`);
    assert.ok(caches.has('rw-meta'), 'la memoria sobrevive a la limpieza');
  });
});

// ══════════════════════════════════════════════════
describe('mosaicos del mapa', () => {
  const MOSAICO = 'https://tile.openstreetmap.org/15/9372/17000.png';
  const mosaicoN = (n: number) => `https://tile.openstreetmap.org/15/${n}/17000.png`;
  const DIA = 24 * 60 * 60 * 1000;

  function png(campos: Partial<RespuestaFalsa & { blob: () => Promise<Blob> }> = {}) {
    return {
      ...respuesta('png', { type: 'cors', headers: new Headers({ 'content-type': 'image/png' }) }),
      blob: async () => new Blob(['png']),
      ...campos,
    };
  }

  const mosaicos = (sw: ReturnType<typeof montarSw>) => sw.caches.get('rw-mosaicos') ?? new Map();

  test('se guarda el ya visto y sin señal sale de la copia', async () => {
    const estado = { conRed: true };
    const sw = montarSw(async () => {
      if (!estado.conRed) throw new TypeError('Failed to fetch');
      return png();
    });
    const primera = (await sw.pedir(MOSAICO, 'cors')) as Response;
    assert.equal(primera.status, 200);
    await soltar();
    assert.equal(mosaicos(sw).size, 1);

    estado.conRed = false;
    const sinRed = (await sw.pedir(MOSAICO, 'cors')) as Response;
    assert.equal(sinRed.status, 200);
    assert.equal(await sinRed.text(), 'png');
    assert.equal(sw.pedidos.length, 1, 'la copia fresca no vuelve a pedirlo');
  });

  test('con más de 300 se borran los más antiguos', async () => {
    const sw = montarSw(async () => png());
    for (let n = 0; n < 305; n++) {
      await sw.pedir(mosaicoN(n), 'cors');
      await soltar(5);
    }
    await soltar();
    const claves = [...mosaicos(sw).keys()];
    assert.equal(claves.length, 300);
    assert.ok(!claves.includes('/15/0/17000.png'), 'el primero se fue');
    assert.ok(claves.includes('/15/304/17000.png'), 'el último sigue');
  });

  test('uno de más de 7 días se vuelve a pedir; sin señal, sirve el viejo', async () => {
    const estado = { conRed: true };
    const sw = montarSw(async () => {
      if (!estado.conRed) throw new TypeError('Failed to fetch');
      return png({ blob: async () => new Blob(['nuevo']) });
    });
    const viejo = () =>
      new Response('viejo', { headers: { 'x-rw-guardado': String(Date.now() - 8 * DIA) } });
    sw.caches.set('rw-mosaicos', new Map([['/15/9372/17000.png', viejo()]]));

    estado.conRed = false;
    assert.equal(await ((await sw.pedir(MOSAICO, 'cors')) as Response).text(), 'viejo');

    estado.conRed = true;
    assert.equal(await ((await sw.pedir(MOSAICO, 'cors')) as Response).text(), 'nuevo');
    assert.equal(sw.pedidos.length, 2);
  });

  test('una respuesta opaca o con error no se guarda', async () => {
    let siguiente = png({ type: 'opaque', status: 0 });
    const sw = montarSw(async () => siguiente);
    await sw.pedir(mosaicoN(1), 'cors');
    siguiente = png({ status: 404 });
    await sw.pedir(mosaicoN(2), 'cors');
    await soltar();
    assert.equal(mosaicos(sw).size, 0);
  });

  test('otros dominios siguen sin tocarse', async () => {
    const sw = montarSw(async () => png());
    assert.equal(await sw.pedir('https://fonts.example.com/fuente.woff2', 'cors'), undefined);
    assert.equal(sw.pedidos.length, 0);
  });

  test('la copia de mosaicos sobrevive a una actualización', async () => {
    const caches = new Map<string, Map<string, unknown>>();
    caches.set('rw-mosaicos', new Map([['/15/1/1.png', 'x']]));
    caches.set('rewards-vieja', new Map());
    const sw = montarSw(async () => respuesta(), [], { version: 'nueva', caches });
    sw.lanzar('activate');
    await avanzar(10_000);
    assert.ok(caches.has('rw-mosaicos'));
    assert.ok(!caches.has('rewards-vieja'), 'la de la versión vieja sí se borra');
  });
});
