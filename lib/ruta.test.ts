// ══════════════════════════════════════════════════
//  Pruebas de la ruta del día
//
//  Corre con el runner que ya trae Node (npm test).
//  Sin dependencias: node --test --experimental-strip-types
//
//  La lógica de horas ya produjo dos errores en campo (el botón
//  "Unirse" destacado en una reunión terminada, y una parada vencida
//  propuesta como siguiente visita), así que los bordes van fijados
//  aquí con horas simuladas.
// ══════════════════════════════════════════════════

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ordenarRuta,
  horaAMinutos,
  finEnMinutos,
  horaNormalizada,
  estadoTemporal,
  textoEstado,
  tieneVentanaReal,
  estaVencida,
  siguienteParada,
  meetEsUrgente,
  enlaceMeet,
  ubicacionDe,
  etiquetaHora,
  fechaLarga,
  textoEspera,
  indicacionesLimpias,
  aplicarEncoladas,
  estaPendienteDeEnvio,
  estaCompletada,
  type Parada,
} from './ruta.ts';

const VIRTUAL = 'Capacitación Virtual';

/** Parada mínima; se sobreescribe solo lo que importa en cada caso. */
function parada(campos: Partial<Parada> = {}): Parada {
  return {
    id_asignacion: '',
    comercio: '',
    mall_puerta: '',
    direccion: '',
    distrito: '',
    motivo: 'Visita',
    status: 'Pendiente',
    indicaciones: '',
    hora: '',
    hora_fin: '',
    estado: '',
    meet_link: '',
    id_local: '',
    ...campos,
  };
}

/** Un instante del 20/10/2026 a la hora dada. */
const alas = (h: number, m = 0) => new Date(2026, 9, 20, h, m);

// ══════════════════════════════════════════════════
describe('estadoTemporal · con ventana real', () => {
  const virtual15 = parada({ motivo: VIRTUAL, hora: '15:00' });

  test('virtual sin hora_fin: la ventana dura una hora', () => {
    assert.equal(estadoTemporal(virtual15, alas(14, 59)), 'programada');
    assert.equal(estadoTemporal(virtual15, alas(15, 0)), 'en-curso');
    assert.equal(estadoTemporal(virtual15, alas(15, 59)), 'en-curso');
    assert.equal(estadoTemporal(virtual15, alas(16, 0)), 'en-curso');
    assert.equal(estadoTemporal(virtual15, alas(16, 1)), 'atrasada');
  });

  test('virtual con hora_fin: manda hora_fin', () => {
    const p = parada({ motivo: VIRTUAL, hora: '15:00', hora_fin: '17:00' });
    assert.equal(estadoTemporal(p, alas(16, 30)), 'en-curso');
    assert.equal(estadoTemporal(p, alas(17, 0)), 'en-curso');
    assert.equal(estadoTemporal(p, alas(17, 1)), 'atrasada');
  });

  test('presencial con rango: en curso aunque la hora ya pasó', () => {
    const p = parada({
      motivo: 'Capacitación Presencial',
      hora: '09:00',
      hora_fin: '13:00',
      estado: 'rango',
    });
    assert.equal(estadoTemporal(p, alas(10, 30)), 'en-curso');
    assert.equal(estadoTemporal(p, alas(13, 0)), 'en-curso');
    assert.equal(estadoTemporal(p, alas(13, 1)), 'atrasada');
  });

  test('un hora_fin anterior al inicio es dato malo y se ignora', () => {
    const p = parada({ hora: '15:00', hora_fin: '14:00' });
    assert.equal(tieneVentanaReal(p), false);
    assert.equal(finEnMinutos(p), 16 * 60);
  });
});

describe('estadoTemporal · sin ventana real', () => {
  const visita9 = parada({ hora: '09:00' });

  test('visita simple: 15 minutos de margen para llegar', () => {
    assert.equal(estadoTemporal(visita9, alas(8, 59)), 'programada');
    assert.equal(estadoTemporal(visita9, alas(9, 0)), 'programada');
    assert.equal(estadoTemporal(visita9, alas(9, 10)), 'programada');
    assert.equal(estadoTemporal(visita9, alas(9, 15)), 'programada');
    assert.equal(estadoTemporal(visita9, alas(9, 16)), 'atrasada');
  });

  test('una visita simple no tiene ventana real', () => {
    assert.equal(tieneVentanaReal(visita9), false);
  });
});

