import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  coordenadasDe,
  separarParadas,
  distanciaMetros,
  textoDistancia,
  encuadre,
  estiloMarcador,
  infoHoja,
  enlaceComoLlegar,
  CENTRO_LIMA,
  ZOOM_UN_PUNTO,
  MAX_M_CAP_EN_ENCUADRE,
  aPixeles,
  agruparParadas,
  type ParadaEnMapa,
  type Coordenadas,
} from './mapa.ts';
import type { Parada } from './ruta.ts';

function parada(campos: Record<string, unknown> = {}): Parada {
  return {
    id_asignacion: 'ASG-1',
    comercio: 'Tambo+',
    mall_puerta: 'Puerta Calle',
    direccion: 'Av. Benavides 730',
    distrito: 'Miraflores',
    motivo: 'Visita',
    status: 'Pendiente',
    indicaciones: '',
    hora: '10:00',
    hora_fin: '',
    estado: '',
    meet_link: '',
    id_local: 'PC-0001',
    ...campos,
  } as Parada;
}

const PLAZA_DE_ARMAS: Coordenadas = { lat: -12.0464, lng: -77.0428 };
const PARQUE_KENNEDY: Coordenadas = { lat: -12.1211, lng: -77.0297 };

// ══════════════════════════════════════════════════
describe('coordenadas de una parada', () => {
  test('el backend las manda como números', () => {
    assert.deepEqual(coordenadasDe(parada({ lat: -12.12, lng: -77.03 })), { lat: -12.12, lng: -77.03 });
  });

  test('también sirven como texto', () => {
    assert.deepEqual(coordenadasDe(parada({ lat: '-12.12', lng: '-77.03' })), { lat: -12.12, lng: -77.03 });
  });

  test('sin coordenadas, vacías, en cero o fuera de rango: null', () => {
    assert.equal(coordenadasDe(parada()), null);
    assert.equal(coordenadasDe(parada({ lat: '', lng: '' })), null);
    assert.equal(coordenadasDe(parada({ lat: 0, lng: 0 })), null);
    assert.equal(coordenadasDe(parada({ lat: 'abc', lng: -77 })), null);
    assert.equal(coordenadasDe(parada({ lat: 95, lng: -77 })), null);
    assert.equal(coordenadasDe(parada({ lat: -12, lng: 200 })), null);
  });
});

describe('qué paradas van al mapa', () => {
  const con1 = parada({ id_asignacion: 'A', hora: '11:00', lat: -12.1, lng: -77.0 });
  const sin = parada({ id_asignacion: 'B', hora: '09:00' });
  const con2 = parada({ id_asignacion: 'C', hora: '15:00', lat: -12.2, lng: -77.1 });

  test('separa con y sin ubicación', () => {
    const r = separarParadas([con1, sin, con2]);
    assert.deepEqual(r.conUbicacion.map((p) => p.parada.id_asignacion), ['A', 'C']);
    assert.deepEqual(r.sinUbicacion.map((p) => p.parada.id_asignacion), ['B']);
  });

  // El número es el mismo de Hoy: el orden de la ruta, no el de la lista.
  test('cada una lleva su número en la ruta del día', () => {
    const r = separarParadas([con1, sin, con2]);
    assert.equal(r.sinUbicacion[0].numero, 1, 'la de las 09:00 es la primera');
    assert.deepEqual(r.conUbicacion.map((p) => p.numero), [2, 3]);
  });

  test('sin paradas, todo vacío', () => {
    assert.deepEqual(separarParadas([]), { conUbicacion: [], sinUbicacion: [] });
  });
});

describe('distancia', () => {
  test('de la Plaza de Armas al Parque Kennedy, unos 8.4 km', () => {
    const d = distanciaMetros(PLAZA_DE_ARMAS, PARQUE_KENNEDY);
    assert.ok(d > 8_200 && d < 8_600, `dio ${d}`);
  });

  test('un milésimo de grado de latitud son unos 111 m', () => {
    const d = distanciaMetros({ lat: -12, lng: -77 }, { lat: -12.001, lng: -77 });
    assert.ok(Math.abs(d - 111) < 1, `dio ${d}`);
  });

  test('el mismo punto, 0', () => {
    assert.equal(distanciaMetros(PLAZA_DE_ARMAS, PLAZA_DE_ARMAS), 0);
  });

  test('el texto, redondeado como se lee en la calle', () => {
    assert.equal(textoDistancia(83), 'a 80 m');
    assert.equal(textoDistancia(347), 'a 350 m');
    assert.equal(textoDistancia(4), 'a 10 m');
    assert.equal(textoDistancia(1234), 'a 1.2 km');
    assert.equal(textoDistancia(12_400), 'a 12 km');
    assert.equal(textoDistancia(NaN), '');
  });
});

