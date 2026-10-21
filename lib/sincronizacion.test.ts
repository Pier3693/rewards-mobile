import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  procesarCola,
  registrarResultado,
  esperaParaIntento,
  tocaReintentar,
  esperaEnvioManual,
  ESPERAS_MS,
  MAX_INTENTOS_AUTOMATICOS,
} from './sincronizacion.ts';
import {
  nuevaEntrada,
  ordenarPorAntiguedad,
  encoladasDeAsignacion,
  localTieneEncolada,
  delUsuario,
  type AlmacenCola,
  type VisitaEncolada,
} from './cola.ts';
import type { ApiResponse } from './api.ts';

const AHORA = 1_700_000_000_000;
/** El CAP conectado en casi todas las pruebas. */
const CORREO = 'rosa@empresa.pe';

function visita(campos: Partial<VisitaEncolada> = {}): VisitaEncolada {
  return {
    ...nuevaEntrada(
      'v-1',
      { comercio: 'Tambo+', status: 'Todo Ok' },
      { comercio: 'Tambo+', status: 'Todo Ok', idAsignacion: 'ASG-1', idLocal: 'PC-0001' },
      CORREO,
      AHORA,
    ),
    ...campos,
  };
}

/** Almacén de mentira, en memoria, para probar la política sin IndexedDB. */
function almacenFalso(iniciales: VisitaEncolada[] = []): AlmacenCola & {
  contenido: Map<string, VisitaEncolada>;
} {
  const contenido = new Map(iniciales.map((v) => [v.idVisita, v]));
  return {
    contenido,
    async listar() {
      return ordenarPorAntiguedad([...contenido.values()]);
    },
    async guardar(v) {
      contenido.set(v.idVisita, v);
    },
    async borrar(id) {
      contenido.delete(id);
    },
    async contar() {
      return contenido.size;
    },
  };
}

const exito = async (): Promise<ApiResponse<unknown>> => ({ ok: true });
const falloRed = async (): Promise<ApiResponse<unknown>> => ({
  ok: false,
  error: 'Sin conexión a internet.',
});
const sesionVencida = async (): Promise<ApiResponse<unknown>> => ({
  ok: false,
  authError: true,
  error: 'Sesión expirada.',
});

// ══════════════════════════════════════════════════
describe('espera creciente', () => {
  test('empieza corta y se va alargando', () => {
    assert.equal(esperaParaIntento(0), 5_000);
    assert.equal(esperaParaIntento(1), 15_000);
    assert.equal(esperaParaIntento(2), 60_000);
    assert.ok(esperaParaIntento(3) > esperaParaIntento(2));
  });

  test('tiene tope: no crece sin fin', () => {
    const tope = ESPERAS_MS[ESPERAS_MS.length - 1];
    assert.equal(esperaParaIntento(99), tope);
    assert.equal(tope, 1_800_000); // 30 min
  });

  test('un número raro no la rompe', () => {
    assert.equal(esperaParaIntento(-5), ESPERAS_MS[0]);
  });

  test('no se reintenta antes de tiempo', () => {
    const v = visita({ proximoIntento: AHORA + 60_000 });
    assert.equal(tocaReintentar(v, AHORA), false);
    assert.equal(tocaReintentar(v, AHORA + 60_000), true);
  });
});