describe('estadoTemporal · casos que nunca se marcan', () => {
  test('hora flexible, a cualquier hora del día', () => {
    const p = parada({ estado: 'flexible' });
    assert.equal(estadoTemporal(p, alas(7)), 'flexible');
    assert.equal(estadoTemporal(p, alas(23, 59)), 'flexible');
  });

  test('sin hora es flexible aunque el estado venga vacío', () => {
    assert.equal(estadoTemporal(parada(), alas(20)), 'flexible');
  });

  test('completada: ni atrasada ni en curso', () => {
    const p = parada({ hora: '09:00', status: 'Completado' });
    assert.equal(estadoTemporal(p, alas(18)), 'programada');
    const v = parada({ motivo: VIRTUAL, hora: '15:00', status: 'Completado' });
    assert.equal(estadoTemporal(v, alas(15, 30)), 'programada');
  });
});

describe('coherencia entre el estado y el botón de la reunión', () => {
  // El error reportado: la tarjeta decía "Unirse ahora" y "Atrasada" a la vez.
  test('dentro de la ventana nunca dice atrasada', () => {
    const p = parada({
      motivo: VIRTUAL,
      hora: '15:00',
      meet_link: 'https://meet.google.com/abc-defg-hij',
    });
    for (const t of [alas(14, 50), alas(15, 0), alas(15, 30), alas(16, 0)]) {
      assert.equal(meetEsUrgente(p, t), true);
      assert.notEqual(estadoTemporal(p, t), 'atrasada');
    }
  });

  test('terminada la reunión, deja de estar destacada y pasa a atrasada', () => {
    const p = parada({ motivo: VIRTUAL, hora: '09:00' });
    assert.equal(meetEsUrgente(p, alas(11, 25)), false);
    assert.equal(estadoTemporal(p, alas(11, 25)), 'atrasada');
  });

  test('antes de la ventana no se destaca', () => {
    const p = parada({ motivo: VIRTUAL, hora: '15:00' });
    assert.equal(meetEsUrgente(p, alas(14, 49)), false);
    assert.equal(meetEsUrgente(p, alas(14, 50)), true);
  });
});

describe('textoEstado', () => {
  test('el rango solo sale si hora_fin es un dato real', () => {
    const conFin = parada({ motivo: VIRTUAL, hora: '15:00', hora_fin: '16:30' });
    assert.equal(textoEstado(conFin, alas(15, 30)), 'En curso · 15:00–16:30');

    const sinFin = parada({ motivo: VIRTUAL, hora: '15:00' });
    assert.equal(textoEstado(sinFin, alas(15, 30)), 'En curso · 15:00');
  });

  test('atrasada muestra su hora de inicio', () => {
    assert.equal(
      textoEstado(parada({ hora: '09:00' }), alas(11, 0)),
      'Atrasada · 09:00',
    );
  });

  test('programada y flexible usan la etiqueta de siempre', () => {
    assert.equal(textoEstado(parada({ hora: '09:00' }), alas(8)), '09:00');
    assert.equal(
      textoEstado(parada({ estado: 'flexible' }), alas(8)),
      'Hora flexible',
    );
  });
});

// ══════════════════════════════════════════════════
describe('estaVencida', () => {
  test('la virtual vence al terminar la reunión', () => {
    const p = parada({ motivo: VIRTUAL, hora: '09:00' });
    assert.equal(estaVencida(p, alas(10, 0)), false);
    assert.equal(estaVencida(p, alas(10, 1)), true);
  });

  test('la visita simple aguanta una hora más que su fin', () => {
    const p = parada({ hora: '09:00' });
    assert.equal(estaVencida(p, alas(11, 0)), false);
    assert.equal(estaVencida(p, alas(11, 1)), true);
  });

  test('la presencial con rango respeta hora_fin', () => {
    const p = parada({
      motivo: 'Capacitación Presencial',
      hora: '09:00',
      hora_fin: '13:00',
      estado: 'rango',
    });
    assert.equal(estaVencida(p, alas(14, 0)), false);
    assert.equal(estaVencida(p, alas(14, 1)), true);
  });

  test('la hora flexible nunca vence', () => {
    assert.equal(estaVencida(parada({ estado: 'flexible' }), alas(23, 59)), false);
  });
});

