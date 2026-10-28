import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRutaDeHoy,
  getLocalDelDia,
  actualizarLocalTrasVisita,
  precargarLocalesDelDia,
  MS_LOCAL_FRESCO,
  guardarLocalDelDia,
  localDelDiaEnCache,
  rutaNecesitaRefresco,
  rutaActualizadaEn,
  borrarCacheDelDia,
  paradasDelDia,
  asignacionesDeLocal,
  asignacionesPendientesDeLocal,
  asignacionDeLocal,
  type DiaData,
} from './cacheDia.ts';
import type { Parada } from './ruta.ts';
import { armarPeticionVisita, datosTrasVisita, type Autocompletado } from './visita.ts';
import { leerProcesadores, leerBeneficios, leerMaterialPop } from './datosLocal.ts';

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

function dia(pendientes: Parada[], completadas: Parada[] = []): DiaData {
  return {
    fecha: '20/10/2026',
    pendientes,
    completadas,
    total: pendientes.length + completadas.length,
  };
}

// El caso real: Asics en C.C. Plaza San Miguel está asignado dos veces hoy.
const ASICS = 'CC-0456';
const brandingAsics = parada({
  id_asignacion: 'ASG-BRAND',
  id_local: ASICS,
  comercio: 'Asics',
  motivo: 'Branding',
  hora: '11:00',
});
const virtualAsics = parada({
  id_asignacion: 'ASG-VIRT',
  id_local: ASICS,
  comercio: 'Asics',
  motivo: 'Capacitación Virtual',
  hora: '09:00',
});
const otroLocal = parada({
  id_asignacion: 'ASG-TAMBO',
  id_local: 'PC-0001',
  comercio: 'Tambo+',
  hora: '10:00',
});

describe('dos asignaciones del mismo local en un día', () => {
  const d = dia([brandingAsics, virtualAsics, otroLocal]);

  test('las devuelve las dos', () => {
    const todas = asignacionesDeLocal(d, ASICS);
    assert.equal(todas.length, 2);
    assert.deepEqual(
      todas.map((p) => p.id_asignacion).sort(),
      ['ASG-BRAND', 'ASG-VIRT'],
    );
  });

  test('las ordena por hora, no en el orden de la hoja', () => {
    // En la hoja viene antes Branding (11:00) que la virtual (09:00).
    const todas = asignacionesDeLocal(d, ASICS);
    assert.deepEqual(todas.map((p) => p.hora), ['09:00', '11:00']);
  });

  test('las dos siguen pendientes', () => {
    assert.equal(asignacionesPendientesDeLocal(d, ASICS).length, 2);
  });

  // Este es el error que se corrige: antes elegía la primera en silencio
  // y el resultado acababa en la fila equivocada.
  test('no elige ninguna a ciegas: devuelve null para que se pregunte', () => {
    assert.equal(asignacionDeLocal(d, ASICS), null);
  });

  test('no mezcla las de otros locales', () => {
    const otras = asignacionesDeLocal(d, 'PC-0001');
    assert.equal(otras.length, 1);
    assert.equal(otras[0].id_asignacion, 'ASG-TAMBO');
  });
});

describe('una sola asignación pendiente', () => {
  const d = dia([otroLocal]);

  test('se usa automáticamente, sin preguntar', () => {
    const elegida = asignacionDeLocal(d, 'PC-0001');
    assert.ok(elegida);
    assert.equal(elegida.id_asignacion, 'ASG-TAMBO');
  });
});

