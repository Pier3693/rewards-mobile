import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  parsearFecha,
  tituloDeDia,
  agruparPorDia,
  unirConCola,
  filtrarPorStatus,
  contarPorStatus,
  resumen,
  fotosDe,
  fechaComoBackend,
  getMisVisitas,
  borrarCopiaHistorial,
  sePuedeEditar,
  visitaDeHoyDelLocal,
  aplicarEdiciones,
  type VisitaApi,
  type VisitaHistorial,
  type Dia,
} from './historial.ts';
import type { Status } from './visita.ts';
import { nuevaEntrada, nuevaEdicion } from './cola.ts';

/** Miércoles 28 de octubre de 2026: la semana empezó el lunes 26. */
const HOY: Dia = { anio: 2026, mes: 10, dia: 28 };

function visita(campos: Partial<VisitaApi> = {}): VisitaApi {
  return {
    id_visita: '',
    fecha: '28/10/2026 10:00',
    id_local: 'PC-0001',
    comercio: 'Tambo+',
    mall_puerta: 'Puerta Calle',
    direccion: 'Av. Benavides 730',
    motivo: 'Visita',
    status: 'Todo Ok',
    observacion: '',
    fotos: '',
    ...campos,
  };
}

function enCola(idVisita: string, creadoEn = Date.UTC(2026, 9, 28, 15, 0)) {
  return nuevaEntrada(
    idVisita,
    { motivo: 'Branding', observacion: '[Falta material] Sin stickers', fotosBase64: ['data:image/jpeg;base64,AAAA'] },
    { comercio: 'Asics', status: 'Incidencia', idAsignacion: 'ASG-1', idLocal: 'CC-0456' },
    'rosa@empresa.pe',
    creadoEn,
  );
}

// ══════════════════════════════════════════════════
describe('fechas', () => {
  test('lee la fecha del backend', () => {
    assert.deepEqual(parsearFecha('05/03/2026 09:07'), { anio: 2026, mes: 3, dia: 5, hora: '09:07' });
  });

  test('sin hora también vale', () => {
    assert.deepEqual(parsearFecha('05/03/2026'), { anio: 2026, mes: 3, dia: 5, hora: '' });
  });

  test('lo que no es una fecha da null', () => {
    assert.equal(parsearFecha(''), null);
    assert.equal(parsearFecha(undefined), null);
    assert.equal(parsearFecha('2026-03-05'), null);
    assert.equal(parsearFecha('40/13/2026 10:00'), null);
  });

  test('Hoy, Ayer y el resto con día de la semana', () => {
    assert.equal(tituloDeDia(HOY, HOY), 'Hoy');
    assert.equal(tituloDeDia({ anio: 2026, mes: 10, dia: 27 }, HOY), 'Ayer');
    assert.equal(tituloDeDia({ anio: 2026, mes: 10, dia: 19 }, HOY), 'Lun 19 oct');
  });

  // El 1 de enero, "ayer" es el 31 de diciembre de otro año.
  test('el cambio de mes y de año', () => {
    const anioNuevo: Dia = { anio: 2026, mes: 1, dia: 2 };
    assert.equal(tituloDeDia({ anio: 2026, mes: 1, dia: 1 }, anioNuevo), 'Ayer');
    assert.equal(tituloDeDia({ anio: 2025, mes: 12, dia: 29 }, anioNuevo), 'Lun 29 dic 2025');
  });

  test('fechaComoBackend escribe como el backend', () => {
    const ms = new Date(2026, 9, 28, 8, 5).getTime();
    assert.equal(fechaComoBackend(ms), '28/10/2026 08:05');
    assert.deepEqual(parsearFecha(fechaComoBackend(ms)), { anio: 2026, mes: 10, dia: 28, hora: '08:05' });
  });
});

describe('agrupar por día', () => {
  test('de más reciente a más antiguo, también dentro del día', () => {
    const grupos = agruparPorDia(
      [
        visita({ comercio: 'A', fecha: '27/10/2026 09:00' }),
        visita({ comercio: 'B', fecha: '28/10/2026 08:00' }),
        visita({ comercio: 'C', fecha: '28/10/2026 17:30' }),
        visita({ comercio: 'D', fecha: '19/10/2026 11:00' }),
      ],
      HOY,
    );
    assert.deepEqual(grupos.map((g) => g.titulo), ['Hoy', 'Ayer', 'Lun 19 oct']);
    assert.deepEqual(grupos[0].visitas.map((v) => v.comercio), ['C', 'B']);
  });

  test('las que no tienen fecha van al final', () => {
    const grupos = agruparPorDia([visita({ fecha: '' }), visita()], HOY);
    assert.deepEqual(grupos.map((g) => g.titulo), ['Hoy', 'Sin fecha']);
  });

  test('sin visitas, sin grupos', () => {
    assert.deepEqual(agruparPorDia([], HOY), []);
  });
});