describe('siguienteParada', () => {
  const ruta = ordenarRuta([
    parada({ comercio: 'Virtual 09:00', motivo: VIRTUAL, hora: '09:00' }),
    parada({ comercio: 'Tambo 11:00', hora: '11:00' }),
    parada({ comercio: 'GMO 16:00', hora: '16:00' }),
    parada({ comercio: 'Flexible' }),
  ]);

  test('salta la virtual vencida (el caso reportado a las 11:25)', () => {
    assert.equal(siguienteParada(ruta, alas(11, 25))?.comercio, 'Tambo 11:00');
  });

  test('si todas vencieron, devuelve la primera', () => {
    const viejas = ordenarRuta([
      parada({ comercio: 'A 08:00', hora: '08:00' }),
      parada({ comercio: 'B 09:00', hora: '09:00' }),
    ]);
    assert.equal(siguienteParada(viejas, alas(20))?.comercio, 'A 08:00');
  });

  test('sin pendientes devuelve null', () => {
    const hechas = [parada({ hora: '09:00', status: 'Completado' })];
    assert.equal(siguienteParada(hechas, alas(12)), null);
  });

  test('las completadas no se proponen', () => {
    const mixta = ordenarRuta([
      parada({ comercio: 'Hecha 09:00', hora: '09:00', status: 'Completado' }),
      parada({ comercio: 'Pendiente 10:00', hora: '10:00' }),
    ]);
    assert.equal(siguienteParada(mixta, alas(9, 30))?.comercio, 'Pendiente 10:00');
  });
});

// ══════════════════════════════════════════════════
describe('ordenarRuta', () => {
  test('primero por hora, luego las flexibles en su orden original', () => {
    const orden = ordenarRuta([
      parada({ comercio: 'F1', estado: 'flexible' }),
      parada({ comercio: 'B', hora: '10:15' }),
      parada({ comercio: 'A', hora: '9:00' }), // sin cero delante
      parada({ comercio: 'F2' }),
      parada({ comercio: 'C', hora: '15:00' }),
      parada({ comercio: 'D', hora: '09:30' }),
    ]).map((p) => p.comercio);

    assert.deepEqual(orden, ['A', 'D', 'B', 'C', 'F1', 'F2']);
  });

  test('compara minutos y no texto', () => {
    assert.equal(horaAMinutos('9:00'), horaAMinutos('09:00'));
    assert.equal(horaAMinutos(''), null);
    assert.equal(horaAMinutos('99:99'), null);
  });
});

describe('horaNormalizada', () => {
  // Caso real: una celda traia "15:00'" y se pintaba con el apostrofo.
  test('limpia los caracteres de mas de la celda', () => {
    assert.equal(horaNormalizada("15:00'"), '15:00');
    assert.equal(horaNormalizada(" '15:00 "), '15:00');
  });

  test('pone el cero delante', () => {
    assert.equal(horaNormalizada('9:05'), '09:05');
  });

  test('devuelve vacio si no hay hora reconocible', () => {
    assert.equal(horaNormalizada(''), '');
    assert.equal(horaNormalizada('por confirmar'), '');
    assert.equal(horaNormalizada('99:99'), '');
  });

  test('el apostrofo tampoco se cuela en las etiquetas', () => {
    const p = parada({ motivo: VIRTUAL, hora: "15:00'" });
    assert.equal(textoEstado(p, alas(15, 30)), 'En curso · 15:00');
    assert.equal(textoEstado(p, alas(18, 0)), 'Atrasada · 15:00');
    assert.equal(etiquetaHora(parada({ hora: "9:00'" })), '09:00');
  });
});

describe('ubicacionDe', () => {
  test('puerta calle: el literal no tapa la dirección', () => {
    const p = parada({
      mall_puerta: 'Puerta Calle',
      direccion: 'Av. Benavides 730',
      distrito: 'Miraflores',
    });
    assert.equal(ubicacionDe(p), 'Av. Benavides 730 · Miraflores');
  });

  test('centro comercial: mall y distrito', () => {
    const p = parada({ mall_puerta: 'Jockey Plaza', distrito: 'Surco' });
    assert.equal(ubicacionDe(p), 'Jockey Plaza · Surco');
  });

  test('sin dirección ni distrito, cae al mall_puerta', () => {
    assert.equal(ubicacionDe(parada({ mall_puerta: 'Puerta Calle' })), 'Puerta Calle');
  });

  test('sin nada, avisa en vez de quedar vacío', () => {
    assert.equal(ubicacionDe(parada()), 'Sin ubicación');
  });

  test('los nombres en mayúsculas se muestran con mayúscula inicial', () => {
    const cc = parada({ mall_puerta: 'C.C. PLAZA SAN MIGUEL', distrito: 'SAN MIGUEL' });
    assert.equal(ubicacionDe(cc), 'C.C. Plaza San Miguel · San Miguel');

    const pc = parada({
      mall_puerta: 'Puerta Calle',
      direccion: 'AV. BENAVIDES 730',
      distrito: 'MIRAFLORES',
    });
    assert.equal(ubicacionDe(pc), 'Av. Benavides 730 · Miraflores');
  });
});

