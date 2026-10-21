import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getRutaDeHoy,
  getLocalDelDia,
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

  test('sin señal usa la copia y dice de cuándo es', async () => {
    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });
    sinSenal();

    const r = await getLocalDelDia<{ comercio: string }>('PC-0001');

    assert.equal(r.ok, true);
    assert.equal(r.data?.comercio, 'Tambo+');
    assert.equal(r.deCache, true);
    assert.ok((r.guardadoEn || 0) > 0);
  });

  // Si el backend responde que no existe, una copia vieja no lo tapa.
  test('un "no encontrado" del backend no se tapa con la copia', async () => {
    guardarLocalDelDia('PC-0001', { comercio: 'Tambo+' });
    backend({ ok: false, error: 'Local no encontrado' });

    const r = await getLocalDelDia('PC-0001');

    assert.equal(r.ok, false);
  });

  test('sin señal y sin copia, da error', async () => {
    sinSenal();
    const r = await getLocalDelDia('PC-9999');
    assert.equal(r.ok, false);
  });

  test('al guardar se tiran los locales de otros días', () => {
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