describe('asignaciones ya completadas', () => {
  const hecha = parada({
    ...brandingAsics,
    status: 'Completado',
    resultado: 'Todo Ok',
  });

  test('se listan, para poder verlas en el detalle', () => {
    const d = dia([], [hecha]);
    assert.equal(asignacionesDeLocal(d, ASICS).length, 1);
  });

  // Reengancharla sobrescribiría su resultado: la segunda visita va suelta.
  test('no cuentan como pendientes ni se eligen', () => {
    const d = dia([], [hecha]);
    assert.deepEqual(asignacionesPendientesDeLocal(d, ASICS), []);
    assert.equal(asignacionDeLocal(d, ASICS), null);
  });

  test('con una hecha y una pendiente, se elige la pendiente', () => {
    const d = dia([virtualAsics], [hecha]);
    assert.equal(asignacionesDeLocal(d, ASICS).length, 2);
    const elegida = asignacionDeLocal(d, ASICS);
    assert.ok(elegida);
    assert.equal(elegida.id_asignacion, 'ASG-VIRT');
  });

  test('reconoce "Completada" en femenino', () => {
    const femenino = parada({ ...brandingAsics, status: 'Completada' });
    const d = dia([], [femenino]);
    assert.deepEqual(asignacionesPendientesDeLocal(d, ASICS), []);
  });
});

describe('local que no está en la ruta', () => {
  const d = dia([otroLocal]);

  test('todo vacío', () => {
    assert.deepEqual(asignacionesDeLocal(d, 'PC-9999'), []);
    assert.deepEqual(asignacionesPendientesDeLocal(d, 'PC-9999'), []);
    assert.equal(asignacionDeLocal(d, 'PC-9999'), null);
  });

  test('sin id_local no busca nada', () => {
    assert.deepEqual(asignacionesDeLocal(d, ''), []);
    assert.equal(asignacionDeLocal(d, ''), null);
  });

  test('sin datos del día tampoco falla', () => {
    assert.deepEqual(asignacionesDeLocal(null, ASICS), []);
    assert.equal(asignacionDeLocal(null, ASICS), null);
    assert.deepEqual(paradasDelDia(null), []);
  });
});

describe('comparación del id_local', () => {
  const d = dia([otroLocal]);

  test('ignora mayúsculas y espacios', () => {
    assert.equal(asignacionesDeLocal(d, 'pc-0001').length, 1);
    assert.equal(asignacionesDeLocal(d, '  PC-0001  ').length, 1);
  });

  test('también si la hoja trae el id con espacios', () => {
    const sucio = dia([parada({ id_local: ' cc-0456 ', id_asignacion: 'ASG-X' })]);
    assert.equal(asignacionesDeLocal(sucio, ASICS).length, 1);
  });
});

describe('paradasDelDia', () => {
  test('junta pendientes y completadas', () => {
    const d = dia([virtualAsics], [parada({ id_asignacion: 'ASG-Z', status: 'Completado' })]);
    assert.equal(paradasDelDia(d).length, 2);
  });
});

// ══════════════════════════════════════════════════
//  Copia en el celular
// ══════════════════════════════════════════════════