describe('envío correcto', () => {
  test('se borra de la cola', async () => {
    const almacen = almacenFalso([visita()]);
    const r = await procesarCola({ correo: CORREO, almacen, enviar: exito, ahora: AHORA });

    assert.equal(r.enviadas, 1);
    assert.equal(r.pendientes, 0);
    assert.equal(almacen.contenido.size, 0);
  });

  // El backend responde ok cuando reconoce el id: el trabajo ya está hecho
  // y mantenerla en cola solo la reenviaría una y otra vez.
  test('una visita que el backend dice que ya estaba guardada también se borra', async () => {
    const almacen = almacenFalso([visita()]);
    const yaEstaba = async (): Promise<ApiResponse<unknown>> => ({
      ok: true,
      data: { repetida: true },
    });

    await procesarCola({ correo: CORREO, almacen, enviar: yaEstaba, ahora: AHORA });
    assert.equal(almacen.contenido.size, 0);
  });

  test('se envían en el orden en que se hicieron', async () => {
    const vieja = visita({
      idVisita: 'v-vieja',
      creadoEn: AHORA - 10_000,
      payload: { marca: 'vieja' },
    });
    const nueva = visita({
      idVisita: 'v-nueva',
      creadoEn: AHORA,
      payload: { marca: 'nueva' },
    });
    const almacen = almacenFalso([nueva, vieja]);

    const orden: string[] = [];
    await procesarCola({
      correo: CORREO,
      almacen,
      ahora: AHORA,
      enviar: async (p) => {
        orden.push(String((p as { marca?: string }).marca || ''));
        return { ok: true };
      },
    });

    assert.equal(almacen.contenido.size, 0);
    // Se metieron al revés a propósito: tiene que salir la vieja primero.
    assert.deepEqual(orden, ['vieja', 'nueva']);
  });
});

describe('fallo de envío', () => {
  test('la visita NO se pierde y se aplaza', async () => {
    const almacen = almacenFalso([visita()]);
    const r = await procesarCola({ correo: CORREO, almacen, enviar: falloRed, ahora: AHORA });

    assert.equal(r.enviadas, 0);
    assert.equal(r.pendientes, 1);

    const guardada = almacen.contenido.get('v-1');
    assert.ok(guardada);
    assert.equal(guardada.intentos, 1);
    assert.ok(guardada.proximoIntento > AHORA);
    assert.match(guardada.ultimoError || '', /conexión/i);
  });

  test('cada fallo alarga la espera', async () => {
    const almacen = almacenFalso([visita()]);

    await procesarCola({ correo: CORREO, almacen, enviar: falloRed, ahora: AHORA });
    const primera = almacen.contenido.get('v-1')!.proximoIntento - AHORA;

    const despues = almacen.contenido.get('v-1')!.proximoIntento;
    await procesarCola({ correo: CORREO, almacen, enviar: falloRed, ahora: despues });
    const segunda = almacen.contenido.get('v-1')!.proximoIntento - despues;

    assert.ok(segunda > primera, `${segunda} debería superar a ${primera}`);
  });

  test('una excepción tampoco pierde la visita', async () => {
    const almacen = almacenFalso([visita()]);
    await procesarCola({
      correo: CORREO,
      almacen,
      ahora: AHORA,
      enviar: async () => {
        throw new Error('se cayó la red a media petición');
      },
    });

    assert.equal(almacen.contenido.size, 1);
    assert.equal(almacen.contenido.get('v-1')!.intentos, 1);
  });

  test('tras muchos intentos deja de reintentar sola, pero sigue ahí', async () => {
    const agotada = visita({ intentos: MAX_INTENTOS_AUTOMATICOS });
    assert.equal(esperaEnvioManual(agotada), true);

    const almacen = almacenFalso([agotada]);
    let intentos = 0;
    await procesarCola({
      correo: CORREO,
      almacen,
      ahora: AHORA + 10_000_000,
      enviar: async () => {
        intentos++;
        return { ok: true };
      },
    });

    assert.equal(intentos, 0, 'no debería intentarlo sola');
    assert.equal(almacen.contenido.size, 1, 'pero NO se descarta');
  });

  test('el botón de reintentar sí la fuerza', async () => {
    const agotada = visita({
      intentos: MAX_INTENTOS_AUTOMATICOS,
      proximoIntento: AHORA + 10_000_000,
    });
    const almacen = almacenFalso([agotada]);

    const r = await procesarCola({
      correo: CORREO,
      almacen,
      enviar: exito,
      ahora: AHORA,
      forzar: true,
    });

    assert.equal(r.enviadas, 1);
    assert.equal(almacen.contenido.size, 0);
  });
});

