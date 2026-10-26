// ══════════════════════════════════════════════════
//  Pruebas del límite de tiempo del cliente del API
//
//  Lo que se fija aquí es el error que dejó el registro
//  colgado en el esqueleto: una petición que nunca
//  responde tiene que terminar igual.
// ══════════════════════════════════════════════════

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  api,
  MS_LIMITE_CARGA,
  MS_LIMITE_GUARDADO,
  MS_LIMITE_POR_DEFECTO,
} from './api.ts';

const fetchReal = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = fetchReal;
});

/** Un fetch que no responde nunca, salvo que lo aborten. */
function fetchQueNoResponde(registro: { abortada: boolean }) {
  return (_url: string, init: { signal: AbortSignal }) =>
    new Promise<Response>((_, rechazar) => {
      init.signal.addEventListener('abort', () => {
        registro.abortada = true;
        const e = new Error('The operation was aborted');
        e.name = 'AbortError';
        rechazar(e);
      });
    });
}

/** Un fetch que responde bien, tras el retraso que se le diga. */
function fetchQueResponde(cuerpo: unknown, msRetraso = 0) {
  return () =>
    new Promise<Response>((resolver) => {
      setTimeout(
        () => resolver({ status: 200, ok: true, json: async () => cuerpo } as Response),
        msRetraso,
      );
    });
}

/**
 * Un fetch que devuelve un estado de error con cuerpo que NO es JSON,
 * como hacen Vercel o Apps Script cuando fallan antes de llegar a
 * nuestro código.
 */
function fetchConEstado(estado: number) {
  return () =>
    Promise.resolve({
      status: estado,
      ok: false,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);
}

describe('límite de tiempo', () => {
  test('una petición que no responde termina igual, no se cuelga', async () => {
    const registro = { abortada: false };
    globalThis.fetch = fetchQueNoResponde(registro) as typeof fetch;

    const inicio = Date.now();
    const r = await api('getAutocompletado', {}, { msLimite: 60 });
    const tardo = Date.now() - inicio;

    assert.equal(r.ok, false);
    assert.match(r.error || '', /tardando demasiado/i);
    assert.ok(tardo < 1000, `tardó ${tardo} ms: debería cortar en 60`);
  });

  test('la petición se cancela de verdad, no sigue consumiendo datos', async () => {
    const registro = { abortada: false };
    globalThis.fetch = fetchQueNoResponde(registro) as typeof fetch;

    await api('getAsignacionesDia', {}, { msLimite: 40 });

    assert.equal(registro.abortada, true);
  });

  test('el mensaje del tiempo agotado se distingue del de red', async () => {
    const registro = { abortada: false };
    globalThis.fetch = fetchQueNoResponde(registro) as typeof fetch;

    const r = await api('ping', {}, { msLimite: 30 });

    assert.match(r.error || '', /tardando demasiado/i);
    assert.doesNotMatch(r.error || '', /sin conexión/i);
  });

  test('una respuesta que llega a tiempo no se corta', async () => {
    globalThis.fetch = fetchQueResponde(
      { ok: true, data: { id_local: 'PC-0123' } },
      20,
    ) as typeof fetch;

    const r = await api<{ id_local: string }>(
      'getAutocompletado',
      {},
      { msLimite: 500 },
    );

    assert.equal(r.ok, true);
    assert.equal(r.data?.id_local, 'PC-0123');
  });

  test('el temporizador se limpia: no aborta nada después de responder', async () => {
    globalThis.fetch = fetchQueResponde({ ok: true, data: 'pong' }) as typeof fetch;

    const r = await api('ping', {}, { msLimite: 50 });
    assert.equal(r.ok, true);

    // Si el temporizador siguiera vivo, saltaría en estos 80 ms. Que el
    // proceso llegue aquí sin ruido es la señal de que se limpió.
    await new Promise((r2) => setTimeout(r2, 80));
    assert.equal(r.ok, true);
  });

  test('un error de red devuelve su propio mensaje', async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;

    const r = await api('ping', {}, { msLimite: 500 });

    assert.equal(r.ok, false);
    assert.match(r.error || '', /no se pudo conectar|sin conexión/i);
    assert.doesNotMatch(r.error || '', /tardando demasiado/i);
  });
});