/** Fecha de hoy como la escribe cacheDia (dd/MM/yyyy). */
function hoy(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const ROSA = { nombre: 'Rosa Diaz', correo: 'rosa@empresa.pe', rol: 'CAP' };

/** Navegador mínimo: storage compartido y una sesión abierta de Rosa. */
function montarNavegador() {
  const datos = new Map<string, string>([
    ['rw_token', 'token'],
    ['rw_user', JSON.stringify(ROSA)],
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
  return datos;
}

const fetchReal = globalThis.fetch;
let llamadas = 0;

/** El backend responde esto a cualquier llamada. */
function backend(cuerpo: unknown) {
  globalThis.fetch = (async () => {
    llamadas++;
    return { status: 200, ok: true, json: async () => cuerpo } as Response;
  }) as typeof fetch;
}

function sinSenal() {
  globalThis.fetch = (async () => {
    llamadas++;
    throw new TypeError('Failed to fetch');
  }) as typeof fetch;
}

const rutaVieja = dia([otroLocal]);
const rutaFresca = dia([otroLocal, brandingAsics]);

function copiaEnDisco(
  datos: Map<string, string>,
  campos: Partial<{ correo: string; fecha: string; data: DiaData }> = {},
) {
  datos.set(
    'rw_ruta_dia',
    JSON.stringify({
      correo: ROSA.correo,
      fecha: hoy(),
      data: rutaVieja,
      actualizadoEn: 1000,
      ...campos,
    }),
  );
}

describe('copia de la ruta en el celular', () => {
  let datos: Map<string, string>;

  beforeEach(() => {
    datos = montarNavegador();
    borrarCacheDelDia();
    llamadas = 0;
  });

  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  test('pinta al instante sin esperar al backend', async () => {
    copiaEnDisco(datos);
    sinSenal();

    const r = await getRutaDeHoy();

    assert.equal(r.ok, true);
    assert.equal(r.data?.pendientes.length, 1);
    assert.equal(llamadas, 0, 'no debería haber llamado al backend');
    assert.equal(rutaActualizadaEn(), 1000);
  });

  // El fallo que se corrige: la copia se daba por buena todo el día.
  test('avisa de que la copia hay que refrescarla, y al refrescar la cambia', async () => {
    copiaEnDisco(datos);
    await getRutaDeHoy();
    assert.equal(rutaNecesitaRefresco(), true);

    backend({ ok: true, data: rutaFresca });
    const r = await getRutaDeHoy(true);

    assert.equal(r.data?.pendientes.length, 2);
    assert.equal(rutaNecesitaRefresco(), false);
    const enDisco = JSON.parse(datos.get('rw_ruta_dia')!);
    assert.equal(enDisco.data.pendientes.length, 2, 'la copia también se actualiza');
  });

  test('sin señal, refrescar devuelve la copia en vez de un error', async () => {
    copiaEnDisco(datos);
    sinSenal();

    const r = await getRutaDeHoy(true);

    assert.equal(r.ok, true);
    assert.equal(r.data?.pendientes.length, 1);
  });

  test('la ruta de ayer no se enseña', async () => {
    copiaEnDisco(datos, { fecha: '01/01/2020' });
    sinSenal();

    const r = await getRutaDeHoy();

    assert.equal(r.ok, false);
  });

  // Celular compartido: la ruta de otro CAP no se le enseña a Rosa.
  test('la ruta de otro CAP no se enseña', async () => {
    copiaEnDisco(datos, { correo: 'otro@empresa.pe' });
    sinSenal();

    const r = await getRutaDeHoy();

    assert.equal(r.ok, false);
  });

  // La copia no debe tapar una sesión vencida: hay que ir al login.
  test('una sesión vencida no se tapa con la copia', async () => {
    copiaEnDisco(datos);
    backend({ ok: false, authError: true, error: 'Sesión expirada.' });

    const r = await getRutaDeHoy(true);

    assert.equal(r.authError, true);
  });

  test('al cerrar sesión se borra', async () => {
    copiaEnDisco(datos);
    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });

    borrarCacheDelDia();

    assert.equal(datos.has('rw_ruta_dia'), false);
    assert.equal(datos.has('rw_locales_dia'), false);
  });
});

describe('locales del día en el celular', () => {
  let datos: Map<string, string>;

  beforeEach(() => {
    datos = montarNavegador();
    borrarCacheDelDia();
  });

  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  test('con señal trae el local y lo deja guardado', async () => {
    backend({ ok: true, data: { comercio: 'Tambo+' } });

    const r = await getLocalDelDia<{ comercio: string }>('pc-0001');

    assert.equal(r.data?.comercio, 'Tambo+');
    assert.equal(r.deCache, undefined);
    assert.equal(localDelDiaEnCache<{ comercio: string }>('PC-0001')?.datos.comercio, 'Tambo+');
  });

  /** Un momento en que la copia recién guardada ya no es reciente. */
  const MAS_TARDE = () => Date.now() + MS_LOCAL_FRESCO + 1000;

  test('sin señal usa la copia y dice de cuándo es', async () => {
    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });
    sinSenal();

    const r = await getLocalDelDia<{ comercio: string }>('PC-0001', undefined, MAS_TARDE());

    assert.equal(r.ok, true);
    assert.equal(r.data?.comercio, 'Tambo+');
    assert.equal(r.deCache, true);
    assert.ok((r.guardadoEn || 0) > 0);
  });

  // Si el backend responde que no existe, una copia vieja no lo tapa.
  test('un "no encontrado" del backend no se tapa con la copia', async () => {
    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });
    backend({ ok: false, error: 'Local no encontrado' });

    const r = await getLocalDelDia('PC-0001', undefined, MAS_TARDE());

    assert.equal(r.ok, false);
  });

  test('sin señal y sin copia, da error', async () => {
    sinSenal();
    const r = await getLocalDelDia('PC-9999');
    assert.equal(r.ok, false);
  });

  test('al guardar se tiran los locales vencidos', () => {
    datos.set(
      'rw_locales_dia',
      JSON.stringify({
        'PC-VIEJO': { correo: ROSA.correo, fecha: '01/01/2020', guardadoEn: 1, datos: {} },
      }),
    );

    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });

    const mapa = JSON.parse(datos.get('rw_locales_dia')!);
    assert.deepEqual(Object.keys(mapa), ['PC-0001']);
  });

  test('el local guardado por otro CAP no se usa', () => {
    datos.set(
      'rw_locales_dia',
      JSON.stringify({
        'PC-0001': { correo: 'otro@empresa.pe', fecha: hoy(), guardadoEn: 1, datos: {} },
      }),
    );
    assert.equal(localDelDiaEnCache('PC-0001'), null);
  });
});

