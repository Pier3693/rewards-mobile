import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sugerirRuta,
  lugaresPendientes,
  dosOpt,
  debeRecalcular,
  clavePendientes,
  numerosSugeridos,
  avisoCapacitacion,
  esAncla,
  M_RECALCULO,
  MS_RECALCULO,
  type Lugar,
} from './rutaSugerida.ts';
import { distanciaMetros, type Coordenadas, type ParadaEnMapa } from './mapa.ts';
import type { Parada } from './ruta.ts';

/** Un punto a `norte` y `este` metros de un origen en Lima (aprox. a esta latitud). */
const ORIGEN: Coordenadas = { lat: -12.1, lng: -77.03 };
const M_POR_GRADO_LAT = 110_600;
const M_POR_GRADO_LNG = 108_700;
const en = (norte: number, este = 0): Coordenadas => ({
  lat: ORIGEN.lat + norte / M_POR_GRADO_LAT,
  lng: ORIGEN.lng + este / M_POR_GRADO_LNG,
});

let siguiente = 1;
function parada(campos: Partial<Parada> = {}): Parada {
  return {
    id_asignacion: `ASG-${siguiente++}`,
    comercio: 'Local',
    mall_puerta: '',
    direccion: '',
    distrito: '',
    motivo: 'Visita',
    status: 'Pendiente',
    indicaciones: '',
    hora: '',
    hora_fin: '',
    estado: 'flexible',
    meet_link: '',
    id_local: '',
    ...campos,
  };
}

function enMapa(lista: [Partial<Parada>, Coordenadas | null][]): ParadaEnMapa[] {
  return lista.map(([campos, coordenadas], i) => ({ parada: parada(campos), numero: i + 1, coordenadas }));
}

const comercios = (r: ReturnType<typeof sugerirRuta>) =>
  r.pasos.map((p) => p.lugar.paradas.map((x) => x.parada.comercio).join('+'));

/** 9:00 de un día cualquiera. */
const NUEVE = new Date(2026, 9, 28, 9, 0);

// ══════════════════════════════════════════════════
describe('orden por cercanía', () => {
  test('empieza por la más cercana y sigue por la más cercana a esa', () => {
    const paradas = enMapa([
      [{ comercio: 'Lejos' }, en(3000)],
      [{ comercio: 'Cerca' }, en(300)],
      [{ comercio: 'Medio' }, en(1500)],
    ]);
    const r = sugerirRuta(paradas, ORIGEN, NUEVE);
    assert.deepEqual(comercios(r), ['Cerca', 'Medio', 'Lejos']);
    assert.ok(Math.abs(r.pasos[0].metrosDesdeAnterior - 300) < 5);
    assert.ok(Math.abs(r.totalMetros - 3000) < 20, `total ${r.totalMetros}`);
  });

  test('las completadas y las virtuales no cuentan', () => {
    const paradas = enMapa([
      [{ comercio: 'Hecha', status: 'Completado' }, en(100)],
      [{ comercio: 'Virtual', motivo: 'Capacitación Virtual' }, en(200)],
      [{ comercio: 'Pendiente' }, en(900)],
    ]);
    assert.deepEqual(comercios(sugerirRuta(paradas, ORIGEN, NUEVE)), ['Pendiente']);
  });

  test('las que no tienen ubicación van aparte, al final', () => {
    const paradas = enMapa([
      [{ comercio: 'Sin coordenadas' }, null],
      [{ comercio: 'Con coordenadas' }, en(500)],
      [{ comercio: 'Hecha sin coordenadas', status: 'Completado' }, null],
    ]);
    const r = sugerirRuta(paradas, ORIGEN, NUEVE);
    assert.deepEqual(comercios(r), ['Con coordenadas']);
    assert.deepEqual(r.sinUbicacion.map((p) => p.parada.comercio), ['Sin coordenadas']);
  });

  test('sin pendientes, vacía', () => {
    const r = sugerirRuta([], ORIGEN, NUEVE);
    assert.deepEqual(r.pasos, []);
    assert.equal(r.totalMetros, 0);
  });
});

describe('2-opt', () => {
  test('quita un cruce', () => {
    const lugar = (c: Coordenadas): Lugar => ({ paradas: [], centro: c, ancla: null });
    // Un cuadrado recorrido en diagonal: cruzado.
    const a = lugar(en(0, 1000));
    const b = lugar(en(1000, 0));
    const c = lugar(en(1000, 1000));
    const cruzado = [a, b, c];
    const mejor = dosOpt(ORIGEN, cruzado, null);
    const largo = (ls: Lugar[]) =>
      ls.reduce((s, l, i) => s + distanciaMetros(i ? ls[i - 1].centro : ORIGEN, l.centro), 0);
    assert.ok(largo(mejor) < largo(cruzado) - 100);
    assert.equal(mejor.length, 3);
  });

  test('con los extremos fijos, no los mueve', () => {
    const lugar = (c: Coordenadas): Lugar => ({ paradas: [], centro: c, ancla: null });
    const tramo = [lugar(en(500)), lugar(en(1000))];
    assert.deepEqual(dosOpt(ORIGEN, tramo, en(1500)), tramo);
  });
});