describe('errores que devuelve la plataforma, no nuestro código', () => {
  // Vercel corta cualquier petición de más de 4.5 MB. lib/img.ts ya lo
  // evita, pero si llegara a pasar el CAP tiene que saber qué hacer.
  test('un 413 explica que las fotos pesan demasiado', async () => {
    globalThis.fetch = fetchConEstado(413) as typeof fetch;

    const r = await api('registrarVisita', {}, { msLimite: 500 });

    assert.equal(r.ok, false);
    assert.match(r.error || '', /fotos pesan demasiado/i);
    assert.match(r.error || '', /cámara/i); // dice qué hacer
  });

  // Con el id_visita el reintento ya no duplica: el mensaje deja de
  // pedirle al CAP que vaya a revisar la hoja.
  test('un 504 se puede reintentar y ya no pide revisar si se guardó', async () => {
    globalThis.fetch = fetchConEstado(504) as typeof fetch;

    const r = await api('registrarVisita', {}, { msLimite: 500 });

    assert.equal(r.ok, false);
    assert.equal(r.reintentable, true);
    assert.match(r.error || '', /tardó demasiado/i);
    assert.doesNotMatch(r.error || '', /se guardó/i);
  });

  test('un 413 no se reintenta: reenviar lo mismo daría lo mismo', async () => {
    globalThis.fetch = fetchConEstado(413) as typeof fetch;

    const r = await api('registrarVisita', {}, { msLimite: 500 });

    assert.notEqual(r.reintentable, true);
  });

  // Antes esto reventaba: se intentaba parsear HTML como JSON.
  test('un 500 con HTML no revienta al parsear', async () => {
    globalThis.fetch = fetchConEstado(500) as typeof fetch;

    const r = await api('getAutocompletado', {}, { msLimite: 500 });

    assert.equal(r.ok, false);
    assert.ok(r.error);
    assert.doesNotMatch(r.error, /JSON|token/i); // nada técnico
  });

  test('una respuesta 200 se lee como siempre', async () => {
    globalThis.fetch = fetchQueResponde({ ok: true, data: 'pong' }) as typeof fetch;

    const r = await api('ping', {}, { msLimite: 500 });

    assert.equal(r.ok, true);
    assert.equal(r.data, 'pong');
  });
});

describe('los límites por tipo de llamada', () => {
  // Poner 15 s a todo rompería el guardado: registrarVisita sube hasta
  // 4 fotos a Drive dentro de la misma petición.
  test('guardar aguanta mucho más que cargar', () => {
    assert.ok(
      MS_LIMITE_GUARDADO > MS_LIMITE_CARGA * 4,
      'el guardado con fotos necesita holgura frente a la carga',
    );
  });

  test('cargar es el más corto de los tres', () => {
    assert.ok(MS_LIMITE_CARGA < MS_LIMITE_POR_DEFECTO);
    assert.ok(MS_LIMITE_CARGA < MS_LIMITE_GUARDADO);
  });

  test('la carga corta a los 15 segundos', () => {
    assert.equal(MS_LIMITE_CARGA, 15_000);
  });
});

describe('qué errores se pueden reintentar', () => {
  test('el tiempo agotado sí', async () => {
    globalThis.fetch = fetchQueNoResponde({ abortada: false }) as typeof fetch;
    const r = await api('registrarVisita', {}, { msLimite: 30 });
    assert.equal(r.reintentable, true);
  });

  test('la falta de red sí', async () => {
    globalThis.fetch = (() =>
      Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    const r = await api('registrarVisita', {}, { msLimite: 500 });
    assert.equal(r.reintentable, true);
  });

  test('un 500 sí', async () => {
    globalThis.fetch = fetchConEstado(500) as typeof fetch;
    const r = await api('registrarVisita', {}, { msLimite: 500 });
    assert.equal(r.reintentable, true);
  });

  // El proxy devuelve sus propios fallos con estado 200 y la marca puesta.
  test('respeta la marca que pone el proxy', async () => {
    globalThis.fetch = fetchQueResponde({
      ok: false,
      reintentable: true,
      error: 'El servidor tardó demasiado en responder.',
    }) as typeof fetch;
    const r = await api('registrarVisita', {}, { msLimite: 500 });
    assert.equal(r.reintentable, true);
  });

  // Un "Status requerido" no se arregla reenviando.
  test('una respuesta del backend no', async () => {
    globalThis.fetch = fetchQueResponde({
      ok: false,
      error: 'Status requerido',
    }) as typeof fetch;
    const r = await api('registrarVisita', {}, { msLimite: 500 });
    assert.notEqual(r.reintentable, true);
  });
});

describe('sesión vencida', () => {
  /** Un navegador mínimo con una sesión abierta. */
  function montarNavegador() {
    const datos = new Map<string, string>([['rw_token', 'token-de-prueba']]);
    const storage = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
    };
    const ventana = {
      localStorage: storage,
      sessionStorage: storage,
      location: { href: '/visita/PC-0001' },
    };
    (globalThis as unknown as { window: unknown }).window = ventana;
    return { datos, ventana };
  }

  const vencida = { ok: false, authError: true, error: 'Sesión expirada.' };

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  test('por defecto borra la sesión y manda al login', async () => {
    const { datos, ventana } = montarNavegador();
    globalThis.fetch = fetchQueResponde(vencida) as typeof fetch;

    const r = await api('getAsignacionesDia', {}, { msLimite: 500 });

    assert.equal(r.authError, true);
    assert.equal(datos.has('rw_token'), false);
    assert.equal(ventana.location.href, '/login');
  });

  // El guardado tiene que poner a salvo la visita antes de irse.
  test('con redirigirSiVence:false no toca nada y deja decidir', async () => {
    const { datos, ventana } = montarNavegador();
    globalThis.fetch = fetchQueResponde(vencida) as typeof fetch;

    const r = await api(
      'registrarVisita',
      {},
      { msLimite: 500, redirigirSiVence: false },
    );

    assert.equal(r.authError, true);
    assert.equal(datos.get('rw_token'), 'token-de-prueba');
    assert.equal(ventana.location.href, '/visita/PC-0001');
  });
});