describe('sesión vencida', () => {
  // Es el caso del punto 7: la visita no se puede perder porque el token
  // caducó mientras el CAP estaba en el sótano de un mall.
  test('se detiene todo y NO se borra nada', async () => {
    const almacen = almacenFalso([
      visita({ idVisita: 'v-1', creadoEn: AHORA - 1000 }),
      visita({ idVisita: 'v-2', creadoEn: AHORA }),
    ]);

    const r = await procesarCola({ correo: CORREO, almacen, enviar: sesionVencida, ahora: AHORA });

    assert.equal(r.sesionVencida, true);
    assert.equal(r.enviadas, 0);
    assert.equal(almacen.contenido.size, 2, 'las dos siguen en la cola');
  });

  test('no gasta intentos en las que no llegó a probar', async () => {
    const almacen = almacenFalso([
      visita({ idVisita: 'v-1', creadoEn: AHORA - 1000 }),
      visita({ idVisita: 'v-2', creadoEn: AHORA }),
    ]);

    await procesarCola({ correo: CORREO, almacen, enviar: sesionVencida, ahora: AHORA });

    assert.equal(almacen.contenido.get('v-2')!.intentos, 0);
  });

  test('al volver a entrar se envían igual', async () => {
    const almacen = almacenFalso([visita()]);
    await procesarCola({ correo: CORREO, almacen, enviar: sesionVencida, ahora: AHORA });
    assert.equal(almacen.contenido.size, 1);

    const r = await procesarCola({ correo: CORREO, almacen, enviar: exito, ahora: AHORA });
    assert.equal(r.enviadas, 1);
    assert.equal(almacen.contenido.size, 0);
  });
});

describe('cola vacía', () => {
  test('no hace nada y lo dice', async () => {
    const r = await procesarCola({
      correo: CORREO,
      almacen: almacenFalso(),
      enviar: exito,
      ahora: AHORA,
    });
    assert.deepEqual(r, { enviadas: 0, pendientes: 0, sesionVencida: false });
  });
});

// ══════════════════════════════════════════════════
describe('consultas de la cola', () => {
  const v1 = visita({ idVisita: 'v-1', creadoEn: AHORA });
  const v2 = visita({
    idVisita: 'v-2',
    creadoEn: AHORA - 5000,
    resumen: {
      comercio: 'Asics',
      status: 'Incidencia',
      idAsignacion: 'ASG-9',
      idLocal: 'CC-0456',
    },
  });

  test('ordena la más antigua primero', () => {
    assert.deepEqual(
      ordenarPorAntiguedad([v1, v2]).map((v) => v.idVisita),
      ['v-2', 'v-1'],
    );
  });

  test('encuentra las de una asignación', () => {
    assert.equal(encoladasDeAsignacion([v1, v2], 'ASG-9').length, 1);
    assert.equal(encoladasDeAsignacion([v1, v2], 'ASG-NADA').length, 0);
    assert.equal(encoladasDeAsignacion([v1, v2], '').length, 0);
  });

  // Hoy lo usa para no dejar registrar dos veces el mismo local.
  test('sabe si un local ya tiene visita esperando', () => {
    assert.equal(localTieneEncolada([v1, v2], 'CC-0456'), true);
    assert.equal(localTieneEncolada([v1, v2], 'cc-0456'), true);
    assert.equal(localTieneEncolada([v1, v2], 'PC-9999'), false);
    assert.equal(localTieneEncolada([], 'PC-0001'), false);
  });
});