describe('encuadre al abrir', () => {
  test('todos los puntos y la ubicación del CAP', () => {
    const r = encuadre([PLAZA_DE_ARMAS, PARQUE_KENNEDY], { lat: -12.13, lng: -77.02 });
    assert.deepEqual(r, {
      tipo: 'limites',
      limites: [
        [-12.13, -77.0428],
        [-12.0464, -77.02],
      ],
    });
  });

  // Plaza de Armas está a unos 8 km del Parque Kennedy.
  test('si el CAP está a más de 3 km, solo las paradas', () => {
    const otra: Coordenadas = { lat: -12.1305, lng: -77.0302 };
    const r = encuadre([PARQUE_KENNEDY, otra], PLAZA_DE_ARMAS);
    assert.deepEqual(r, {
      tipo: 'limites',
      limites: [
        [-12.1305, -77.0302],
        [-12.1211, -77.0297],
      ],
    });
    assert.ok(MAX_M_CAP_EN_ENCUADRE === 3000);
  });

  test('si está cerca (500 m), las paradas y el CAP', () => {
    const cap: Coordenadas = { lat: -12.1166, lng: -77.0297 };
    const r = encuadre([PARQUE_KENNEDY], cap);
    assert.equal(r?.tipo, 'limites');
  });

  test('lejos y con una sola parada, centrado en ella', () => {
    assert.deepEqual(encuadre([PARQUE_KENNEDY], PLAZA_DE_ARMAS), {
      tipo: 'centro',
      centro: PARQUE_KENNEDY,
      zoom: ZOOM_UN_PUNTO,
    });
  });

  test('con un solo punto, centrado y cerca', () => {
    assert.deepEqual(encuadre([PARQUE_KENNEDY]), { tipo: 'centro', centro: PARQUE_KENNEDY, zoom: ZOOM_UN_PUNTO });
  });

  test('sin puntos pero con el CAP, centrado en él', () => {
    assert.deepEqual(encuadre([], PLAZA_DE_ARMAS), { tipo: 'centro', centro: PLAZA_DE_ARMAS, zoom: ZOOM_UN_PUNTO });
  });

  test('sin nada, null (el mapa va al centro de Lima)', () => {
    assert.equal(encuadre([]), null);
    assert.ok(CENTRO_LIMA.lat < 0 && CENTRO_LIMA.lng < 0);
  });
});

describe('marcadores', () => {
  test('pendiente: el color de su motivo y su número', () => {
    const e = estiloMarcador({ parada: parada({ motivo: 'Branding' }), numero: 3, coordenadas: null });
    assert.deepEqual(e, { numero: 3, color: 'var(--color-motivo-branding)', hecha: false, pendienteEnvio: false });
  });

  test('hecha: el color de su resultado', () => {
    const e = estiloMarcador({
      parada: parada({ status: 'Completado', resultado: 'incidencia' }),
      numero: 1,
      coordenadas: null,
    });
    assert.equal(e.hecha, true);
    assert.equal(e.color, 'var(--color-err)');
  });

  test('hecha y en la cola: lo marca', () => {
    const e = estiloMarcador({
      parada: parada({ status: 'Completado', resultado: 'Todo Ok', pendiente_envio: '1' }),
      numero: 1,
      coordenadas: null,
    });
    assert.equal(e.pendienteEnvio, true);
  });
});

describe('la hoja de detalle', () => {
  const kennedy = parada({
    comercio: 'Tambo+',
    mall_puerta: 'JOCKEY PLAZA',
    direccion: 'AV. JAVIER PRADO 4200',
    distrito: 'SURCO',
    motivo: 'Capacitación Presencial',
    hora: '10:00',
    lat: PARQUE_KENNEDY.lat,
    lng: PARQUE_KENNEDY.lng,
    geo_estado: 'OK',
  });

  test('con la copia del local: KAM y beneficios', () => {
    const h = infoHoja(kennedy, { kam: 'ANA TORRES', beneficios: '20% con BBVA' });
    assert.equal(infoHoja(kennedy, { psi: '6', puntos_bbva: 'NO' }).psi, 'PSI 6');
    assert.equal(infoHoja(kennedy, { psi: 'NO', puntos_bbva: 'SI' }).puntos, 'Puntos BBVA · Sí');
    assert.equal(h.titulo, 'Tambo+');
    assert.equal(h.motivo, 'Capacitación Presencial');
    assert.equal(h.kam, 'Ana Torres');
    assert.equal(h.beneficios, '20% con BBVA');
    assert.equal(h.hora, '10:00');
    assert.equal(h.idLocal, 'PC-0001');
    assert.equal(h.idAsignacion, 'ASG-1');
  });

  test('lo de la asignación gana a la copia del local', () => {
    const conDatos = parada({ kam: 'LUIS PEREZ', beneficios: '6 PSI' });
    const h = infoHoja(conDatos, { kam: 'ANA TORRES', beneficios: '20% con BBVA' });
    assert.equal(h.kam, 'Luis Perez');
    assert.equal(h.beneficios, '6 PSI');
  });

  test('sin dato en la asignación, el de la copia del local', () => {
    const h = infoHoja(parada({ kam: '', beneficios: '' }), { kam: 'ANA TORRES', beneficios: '2x1 jueves' });
    assert.equal(h.kam, 'Ana Torres');
    assert.equal(h.beneficios, '2x1 jueves');
  });

  test('sin la copia del local: lo que hay, sin inventar', () => {
    const h = infoHoja(kennedy, null);
    assert.equal(h.psi, '', 'sin el local, todavía no se sabe');
    assert.equal(h.puntos, '');
    assert.equal(h.kam, '');
    assert.equal(h.beneficios, '');
  });

  test('en un centro comercial enseña el mall; en puerta calle, no', () => {
    assert.equal(infoHoja(kennedy).mall, 'Jockey Plaza');
    assert.equal(infoHoja(parada({ mall_puerta: 'Puerta Calle' })).mall, '');
    assert.equal(infoHoja(kennedy).direccion, 'Av. Javier Prado 4200 · Surco');
  });

  test('avisa si la ubicación es aproximada', () => {
    assert.equal(infoHoja(parada({ geo_estado: 'Aproximado', lat: -12, lng: -77 })).aproximado, true);
    assert.equal(infoHoja(kennedy).aproximado, false);
  });

  test('la distancia, solo si se sabe dónde está el CAP', () => {
    assert.equal(infoHoja(kennedy, null, null).distancia, '');
    assert.equal(infoHoja(kennedy, null, PLAZA_DE_ARMAS).distancia, 'a 8.4 km');
    assert.equal(infoHoja(parada(), null, PLAZA_DE_ARMAS).distancia, '', 'sin coordenadas, sin distancia');
  });
});