describe('unir el historial con la cola', () => {
  test('la cola va arriba, marcada como pendiente', () => {
    const r = unirConCola([visita({ id_visita: 'v-1' })], [enCola('v-2')]);
    assert.equal(r.pendientes.length, 1);
    assert.equal(r.pendientes[0].pendiente, true);
    assert.equal(r.pendientes[0].comercio, 'Asics');
    assert.equal(r.pendientes[0].motivo, 'Branding');
    assert.equal(r.pendientes[0].status, 'Incidencia');
    assert.equal(r.pendientes[0].fotosBase64?.length, 1);
    assert.equal(r.enviadas[0].pendiente, false);
  });

  // Llegó al backend pero la cola todavía no se enteró: una sola vez.
  test('la que ya está en el backend no se repite', () => {
    const r = unirConCola([visita({ id_visita: 'v-2' })], [enCola('v-2')]);
    assert.equal(r.pendientes.length, 0);
    assert.equal(r.enviadas.length, 1);
  });

  // Las del escritorio no traen id: no pueden "tapar" a una de la cola.
  test('las del escritorio, sin id, no se toman por repetidas', () => {
    const r = unirConCola([visita({ id_visita: '' })], [enCola('v-3')]);
    assert.equal(r.pendientes.length, 1);
    assert.equal(r.enviadas.length, 1);
  });

  // La pendiente muestra la hora en que se tocó Guardar, la misma que
  // llegará a la hoja, no la de cuando entró en la cola.
  test('la pendiente muestra la hora de creado_en', () => {
    const e = enCola('v-9', new Date(2026, 9, 28, 14, 30).getTime());
    e.payload = { ...e.payload, creado_en: new Date(2026, 9, 28, 13, 47).getTime() };
    const r = unirConCola([], [e]);
    assert.equal(r.pendientes[0].fecha, '28/10/2026 13:47');
  });

  test('la cola más reciente primero', () => {
    const r = unirConCola([], [enCola('vieja', 1000), enCola('nueva', 2000)]);
    assert.deepEqual(r.pendientes.map((v) => v.id_visita), ['nueva', 'vieja']);
  });

  test('sin cola, solo el historial', () => {
    const r = unirConCola([visita()], []);
    assert.deepEqual(r.pendientes, []);
    assert.equal(r.enviadas.length, 1);
  });
});

describe('filtro por status', () => {
  const lista = [
    visita({ status: 'Todo Ok' }),
    visita({ status: 'incidencia ' }), // la hoja a veces lo trae así
    visita({ status: 'Incidencia' }),
    visita({ status: 'No existe' }),
  ];

  test('filtra ignorando mayúsculas y espacios', () => {
    assert.equal(filtrarPorStatus(lista, 'Incidencia').length, 2);
    assert.equal(filtrarPorStatus(lista, 'Reprogramar').length, 0);
    assert.equal(filtrarPorStatus(lista, 'todas').length, 4);
  });

  test('cuenta cada status', () => {
    assert.deepEqual(contarPorStatus(lista), {
      todas: 4,
      'Todo Ok': 1,
      Incidencia: 2,
      Reprogramar: 0,
      'No existe': 1,
    });
  });
});

describe('resumen de hoy y de la semana', () => {
  test('cuenta hoy y de lunes a hoy', () => {
    const r = resumen(
      [
        visita({ fecha: '28/10/2026 09:00' }), // hoy
        visita({ fecha: '28/10/2026 16:00' }), // hoy
        visita({ fecha: '26/10/2026 10:00' }), // lunes: esta semana
        visita({ fecha: '25/10/2026 10:00' }), // domingo: la semana pasada
        visita({ fecha: '19/10/2026 10:00' }),
      ],
      HOY,
    );
    assert.deepEqual(r, { hoy: 2, semana: 3 });
  });

  test('un lunes la semana es solo hoy', () => {
    const lunes: Dia = { anio: 2026, mes: 10, dia: 26 };
    const r = resumen([visita({ fecha: '26/10/2026 09:00' }), visita({ fecha: '25/10/2026 09:00' })], lunes);
    assert.deepEqual(r, { hoy: 1, semana: 1 });
  });

  test('el domingo todavía es la misma semana', () => {
    const domingo: Dia = { anio: 2026, mes: 11, dia: 1 };
    const r = resumen([visita({ fecha: '26/10/2026 09:00' })], domingo);
    assert.equal(r.semana, 1);
  });

  // Las de la cola cuentan: el trabajo está hecho aunque no haya llegado.
  test('con la cola unida, cuenta también lo pendiente', () => {
    const { pendientes, enviadas } = unirConCola([visita({ id_visita: 'v-1' })], [
      enCola('v-2', new Date(2026, 9, 28, 11, 0).getTime()),
    ]);
    assert.deepEqual(resumen([...pendientes, ...enviadas], HOY), { hoy: 2, semana: 2 });
  });

  test('sin visitas, ceros', () => {
    assert.deepEqual(resumen([], HOY), { hoy: 0, semana: 0 });
  });
});

