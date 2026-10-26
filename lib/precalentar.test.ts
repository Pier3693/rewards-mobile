import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  decidirPrecalentar,
  claveDeRutas,
  esperarActivado,
  MS_ENTRE_ENVIOS,
} from './precalentar.ts';

const AHORA = 1_700_000_000_000;
const RUTA = ['/local/PC-1', '/visita/PC-1', '/local/CC-2', '/visita/CC-2'];

describe('cuándo se precalienta', () => {
  test('la primera vez se envía', () => {
    assert.equal(decidirPrecalentar(RUTA, AHORA, null).accion, 'enviar');
  });

  // El fallo que se corrige: se mandaba decenas de veces la misma lista.
  test('la misma lista no se vuelve a enviar', () => {
    const ultimo = { clave: claveDeRutas(RUTA), en: AHORA - 60 * 60_000 };
    assert.deepEqual(decidirPrecalentar(RUTA, AHORA, ultimo), { accion: 'nada' });
  });

  test('el orden no cuenta como cambio', () => {
    const ultimo = { clave: claveDeRutas(RUTA), en: AHORA };
    assert.deepEqual(decidirPrecalentar([...RUTA].reverse(), AHORA, ultimo), { accion: 'nada' });
  });

  test('una lista nueva antes de 5 min espera lo que falta', () => {
    const ultimo = { clave: claveDeRutas(['/local/PC-1']), en: AHORA - 2 * 60_000 };
    assert.deepEqual(decidirPrecalentar(RUTA, AHORA, ultimo), {
      accion: 'esperar',
      ms: MS_ENTRE_ENVIOS - 2 * 60_000,
    });
  });

  test('una lista nueva pasados 5 min se envía', () => {
    const ultimo = { clave: claveDeRutas(['/local/PC-1']), en: AHORA - MS_ENTRE_ENVIOS };
    assert.equal(decidirPrecalentar(RUTA, AHORA, ultimo).accion, 'enviar');
  });

  test('una ruta vacía no envía nada', () => {
    assert.deepEqual(decidirPrecalentar([], AHORA, null), { accion: 'nada' });
  });

  test('el tope es de varios minutos', () => {
    assert.ok(MS_ENTRE_ENVIOS >= 5 * 60_000);
  });
});

describe('esperar a que la versión nueva termine de activarse', () => {
  /** Un ServiceWorker mínimo al que se le puede cambiar el estado. */
  function worker(state: string) {
    const oyentes = new Set<() => void>();
    return {
      state,
      addEventListener: (_: string, fn: () => void) => void oyentes.add(fn),
      removeEventListener: (_: string, fn: () => void) => void oyentes.delete(fn),
      pasarA(nuevo: string) {
        this.state = nuevo;
        [...oyentes].forEach((fn) => fn());
      },
      oyentes,
    };
  }

  // El fallo que se corrige: se recargaba mientras se activaba, con la
  // caché nueva todavía a medias.
  test('mientras se activa, espera', async () => {
    const w = worker('activating');
    let listo = false;
    esperarActivado(w as unknown as ServiceWorker).then(() => (listo = true));
    await new Promise((r) => setImmediate(r));
    assert.equal(listo, false);

    w.pasarA('activated');
    await new Promise((r) => setImmediate(r));
    assert.equal(listo, true);
    assert.equal(w.oyentes.size, 0, 'deja de escuchar');
  });

  test('si ya está activado, no espera', async () => {
    await esperarActivado(worker('activated') as unknown as ServiceWorker);
  });

  test('si queda redundante, tampoco se queda esperando', async () => {
    const w = worker('installed');
    const p = esperarActivado(w as unknown as ServiceWorker);
    w.pasarA('redundant');
    await p;
  });
});