// ══════════════════════════════════════════════════
describe('celular compartido', () => {
  // Si entra otro CAP, sus visitas no pueden salir con el token del
  // nuevo: quedarían registradas a nombre de quien no las hizo.
  test('solo se envían las del CAP conectado', async () => {
    const deRosa = visita({ idVisita: 'v-rosa' });
    const deLuis = visita({ idVisita: 'v-luis', correo: 'luis@empresa.pe' });
    const almacen = almacenFalso([deRosa, deLuis]);

    const enviadas: string[] = [];
    const r = await procesarCola({
      almacen,
      correo: CORREO,
      ahora: AHORA,
      enviar: async (p) => {
        enviadas.push(String(p.comercio));
        return { ok: true };
      },
    });

    assert.equal(r.enviadas, 1);
    assert.equal(enviadas.length, 1);
    assert.ok(almacen.contenido.has('v-luis'), 'la de Luis sigue esperando a Luis');
    assert.equal(r.pendientes, 0, 'a Rosa no le cuentan las de Luis');
  });

  test('sin usuario conectado no se envía nada', async () => {
    const almacen = almacenFalso([visita()]);
    const r = await procesarCola({ almacen, correo: '', enviar: exito, ahora: AHORA });
    assert.equal(r.enviadas, 0);
    assert.equal(almacen.contenido.size, 1);
  });

  test('el correo se compara sin mayúsculas ni espacios', () => {
    const v = visita({ correo: ' Rosa@Empresa.pe ' });
    assert.equal(delUsuario([v], 'rosa@empresa.pe').length, 1);
    assert.equal(nuevaEntrada('x', {}, v.resumen, ' Rosa@Empresa.PE').correo, CORREO);
  });
});

describe('tras el envío inmediato del formulario', () => {
  test('guardada → se borra de la cola', async () => {
    const almacen = almacenFalso([visita()]);
    await registrarResultado(almacen, visita(), 'guardada', AHORA);
    assert.equal(almacen.contenido.size, 0);
  });

  test('repetida → también se borra', async () => {
    const almacen = almacenFalso([visita()]);
    await registrarResultado(almacen, visita(), 'repetida', AHORA);
    assert.equal(almacen.contenido.size, 0);
  });

  // El formulario sigue abierto con todo: el CAP lo corrige allí.
  test('rechazo del backend → se quita de la cola', async () => {
    const almacen = almacenFalso([visita()]);
    await registrarResultado(almacen, visita(), 'error', AHORA);
    assert.equal(almacen.contenido.size, 0);
  });

  test('corte por el camino → queda en la cola con el intento contado', async () => {
    const almacen = almacenFalso([visita()]);
    await registrarResultado(almacen, visita(), 'reintentar', AHORA, 'Sin conexión');

    const v = almacen.contenido.get('v-1')!;
    assert.equal(v.intentos, 1);
    assert.ok(v.proximoIntento > AHORA);
    assert.equal(v.ultimoError, 'Sin conexión');
  });

  test('sesión vencida → queda en la cola sin tocar', async () => {
    const almacen = almacenFalso([visita()]);
    await registrarResultado(almacen, visita(), 'sesion', AHORA);

    const v = almacen.contenido.get('v-1')!;
    assert.equal(v.intentos, 0);
  });

  // El caso completo del punto 3: se corta, queda en cola y el reintento
  // lleva el MISMO id, que es lo que deja al backend deduplicarlo.
  test('el reintento de la cola lleva el mismo identificador', async () => {
    const original = visita({ payload: { id_visita: 'v-1', comercio: 'Tambo+' } });
    const almacen = almacenFalso([original]);
    await registrarResultado(almacen, original, 'reintentar', AHORA);

    const ids: unknown[] = [];
    await procesarCola({
      almacen,
      correo: CORREO,
      ahora: AHORA + 60 * 60_000,
      enviar: async (p) => {
        ids.push(p.id_visita);
        return { ok: true, data: { repetida: true } };
      },
    });

    assert.deepEqual(ids, ['v-1']);
    assert.equal(almacen.contenido.size, 0);
  });
});
