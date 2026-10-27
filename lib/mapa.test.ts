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
    const r = encuadre([PLAZA_DE_ARMAS, PARQUE_KENNEDY], { lat: -12.2, lng: -77.0 });
    assert.deepEqual(r, {
      tipo: 'limites',
      limites: [
        [-12.2, -77.0428],
        [-12.0464, -77.0],
      ],
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