describe('un mismo lugar es una sola parada', () => {
  test('tres locales del mall cuentan como un paso', () => {
    const paradas = enMapa([
      [{ comercio: 'A' }, en(2000)],
      [{ comercio: 'B' }, en(2005, 10)],
      [{ comercio: 'C' }, en(2010, -5)],
      [{ comercio: 'Afuera' }, en(400)],
    ]);
    const r = sugerirRuta(paradas, ORIGEN, NUEVE);
    assert.deepEqual(comercios(r), ['Afuera', 'A+B+C']);
    // Los tres llevan el mismo número en el mapa.
    const numeros = numerosSugeridos(r);
    assert.deepEqual([1, 2, 3, 4].map((n) => numeros.get(n)), [2, 2, 2, 1]);
  });

  test('a más de 30 m ya son lugares distintos', () => {
    const paradas = enMapa([
      [{ comercio: 'A' }, en(2000)],
      [{ comercio: 'B' }, en(2050)],
    ]);
    assert.equal(lugaresPendientes(paradas, NUEVE).length, 2);
  });
});

describe('capacitaciones presenciales con hora: anclas', () => {
  const capacitacion = (hora: string, hora_fin = ''): Partial<Parada> => ({
    comercio: 'Capacitación',
    motivo: 'Capacitación Presencial',
    hora,
    hora_fin,
    estado: hora_fin ? 'rango' : '',
  });

  test('no se adelanta una parada que haría llegar tarde', () => {
    // A las 9:00, la capacitación de las 9:30 está a 2 km (6 min) y la
    // visita libre a 4 km en otra dirección: ir antes haría llegar tarde.
    const paradas = enMapa([
      [{ comercio: 'Libre lejos' }, en(-4000)],
      [capacitacion('09:30', '10:30'), en(2000)],
    ]);
    assert.deepEqual(comercios(sugerirRuta(paradas, ORIGEN, NUEVE)), ['Capacitación', 'Libre lejos']);
  });

  test('si da tiempo, la libre cercana va antes', () => {
    const paradas = enMapa([
      [capacitacion('11:00'), en(3000)],
      [{ comercio: 'Libre cerca' }, en(300)],
    ]);
    const r = sugerirRuta(paradas, ORIGEN, NUEVE);
    assert.deepEqual(comercios(r), ['Libre cerca', 'Capacitación']);
    // Y lo que viene después del ancla sale de su hora en adelante.
    assert.ok(r.pasos[1].llegadaMin < 11 * 60);
  });

  test('una vencida pasa a libre', () => {
    const tarde = new Date(2026, 9, 28, 14, 0);
    assert.equal(esAncla(parada(capacitacion('09:00', '10:00')), tarde), false);
    assert.equal(esAncla(parada(capacitacion('15:00')), tarde), true);
    assert.equal(esAncla(parada({ motivo: 'Visita', hora: '15:00', estado: '' }), tarde), false, 'una visita con hora es libre');
  });

  test('avisa de la próxima capacitación, presencial o virtual', () => {
    const lista = [
      parada({ motivo: 'Capacitación Virtual', hora: '09:40', estado: '' }),
      parada(capacitacion('11:00')),
    ];
    assert.equal(avisoCapacitacion(lista, NUEVE), 'Capacitación virtual a las 09:40');
    assert.equal(avisoCapacitacion([parada(capacitacion('10:30'))], NUEVE), '');
    assert.equal(avisoCapacitacion([parada(capacitacion('09:45'))], NUEVE), 'Capacitación a las 09:45');
  });
});

describe('cuándo recalcular', () => {
  const paradas = enMapa([[{}, en(500)], [{}, en(900)]]);
  const clave = clavePendientes(paradas);
  const anterior = { clave, origen: ORIGEN, en: 0 };
  const ubicacion = (c: Coordenadas, precision = 10) => ({ ...c, precision });

  test('la primera vez, siempre', () => {
    assert.equal(debeRecalcular(null, { clave, ubicacion: ubicacion(ORIGEN), en: 0 }), true);
  });

  test('moverse poco no; más del umbral, sí', () => {
    assert.equal(debeRecalcular(anterior, { clave, ubicacion: ubicacion(en(150)), en: 1000 }), false);
    assert.equal(debeRecalcular(anterior, { clave, ubicacion: ubicacion(en(M_RECALCULO + 50)), en: 1000 }), true);
  });

  test('una lectura imprecisa no mueve el orden', () => {
    assert.equal(debeRecalcular(anterior, { clave, ubicacion: ubicacion(en(800), 500), en: 1000 }), false);
  });

  test('al completar una parada (aunque siga en la cola), sí', () => {
    const otra = clavePendientes([{ ...paradas[0], parada: { ...paradas[0].parada, status: 'Completado' } }, paradas[1]]);
    assert.notEqual(otra, clave);
    assert.equal(debeRecalcular(anterior, { clave: otra, ubicacion: ubicacion(ORIGEN), en: 1000 }), true);
  });

  test('cada 10 minutos, aunque no se mueva', () => {
    assert.equal(debeRecalcular(anterior, { clave, ubicacion: ubicacion(ORIGEN), en: MS_RECALCULO }), true);
    assert.equal(debeRecalcular(anterior, { clave, ubicacion: ubicacion(ORIGEN), en: MS_RECALCULO - 1 }), false);
  });
});