describe('enlaceMeet', () => {
  test('usa la columna y le pone https si falta', () => {
    const p = parada({ meet_link: 'meet.google.com/abc-defg-hij' });
    assert.equal(enlaceMeet(p), 'https://meet.google.com/abc-defg-hij');
  });

  test('lo busca dentro de las indicaciones de rutas antiguas', () => {
    const p = parada({
      indicaciones: 'Conectar a https://meet.google.com/xyz-1234-abc | interno',
    });
    assert.equal(enlaceMeet(p), 'https://meet.google.com/xyz-1234-abc');
  });

  test('sin enlace devuelve cadena vacía', () => {
    assert.equal(enlaceMeet(parada({ indicaciones: 'Preguntar por Rosa' })), '');
  });
});

describe('varios', () => {
  test('etiquetaHora', () => {
    assert.equal(
      etiquetaHora(parada({ hora: '09:00', hora_fin: '11:00', estado: 'rango' })),
      '09:00 – 11:00',
    );
    assert.equal(etiquetaHora(parada({ estado: 'flexible' })), 'Hora flexible');
    assert.equal(etiquetaHora(parada({ hora: '09:00' })), '09:00');
  });

  test('textoEspera', () => {
    assert.equal(textoEspera(25), 'en 25 min');
    assert.equal(textoEspera(0), 'ahora');
    assert.equal(textoEspera(-5), 'ahora');
    assert.equal(textoEspera(-90), 'hace 1 h');
    assert.equal(textoEspera(75), 'en 1 h 15 min');
    assert.equal(textoEspera(null), '');
  });

  test('las indicaciones cortan en la barra', () => {
    const p = parada({ indicaciones: 'Preguntar por Rosa | meta:3' });
    assert.equal(indicacionesLimpias(p), 'Preguntar por Rosa');
  });

  test('la fecha solo lleva mayúscula inicial y no lleva año', () => {
    assert.equal(fechaLarga(new Date(2026, 9, 20)), 'Martes, 20 de octubre');
  });
});

// ══════════════════════════════════════════════════
describe('visitas que esperan envío', () => {
  const tambo = parada({ id_asignacion: 'ASG-1', status: 'Pendiente' });
  const asics = parada({ id_asignacion: 'ASG-2', status: 'Pendiente' });

  // Punto 8: para el CAP está hecha, aunque el backend no lo sepa aún.
  test('la parada en cola cuenta como hecha, con su resultado', () => {
    const [t, a] = aplicarEncoladas([tambo, asics], [
      { idAsignacion: 'ASG-1', status: 'Incidencia' },
    ]);
    assert.equal(estaCompletada(t), true);
    assert.equal(t.resultado, 'Incidencia');
    assert.equal(estaPendienteDeEnvio(t), true);
    assert.equal(estaCompletada(a), false, 'la otra sigue pendiente');
    assert.equal(estaPendienteDeEnvio(a), false);
  });

  // Ya llegó pero la ruta no se refrescó: manda lo del backend.
  test('si el backend ya la completó, no se toca', () => {
    const hecha = parada({ id_asignacion: 'ASG-1', status: 'Completado', resultado: 'Todo Ok' });
    const [h] = aplicarEncoladas([hecha], [{ idAsignacion: 'ASG-1', status: 'Incidencia' }]);
    assert.equal(h.resultado, 'Todo Ok');
    assert.equal(estaPendienteDeEnvio(h), false);
  });

  // Una visita extra (sin asignación) no marca ninguna parada.
  test('una visita sin asignación no marca nada', () => {
    const r = aplicarEncoladas([tambo], [{ idAsignacion: '', status: 'Todo Ok' }]);
    assert.equal(estaCompletada(r[0]), false);
  });

  test('sin cola, devuelve lo mismo', () => {
    const paradas = [tambo];
    assert.equal(aplicarEncoladas(paradas, []), paradas);
  });
});
