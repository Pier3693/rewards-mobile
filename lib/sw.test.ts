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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { GET } from '../app/sw.js/route.ts';

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

function montarSw(fetchFalso: Fetch) {
  const oyentes = new Map<string, (e: unknown) => void>();
  const caches = new Map<string, Map<string, unknown>>();
  const pedidos: string[] = [];
  let reclamado = false;

  const cacheStorage = {
    async open(nombre: string) {
      if (!caches.has(nombre)) caches.set(nombre, new Map());
      const c = caches.get(nombre)!;
      return {
        match: async (k: string) => c.get(String(k)),
        put: async (k: string, v: unknown) => void c.set(String(k), v),
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
  vm.runInContext(CODIGO, contexto);

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

  return { lanzar, caches, pedidos, reclamado: () => reclamado };
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
    const cache = [...sw.caches.values()][0];
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
    const cache = [...sw.caches.values()][0];
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
    const cache = [...sw.caches.values()][0];
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
  });

  test('se sirve como JavaScript', () => {
    assert.match(GET().headers.get('Content-Type') || '', /javascript/);
  });
});
