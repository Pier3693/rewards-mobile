import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  etiquetaDia,
  tituloDia,
  textoDisponible,
  esDiaFuturo,
  soloFuturos,
  diasDelSelector,
  getRutasProximas,
  rutasProximasEnCopia,
  rutaDeHoyGuardada,
  borrarRutasProximas,
} from './rutasProximas.ts';
import type { DiaData } from './cacheDia.ts';
import type { Parada } from './ruta.ts';

/** Viernes 30 de octubre de 2026, a media mañana. */
const VIERNES = new Date(2026, 9, 30, 10, 0);

function dia(fecha: string, n: number): DiaData {
  const pendientes = Array.from({ length: n }, (_, i) => ({ id_asignacion: `${fecha}-${i}` }) as Parada);
  return { fecha, pendientes, completadas: [], total: n };
}

// ══════════════════════════════════════════════════
describe('etiquetas de los días', () => {
  test('Hoy, Mañana y luego el día corto', () => {
    assert.equal(etiquetaDia('30/10/2026', VIERNES), 'Hoy');
    assert.equal(etiquetaDia('31/10/2026', VIERNES), 'Mañana');
    assert.equal(etiquetaDia('02/11/2026', VIERNES), 'Lun 2 nov');
  });

  test('del viernes, el lunes no es "Mañana"', () => {
    assert.equal(etiquetaDia('02/11/2026', VIERNES), 'Lun 2 nov');
    assert.equal(textoDisponible('02/11/2026', VIERNES), 'Disponible el lunes');
  });

  test('cruza el fin de mes y el fin de año', () => {
    const fin = new Date(2026, 9, 31, 9, 0); // sábado 31/10
    assert.equal(etiquetaDia('01/11/2026', fin), 'Mañana');
    const anio = new Date(2026, 11, 31, 9, 0); // jueves 31/12
    assert.equal(etiquetaDia('01/01/2027', anio), 'Mañana');
    assert.equal(etiquetaDia('04/01/2027', anio), 'Lun 4 ene');
  });

  test('título largo del resumen', () => {
    assert.equal(tituloDia('02/11/2026'), 'Lunes 2 de noviembre');
    assert.equal(tituloDia('04/11/2026'), 'Miércoles 4 de noviembre');
  });

  test('disponible mañana, el lunes, o a una semana con el número', () => {
    assert.equal(textoDisponible('31/10/2026', VIERNES), 'Disponible mañana');
    assert.equal(textoDisponible('03/11/2026', VIERNES), 'Disponible el martes');
    assert.equal(textoDisponible('06/11/2026', VIERNES), 'Disponible el viernes 6');
  });
});

describe('qué días se muestran', () => {
  test('solo los que vienen, con paradas, en orden aunque cambie el mes', () => {
    const dias = [dia('02/11/2026', 8), dia('29/10/2026', 3), dia('31/10/2026', 0), dia('30/10/2026', 5), dia('01/11/2026', 2)];
    assert.deepEqual(soloFuturos(dias, VIERNES).map((d) => d.fecha), ['01/11/2026', '02/11/2026']);
  });

  test('las pestañas: Hoy siempre y luego los días con paradas', () => {
    const pestanas = diasDelSelector(5, [dia('02/11/2026', 8), dia('31/10/2026', 3)], VIERNES);
    assert.deepEqual(
      pestanas.map((p) => `${p.etiqueta} ${p.total}`),
      ['Hoy 5', 'Mañana 3', 'Lun 2 nov 8'],
    );
    assert.equal(pestanas[0].esHoy, true);
    assert.equal(pestanas[0].fecha, '30/10/2026');
  });

  test('sin rutas próximas no hay selector', () => {
    assert.deepEqual(diasDelSelector(5, [], VIERNES), []);
    assert.deepEqual(diasDelSelector(5, [dia('30/10/2026', 5)], VIERNES), [], 'hoy solo no cuenta');
  });

  test('un día futuro es de solo lectura; hoy no', () => {
    assert.equal(esDiaFuturo('02/11/2026', VIERNES), true);
    assert.equal(esDiaFuturo('30/10/2026', VIERNES), false);
    assert.equal(esDiaFuturo('29/10/2026', VIERNES), false);
    assert.equal(esDiaFuturo('fecha rara', VIERNES), false);
  });
});

// ══════════════════════════════════════════════════
describe('copia en el celular', () => {
  const fetchReal = globalThis.fetch;
  let datos: Map<string, string>;

  function montar(correo = 'rosa@empresa.pe') {
    datos = new Map<string, string>([
      ['rw_token', 'token'],
      ['rw_user', JSON.stringify({ nombre: 'Rosa', correo, rol: 'CAP' })],
    ]);
    const storage = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
    };
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { href: '/hoy' },
    };
  }

  function backend(cuerpo: unknown) {
    globalThis.fetch = (async () => ({ status: 200, ok: true, json: async () => cuerpo }) as Response) as typeof fetch;
  }
  function sinSenal() {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
  }

  beforeEach(() => montar());
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  test('se guardan y sin señal se usan', async () => {
    backend({ ok: true, data: { dias: [dia('02/11/2026', 8), dia('31/10/2026', 3)] } });
    const r = await getRutasProximas(VIERNES);
    assert.equal(r.deCache, false);
    assert.deepEqual(r.dias.map((d) => d.fecha), ['31/10/2026', '02/11/2026']);

    sinSenal();
    const offline = await getRutasProximas(VIERNES);
    assert.equal(offline.deCache, true);
    assert.deepEqual(offline.dias.map((d) => d.total), [3, 8]);
  });

  test('las de otro CAP no se usan', async () => {
    backend({ ok: true, data: { dias: [dia('02/11/2026', 8)] } });
    await getRutasProximas(VIERNES);
    const copia = datos.get('rw_rutas_proximas')!;
    montar('otro@empresa.pe');
    datos.set('rw_rutas_proximas', copia);
    assert.deepEqual(rutasProximasEnCopia(VIERNES), []);
  });

  test('un backend sin la acción nueva: sin selector, sin error', async () => {
    backend({ ok: false, error: 'Acción no reconocida: getAsignacionesProximas' });
    assert.deepEqual((await getRutasProximas(VIERNES)).dias, []);
  });

  // Llegó el lunes: lo que era "próximo" es la ruta de hoy.
  test('al llegar el día, su ruta queda como la de hoy', async () => {
    backend({ ok: true, data: { dias: [dia('02/11/2026', 8)] } });
    await getRutasProximas(VIERNES);
    const lunes = new Date(2026, 10, 2, 8, 0);
    assert.equal(rutaDeHoyGuardada(lunes)?.total, 8);
    assert.deepEqual(rutasProximasEnCopia(lunes), [], 'ya no es un día que viene');
    assert.equal(rutaDeHoyGuardada(VIERNES), null);
  });

  test('al cerrar sesión se borran', async () => {
    backend({ ok: true, data: { dias: [dia('02/11/2026', 8)] } });
    await getRutasProximas(VIERNES);
    borrarRutasProximas();
    assert.deepEqual(rutasProximasEnCopia(VIERNES), []);
  });
});