// ══════════════════════════════════════════════════
describe('no pedir dos veces el mismo local', () => {
  let llamadasLocal = 0;

  beforeEach(() => {
    montarNavegador();
    borrarCacheDelDia();
    llamadasLocal = 0;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  /** Un backend que cuenta las llamadas y tarda un poco, como Apps Script. */
  function backendLento(cuerpo: unknown) {
    globalThis.fetch = (async () => {
      llamadasLocal++;
      await new Promise((r) => setTimeout(r, 5));
      return { status: 200, ok: true, json: async () => cuerpo } as Response;
    }) as typeof fetch;
  }

  // El caso medido: Hoy precarga, el CAP abre el detalle y luego el
  // registro. Antes eran 3 llamadas iguales; ahora 1.
  test('Hoy → Detalle → Registro hace una sola llamada', async () => {
    backendLento({ ok: true, data: { comercio: 'Tambo+' } });

    await precargarLocalesDelDia(['PC-0001']);
    const detalle = await getLocalDelDia<{ comercio: string }>('PC-0001');
    const registro = await getLocalDelDia<{ comercio: string }>('PC-0001');

    assert.equal(llamadasLocal, 1);
    assert.equal(detalle.data?.comercio, 'Tambo+');
    assert.equal(registro.data?.comercio, 'Tambo+');
    assert.equal(registro.deCache, undefined, 'no es un aviso de sin señal');
  });

  test('una copia de más de 10 min se vuelve a pedir', async () => {
    backendLento({ ok: true, data: { comercio: 'Tambo+' } });
    await getLocalDelDia('PC-0001');

    backendLento({ ok: true, data: { comercio: 'Tambo+ Express' } });
    const r = await getLocalDelDia<{ comercio: string }>(
      'PC-0001',
      undefined,
      Date.now() + MS_LOCAL_FRESCO + 1000,
    );

    assert.equal(llamadasLocal, 2, 'la primera y la de refresco');
    assert.equal(r.data?.comercio, 'Tambo+ Express');
  });

  // El detalle y la precarga piden el mismo local a la vez: una sola llamada.
  test('dos pedidos a la vez del mismo local comparten la llamada', async () => {
    backendLento({ ok: true, data: { comercio: 'Tambo+' } });

    const [a, b] = await Promise.all([
      getLocalDelDia<{ comercio: string }>('PC-0001'),
      getLocalDelDia<{ comercio: string }>('pc-0001'),
    ]);

    assert.equal(llamadasLocal, 1);
    assert.equal(a.data?.comercio, 'Tambo+');
    assert.equal(b.data?.comercio, 'Tambo+');
  });

  test('locales distintos sí piden cada uno', async () => {
    backendLento({ ok: true, data: { comercio: 'X' } });
    await Promise.all([getLocalDelDia('PC-0001'), getLocalDelDia('PC-0002')]);
    assert.equal(llamadasLocal, 2);
  });
});

// ══════════════════════════════════════════════════
// El bug de GMO (PC-0736): se registró una visita y, al abrir otra al
// mismo local antes de 10 min, salía "no tiene visitas previas".
describe('tras guardar una visita, la copia del local la refleja', () => {
  let llamadasLocal = 0;

  beforeEach(() => {
    montarNavegador();
    borrarCacheDelDia();
    llamadasLocal = 0;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  const GMO = {
    id_local: 'PC-0736',
    comercio: 'GMO',
    mall_puerta: 'Puerta calle',
    direccion: 'Av. Larco 123',
    kam: 'Ana',
    procesador_pos: '',
    codigo_niubiz: '',
    beneficios: '',
    material_pop: '',
    ultima_visita: '',
  };

  const visitaGuardada = () =>
    armarPeticionVisita(
      GMO,
      {
        procesador: 'Niubiz, Culqi',
        cod_openpay: '',
        cod_niubiz: '111',
        cod_izipay: '',
        cod_culqi: '222',
        beneficios: 'PSI 6, PUNTOS BBVA, 2x1 jueves',
        material_pop: 'Permite',
        motivo: 'Visita',
        contacto: 'Rosa',
        celular: '987654321',
        status: 'Todo Ok',
        observacion: '',
      },
      // 27/10/2026 15:26 en Lima (UTC-5).
      { fotosBase64: [], idAsignacion: '', idVisita: 'v-1', creadoEn: Date.UTC(2026, 9, 27, 20, 26) },
    );

  function contarLlamadas() {
    globalThis.fetch = (async () => {
      llamadasLocal++;
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
  }

  test('guardar visita → abrir de nuevo el mismo local → llegan los datos nuevos', async () => {
    // La copia de cuando se abrió el primer registro: sin visitas previas.
    guardarLocalDelDia('PC-0736', GMO);

    actualizarLocalTrasVisita('PC-0736', GMO, datosTrasVisita(visitaGuardada(), 'Rosa Diaz'));

    // Antes de 10 min y sin señal: sale de la copia, ya con la visita.
    contarLlamadas();
    const r = await getLocalDelDia<Autocompletado>('PC-0736');
    assert.equal(llamadasLocal, 0);
    const a = r.data!;
    assert.equal(a.ultima_visita, '27/10/2026 15:26');
    assert.equal(a.comercio, 'GMO', 'lo que la visita no cambia se conserva');

    const procesadores = leerProcesadores(a.procesador_pos, {
      cod_niubiz: a.codigo_niubiz,
      cod_culqi: a.codigo_culqi,
    });
    assert.deepEqual(procesadores.marcados, ['Niubiz', 'Culqi']);
    assert.equal(procesadores.codigos.cod_culqi, '222');
    assert.deepEqual(leerBeneficios(a.beneficios), {
      marcados: ['PSI 6', 'PUNTOS BBVA'],
      otro: true,
      textoOtro: '2x1 jueves',
    });
    assert.equal(leerMaterialPop(a.material_pop), 'Permite');
    assert.equal(a.ultimo_status, 'Todo Ok');
    assert.equal(a.ultimo_cap, 'Rosa Diaz');
  });

  // El registro pide `fresco`: con señal pregunta aunque la copia sea de
  // hace un momento, y guarda lo nuevo.
  test('con fresco y señal, pregunta al servidor aunque la copia sea reciente', async () => {
    guardarLocalDelDia('PC-0736', GMO);
    globalThis.fetch = (async () => {
      llamadasLocal++;
      return {
        status: 200,
        ok: true,
        json: async () => ({ ok: true, data: { ...GMO, ultima_visita: '27/10/2026 15:26' } }),
      } as Response;
    }) as typeof fetch;

    const r = await getLocalDelDia<Autocompletado>('PC-0736', undefined, undefined, { fresco: true });

    assert.equal(llamadasLocal, 1);
    assert.equal(r.deCache, undefined);
    assert.equal(r.data?.ultima_visita, '27/10/2026 15:26');
    assert.equal(localDelDiaEnCache<Autocompletado>('PC-0736')?.datos.ultima_visita, '27/10/2026 15:26');
  });

  test('sin fresco, la copia reciente se sigue usando sin llamar (detalle y mapa)', async () => {
    guardarLocalDelDia('PC-0736', GMO);
    contarLlamadas();
    await getLocalDelDia('PC-0736');
    assert.equal(llamadasLocal, 0);
  });

  test('con fresco y sin señal, la copia con el aviso de cuándo es', async () => {
    guardarLocalDelDia('PC-0736', GMO);
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    try {
      contarLlamadas();
      const r = await getLocalDelDia<Autocompletado>('PC-0736', undefined, undefined, { fresco: true });
      assert.equal(llamadasLocal, 0, 'sin señal ni lo intenta');
      assert.equal(r.deCache, true);
      assert.ok(r.guardadoEn);
      assert.equal(r.data?.comercio, 'GMO');
    } finally {
      if (nav) Object.defineProperty(globalThis, 'navigator', nav);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });

  test('sin copia previa, se crea desde lo que tenía el formulario', async () => {
    actualizarLocalTrasVisita('PC-0736', GMO, datosTrasVisita(visitaGuardada()));
    const copia = localDelDiaEnCache<Autocompletado>('pc-0736')?.datos;
    assert.equal(copia?.comercio, 'GMO');
    assert.equal(copia?.codigo_culqi, '222');
    assert.equal(copia?.ultima_visita, '27/10/2026 15:26');
  });
});

// ══════════════════════════════════════════════════
// Rutas de los próximos días: cuando llega su día, son la ruta de hoy.
describe('la ruta próxima al llegar su día', () => {
  let datos: Map<string, string>;

  beforeEach(() => {
    datos = montarNavegador();
    borrarCacheDelDia();
    llamadas = 0;
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  function proximaDeHoy() {
    datos.set(
      'rw_rutas_proximas',
      JSON.stringify({ correo: ROSA.correo, guardadoEn: 1000, dias: [{ ...dia([brandingAsics]), fecha: hoy() }] }),
    );
  }

  test('sin señal y sin copia de hoy, usa la que se guardó como próxima', async () => {
    proximaDeHoy();
    sinSenal();
    const r = await getRutaDeHoy();
    assert.equal(r.ok, true);
    assert.equal(r.data?.pendientes[0].id_asignacion, 'ASG-BRAND');
    assert.equal(rutaNecesitaRefresco(), true, 'es una copia: se pide la fresca');
  });

  test('con señal, manda lo que dice el servidor', async () => {
    proximaDeHoy();
    backend({ ok: true, data: dia([otroLocal]) });
    const r = await getRutaDeHoy(true);
    assert.deepEqual(r.data?.pendientes.map((p) => p.id_asignacion), [otroLocal.id_asignacion]);
  });

  test('la de otro CAP no se usa', async () => {
    datos.set(
      'rw_rutas_proximas',
      JSON.stringify({ correo: 'otro@empresa.pe', guardadoEn: 1000, dias: [{ ...dia([brandingAsics]), fecha: hoy() }] }),
    );
    sinSenal();
    assert.equal((await getRutaDeHoy()).ok, false);
  });
});

describe('copia de los locales: 7 días de respaldo', () => {
  let datos: Map<string, string>;
  beforeEach(() => {
    datos = montarNavegador();
    borrarCacheDelDia();
  });

  const guardadaHace = (dias: number) =>
    datos.set(
      'rw_locales_dia',
      JSON.stringify({
        'PC-0001': { correo: ROSA.correo, fecha: '01/01/2026', guardadoEn: Date.now() - dias * 86_400_000, datos: { comercio: 'Tambo+' } },
      }),
    );

  test('una de hace 3 días sirve sin señal (la precargó la ruta de los próximos días)', () => {
    guardadaHace(3);
    assert.equal(localDelDiaEnCache<{ comercio: string }>('PC-0001')?.datos.comercio, 'Tambo+');
  });

  test('una de hace 8 días ya no', () => {
    guardadaHace(8);
    assert.equal(localDelDiaEnCache('PC-0001'), null);
  });
});
