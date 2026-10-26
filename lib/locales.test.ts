import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  diasDesde,
  avisoUltimaVisita,
  ultimaFueIncidencia,
  textoAntiguedad,
  esLocalCC,
  textoParaCopiar,
  DIAS_SIN_VISITA_AVISO,
  type LocalCompleto,
} from './locales.ts';

/** Local mínimo; se sobreescribe solo lo que importa en cada caso. */
function local(campos: Partial<LocalCompleto> = {}): LocalCompleto {
  return {
    id_local: 'PC-0001',
    tipo: 'PC',
    comercio: 'Pardos Chicken',
    mall_puerta: 'Puerta Calle',
    direccion: 'Av. Benavides 730',
    distrito: 'Miraflores',
    kam: '',
    psi: '',
    puntos_bbva: '',
    procesador_pos: '',
    codigo_openpay: '',
    codigo_niubiz: '',
    codigo_izipay: '',
    beneficios: '',
    material_pop: '',
    contacto_nombre: '',
    contacto_cel: '',
    ultima_visita: '',
    ultimo_status: '',
    ultima_observacion: '',
    ultimo_cap: '',
    ultimo_motivo: '',
    ...campos,
  };
}

const HOY = new Date(2026, 9, 20, 11, 30); // 20/10/2026

describe('diasDesde', () => {
  test('lee el formato que manda el backend', () => {
    assert.equal(diasDesde('20/10/2026 09:15', HOY), 0);
    assert.equal(diasDesde('19/10/2026 09:15', HOY), 1);
    assert.equal(diasDesde('12/09/2026 16:40', HOY), 38);
  });

  test('funciona sin la hora', () => {
    assert.equal(diasDesde('19/10/2026', HOY), 1);
  });

  test('la hora no mueve el resultado', () => {
    assert.equal(diasDesde('20/10/2026 23:59', HOY), 0);
    assert.equal(diasDesde('20/10/2026 00:01', HOY), 0);
  });

  test('cruza bien el cambio de mes y de año', () => {
    assert.equal(diasDesde('30/09/2026', HOY), 20);
    assert.equal(diasDesde('31/12/2025', new Date(2026, 0, 1)), 1);
  });

  test('sin fecha o con fecha imposible devuelve null', () => {
    assert.equal(diasDesde('', HOY), null);
    assert.equal(diasDesde(undefined, HOY), null);
    assert.equal(diasDesde('nunca', HOY), null);
    assert.equal(diasDesde('31/02/2026', HOY), null);
  });
});

describe('avisoUltimaVisita', () => {
  test('sin visitas avisa "nunca"', () => {
    assert.deepEqual(avisoUltimaVisita(local({ ultima_visita: '' }), HOY), {
      tipo: 'nunca',
    });
  });

  test('el umbral son 30 días exactos', () => {
    // 30 días justos todavía no avisa
    assert.deepEqual(
      avisoUltimaVisita(local({ ultima_visita: '20/09/2026 10:00' }), HOY),
      { tipo: 'reciente' },
    );
    // 31 sí
    assert.deepEqual(
      avisoUltimaVisita(local({ ultima_visita: '19/09/2026 10:00' }), HOY),
      { tipo: 'hace-mucho', dias: 31 },
    );
  });

  test('una visita de ayer no genera aviso', () => {
    assert.deepEqual(
      avisoUltimaVisita(local({ ultima_visita: '19/10/2026 10:00' }), HOY),
      { tipo: 'reciente' },
    );
  });

  test('el umbral es el que dice la constante', () => {
    assert.equal(DIAS_SIN_VISITA_AVISO, 30);
  });
});

describe('ultimaFueIncidencia', () => {
  test('detecta la incidencia sin importar mayúsculas', () => {
    assert.equal(ultimaFueIncidencia(local({ ultimo_status: 'Incidencia' })), true);
    assert.equal(ultimaFueIncidencia(local({ ultimo_status: 'INCIDENCIA' })), true);
  });

  test('los demás resultados no la activan', () => {
    assert.equal(ultimaFueIncidencia(local({ ultimo_status: 'Todo Ok' })), false);
    assert.equal(ultimaFueIncidencia(local({ ultimo_status: 'Reprogramar' })), false);
    assert.equal(ultimaFueIncidencia(local({ ultimo_status: '' })), false);
  });
});

describe('textoAntiguedad', () => {
  test('hoy, ayer y el resto', () => {
    assert.equal(textoAntiguedad(0), 'hoy');
    assert.equal(textoAntiguedad(1), 'ayer');
    assert.equal(textoAntiguedad(37), 'hace 37 días');
    assert.equal(textoAntiguedad(null), '');
  });
});

describe('esLocalCC y textoParaCopiar', () => {
  test('puerta calle: se copia la dirección', () => {
    const pc = local();
    assert.equal(esLocalCC(pc), false);
    assert.equal(textoParaCopiar(pc), 'Av. Benavides 730, Miraflores');
  });

  test('centro comercial: se copia el mall, que es lo único que hay', () => {
    const cc = local({
      tipo: 'CC',
      mall_puerta: 'Jockey Plaza',
      direccion: '',
      distrito: '',
    });
    assert.equal(esLocalCC(cc), true);
    assert.equal(textoParaCopiar(cc), 'Jockey Plaza');
  });

  test('el literal "Puerta Calle" no cuenta como mall', () => {
    assert.equal(esLocalCC(local({ tipo: '', mall_puerta: 'Puerta Calle' })), false);
  });

  test('sin tipo, decide el mall', () => {
    assert.equal(esLocalCC(local({ tipo: '', mall_puerta: 'Real Plaza' })), true);
  });
});