describe('fotos', () => {
  test('saca la miniatura de cada enlace de Drive', () => {
    const r = fotosDe(
      'https://drive.google.com/file/d/AbC_12-x/view, https://drive.google.com/file/d/Zz9/view',
    );
    assert.equal(r.fotos.length, 2);
    assert.equal(r.fotos[0].url, 'https://drive.google.com/file/d/AbC_12-x/view');
    assert.equal(r.fotos[0].miniatura, 'https://drive.google.com/thumbnail?id=AbC_12-x&sz=w240');
    assert.equal(r.nota, '');
  });

  test('el texto de "no se pudieron subir" queda como nota', () => {
    const r = fotosDe('2 foto(s) - no se pudieron subir');
    assert.deepEqual(r.fotos, []);
    assert.equal(r.nota, '2 foto(s) - no se pudieron subir');
  });

  test('un enlace sin id de Drive se abre igual, sin miniatura', () => {
    const r = fotosDe('https://ejemplo.com/foto.jpg');
    assert.equal(r.fotos[0].miniatura, '');
  });

  test('vacío, nada', () => {
    assert.deepEqual(fotosDe(''), { fotos: [], nota: '' });
    assert.deepEqual(fotosDe(undefined), { fotos: [], nota: '' });
  });
});

// ══════════════════════════════════════════════════
describe('copia en el celular', () => {
  const ROSA = { nombre: 'Rosa Díaz', correo: 'rosa@empresa.pe', rol: 'CAP' };
  const fetchReal = globalThis.fetch;
  let datos: Map<string, string>;

  function montarNavegador(usuario = ROSA) {
    datos = new Map([
      ['rw_token', 'token'],
      ['rw_user', JSON.stringify(usuario)],
    ]);
    const storage = {
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
      removeItem: (k: string) => void datos.delete(k),
    };
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { href: '/historial' },
    };
  }

  function backend(cuerpo: unknown) {
    globalThis.fetch = (async () =>
      ({ status: 200, ok: true, json: async () => cuerpo }) as Response) as typeof fetch;
  }
  function sinSenal() {
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
  }

  beforeEach(() => {
    montarNavegador();
    borrarCopiaHistorial();
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  test('con señal la trae y la guarda', async () => {
    backend({ ok: true, data: [visita({ comercio: 'Tambo+' })] });
    const r = await getMisVisitas(true);
    assert.equal(r.ok, true);
    assert.equal(r.deCache, undefined);
    assert.ok(datos.has('rw_historial'));
  });

  test('sin señal usa la copia y dice de cuándo es', async () => {
    backend({ ok: true, data: [visita({ comercio: 'Tambo+' })] });
    await getMisVisitas(true);

    sinSenal();
    const r = await getMisVisitas(true);
    assert.equal(r.ok, true);
    assert.equal(r.deCache, true);
    assert.equal(r.data?.[0].comercio, 'Tambo+');
    assert.ok((r.guardadoEn || 0) > 0);
  });

  test('la copia de otro CAP no se enseña', async () => {
    backend({ ok: true, data: [visita()] });
    await getMisVisitas(true);

    montarNavegador({ nombre: 'Luis', correo: 'luis@empresa.pe', rol: 'CAP' });
    datos.set('rw_historial', JSON.stringify({ correo: 'rosa@empresa.pe', guardadoEn: 1, data: [visita()] }));
    sinSenal();
    const r = await getMisVisitas(true);
    assert.equal(r.ok, false);
  });

  // Un error del backend o la sesión vencida no se tapan con la copia.
  test('una sesión vencida no se tapa con la copia', async () => {
    backend({ ok: true, data: [visita()] });
    await getMisVisitas(true);

    backend({ ok: false, authError: true, error: 'Sesión expirada.' });
    const r = await getMisVisitas(true);
    assert.equal(r.authError, true);
  });

  test('borrar la copia al cerrar sesión', async () => {
    backend({ ok: true, data: [visita()] });
    await getMisVisitas(true);
    borrarCopiaHistorial();
    assert.equal(datos.has('rw_historial'), false);
  });
});

// ══════════════════════════════════════════════════
// Corregir una visita: el duplicado de Depilzone (28/10, 09:34 y 09:36).
describe('editar una visita', () => {
  const AHORA = new Date(2026, 9, 28, 18, 0);

  const correccion = (idVisita: string, campos: Record<string, unknown>, creadoEn = Date.UTC(2026, 9, 28, 20)) =>
    nuevaEdicion(
      `e-${creadoEn}`,
      { id_visita: idVisita, fotosBase64: [], ...campos },
      { comercio: 'Depilzone', status: (campos.status || 'Todo Ok') as Status, idAsignacion: '', idLocal: 'PC-0001' },
      'rosa@empresa.pe',
      creadoEn,
    );

  test('solo el mismo día y con id_local', () => {
    assert.equal(sePuedeEditar(visita({ fecha: '28/10/2026 09:34' }), AHORA), true);
    assert.equal(sePuedeEditar(visita({ fecha: '27/10/2026 23:59' }), AHORA), false);
    assert.equal(sePuedeEditar(visita({ fecha: '' }), AHORA), false);
    assert.equal(sePuedeEditar(visita({ fecha: '28/10/2026 09:34', id_local: '' }), AHORA), false);
  });

  test('la visita de hoy del local: con un duplicado, la más reciente', () => {
    const lista = [
      visita({ id_visita: 'a', fecha: '28/10/2026 09:34' }),
      visita({ id_visita: 'b', fecha: '28/10/2026 09:36' }),
      visita({ id_visita: 'c', fecha: '27/10/2026 10:00' }),
      visita({ id_visita: 'd', fecha: '28/10/2026 11:00', id_local: 'PC-0002' }),
    ];
    assert.equal(visitaDeHoyDelLocal(lista, 'pc-0001', AHORA)?.id_visita, 'b');
    assert.equal(visitaDeHoyDelLocal(lista, 'PC-0009', AHORA), null);
  });

  test('lo que se ve ya incluye la corrección pendiente', () => {
    const v: VisitaHistorial = { ...visita({ id_visita: 'b', status: 'Todo Ok', beneficios: 'PSI 6' }), pendiente: false };
    const r = aplicarEdiciones(v, [
      correccion('b', { status: 'Incidencia', observacion: '[Falta material] Sin stickers', beneficios: 'PSI 6, PUNTOS BBVA' }),
    ]);
    assert.equal(r.status, 'Incidencia');
    assert.equal(r.beneficios, 'PSI 6, PUNTOS BBVA');
    assert.equal(r.edicionPendiente, true);
    assert.equal(r.comercio, 'Tambo+', 'lo que no se edita no cambia');
  });

  test('con dos correcciones, los campos de la última y las fotos de las dos', () => {
    const v: VisitaHistorial = { ...visita({ id_visita: 'b' }), pendiente: false };
    const r = aplicarEdiciones(v, [
      correccion('b', { status: 'Reprogramar', fotosBase64: ['data:image/jpeg;base64,BBBB'] }, Date.UTC(2026, 9, 28, 21)),
      correccion('b', { status: 'Incidencia', fotosBase64: ['data:image/jpeg;base64,AAAA'] }, Date.UTC(2026, 9, 28, 20)),
    ]);
    assert.equal(r.status, 'Reprogramar');
    assert.deepEqual(r.fotosBase64, ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB']);
  });

  test('una corrección de otra visita no la toca', () => {
    const v: VisitaHistorial = { ...visita({ id_visita: 'a' }), pendiente: false };
    assert.equal(aplicarEdiciones(v, [correccion('b', { status: 'Incidencia' })]), v);
  });

  test('en el historial no sale como una visita más, sino sobre la que corrige', () => {
    const historial = [visita({ id_visita: 'b', status: 'Todo Ok' })];
    const { pendientes, enviadas } = unirConCola(historial, [correccion('b', { status: 'Incidencia' })]);
    assert.equal(pendientes.length, 0);
    assert.equal(enviadas.length, 1);
    assert.equal(enviadas[0].status, 'Incidencia');
    assert.equal(enviadas[0].edicionPendiente, true);
  });

  test('una visita en cola trae sus datos del local para poder corregirla', () => {
    const e = nuevaEntrada(
      'v-1',
      { procesador: 'Niubiz', cod_niubiz: '111', beneficios: 'PSI 6', material_pop: 'Permite', contacto: 'Rosa', celular: '987654321' },
      { comercio: 'Depilzone', status: 'Todo Ok', idAsignacion: '', idLocal: 'PC-0001' },
      'rosa@empresa.pe',
      Date.UTC(2026, 9, 28, 14, 34),
    );
    const [v] = unirConCola([], [e]).pendientes;
    assert.equal(v.procesador, 'Niubiz');
    assert.equal(v.cod_niubiz, '111');
    assert.equal(v.material_pop, 'Permite');
    assert.equal(v.celular, '987654321');
  });
});
