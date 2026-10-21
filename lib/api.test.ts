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
        () => resolver({ json: async () => cuerpo } as Response),
        msRetraso,
      );
    });
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