describe('cómo llegar', () => {
  test('con coordenadas buenas, a ese punto exacto', () => {
    const url = enlaceComoLlegar(parada({ lat: -12.1211, lng: -77.0297, geo_estado: 'Manual' }));
    assert.equal(url, 'https://www.google.com/maps/dir/?api=1&destination=-12.1211,-77.0297');
  });

  // Aproximadas: la dirección suele acertar más que el punto calculado.
  test('aproximadas o sin coordenadas, por dirección', () => {
    const aprox = enlaceComoLlegar(parada({ lat: -12.1, lng: -77.0, geo_estado: 'Aproximado' }));
    assert.match(aprox, /maps\/search\/\?api=1&query=/);
    assert.match(enlaceComoLlegar(parada()), /maps\/search\//);
  });
});

describe('agrupar las paradas cercanas', () => {
  const en = (numero: number, lat: number, lng: number): ParadaEnMapa => ({
    parada: parada({ id_asignacion: `A${numero}` }),
    numero,
    coordenadas: { lat, lng },
  });
  // A unos 200 m una de otra, en Miraflores.
  const kennedy = en(1, -12.1211, -77.0297);
  const cerca = en(2, -12.1229, -77.0297);
  // El mismo mall: mismas coordenadas.
  const mall1 = en(3, -12.1318, -77.0303);
  const mall2 = en(4, -12.1318, -77.0303);
  const lejos = en(5, -12.0464, -77.0428);

  test('la proyección es la de Leaflet', () => {
    assert.deepEqual(aPixeles({ lat: 0, lng: 0 }, 0), { x: 128, y: 128 });
    const p = aPixeles({ lat: 0, lng: 90 }, 1);
    assert.equal(p.x, 384);
  });

  test('las lejanas van cada una sola', () => {
    const g = agruparParadas([kennedy, lejos], 12);
    assert.equal(g.length, 2);
    assert.ok(g.every((x) => x.paradas.length === 1 && !x.mismoLugar));
  });

  test('las cercanas se juntan de lejos y se separan al acercar', () => {
    assert.equal(agruparParadas([kennedy, cerca], 14).length, 1);
    assert.equal(agruparParadas([kennedy, cerca], 17).length, 2);
  });

  test('el mismo mall: mismo lugar, juntas incluso en el zoom máximo', () => {
    const g = agruparParadas([mall1, mall2], 19);
    assert.equal(g.length, 1);
    assert.equal(g[0].mismoLugar, true);
    assert.deepEqual(g[0].centro, { lat: -12.1318, lng: -77.0303 });
  });

  test('cercanas pero no en el mismo sitio: no es mismo lugar', () => {
    const g = agruparParadas([kennedy, cerca], 14);
    assert.equal(g[0].mismoLugar, false);
  });

  test('conserva el orden y los números de la ruta', () => {
    const g = agruparParadas([kennedy, mall1, cerca, mall2, lejos], 13);
    const numeros = g.map((x) => x.paradas.map((p) => p.numero));
    assert.deepEqual(numeros, [[1, 2], [3, 4], [5]]);
  });

  test('sin paradas o sin coordenadas, vacío', () => {
    assert.deepEqual(agruparParadas([], 15), []);
    assert.deepEqual(agruparParadas([{ ...kennedy, coordenadas: null }], 15), []);
  });
});
