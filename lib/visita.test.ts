import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  celularEsValido,
  errorCelular,
  componerObservacion,
  separarObservacion,
  TIPOS_INCIDENCIA,
  claveBorrador,
  nuevaIdVisita,
  queHacerTrasEnvio,
  fijarCreadoEn,
  borradorTieneAlgo,
  borradorCaducado,
  guardarBorrador,
  leerBorrador,
  borrarBorrador,
  HORAS_BORRADOR,
  armarPeticionVisita,
  datosTrasVisita,
  fechaHoja,
  type Borrador,
  type DatosVisita,
} from './visita.ts';
import { nuevaEntrada } from './cola.ts';

// ══════════════════════════════════════════════════
describe('celular', () => {
  test('acepta un celular peruano', () => {
    assert.equal(celularEsValido('987654321'), true);
    assert.equal(errorCelular('987654321'), '');
  });

  test('tolera espacios y guiones', () => {
    assert.equal(celularEsValido('987 654 321'), true);
    assert.equal(celularEsValido('987-654-321'), true);
  });

  test('el vacío es válido: el celular no es obligatorio', () => {
    assert.equal(celularEsValido(''), true);
    assert.equal(celularEsValido(undefined), true);
    assert.equal(errorCelular(''), '');
  });

  test('rechaza lo que no son 9 dígitos empezando por 9', () => {
    assert.equal(celularEsValido('98765432'), false); // 8 dígitos
    assert.equal(celularEsValido('9876543210'), false); // 10 dígitos
    assert.equal(celularEsValido('887654321'), false); // no empieza en 9
    assert.equal(celularEsValido('51987654321'), false); // con prefijo de país
    assert.equal(celularEsValido('anexo 204'), false);
  });

  test('el mensaje de error dice qué falta', () => {
    assert.equal(errorCelular('12345'), 'Debe tener 9 dígitos y empezar con 9');
  });
});

// ══════════════════════════════════════════════════
describe('prefijo de incidencia', () => {
  const TIPO = 'POS no aplica beneficio';

  test('compone el prefijo delante del texto', () => {
    assert.equal(
      componerObservacion(TIPO, 'El POS Niubiz no reconoce el 20%'),
      '[POS no aplica beneficio] El POS Niubiz no reconoce el 20%',
    );
  });

  test('sin tipo deja solo el texto', () => {
    assert.equal(componerObservacion('', 'Todo conforme'), 'Todo conforme');
    assert.equal(componerObservacion(undefined, 'Todo conforme'), 'Todo conforme');
  });

  test('sin texto deja solo el prefijo', () => {
    assert.equal(componerObservacion(TIPO, ''), '[POS no aplica beneficio]');
  });

  test('separa lo que compuso', () => {
    const compuesto = componerObservacion(TIPO, 'La encargada pide visita técnica');
    assert.deepEqual(separarObservacion(compuesto), {
      tipo: TIPO,
      texto: 'La encargada pide visita técnica',
    });
  });

  // El error que esto evita: "[Local cerrado] [POS no aplica beneficio] texto"
  test('cambiar de tipo dos veces no encadena prefijos', () => {
    let obs = componerObservacion('Local cerrado', 'Estaba cerrado al mediodía');

    const { texto } = separarObservacion(obs);
    obs = componerObservacion(TIPO, texto);
    assert.equal(obs, '[POS no aplica beneficio] Estaba cerrado al mediodía');

    const otra = separarObservacion(obs);
    assert.equal(componerObservacion('Otro', otra.texto), '[Otro] Estaba cerrado al mediodía');
  });

  test('quitar el tipo deja el texto limpio', () => {
    const compuesto = componerObservacion(TIPO, 'Pendiente de revisión');
    const { texto } = separarObservacion(compuesto);
    assert.equal(componerObservacion('', texto), 'Pendiente de revisión');
  });

  test('un corchete escrito por el CAP se respeta como texto suyo', () => {
    const escrito = '[urgente] revisar el POS';
    assert.deepEqual(separarObservacion(escrito), { tipo: '', texto: escrito });
  });

  test('sin observación devuelve todo vacío', () => {
    assert.deepEqual(separarObservacion(''), { tipo: '', texto: '' });
    assert.deepEqual(separarObservacion(undefined), { tipo: '', texto: '' });
  });

  test('todos los tipos del brief van y vuelven', () => {
    for (const tipo of TIPOS_INCIDENCIA) {
      const compuesto = componerObservacion(tipo, 'detalle');
      assert.deepEqual(separarObservacion(compuesto), { tipo, texto: 'detalle' });
    }
  });
});

// ══════════════════════════════════════════════════
describe('identificador de la visita', () => {
  test('cada visita nueva lleva el suyo', () => {
    const a = nuevaIdVisita();
    const b = nuevaIdVisita();
    assert.notEqual(a, b);
    assert.ok(a.length > 10);
  });

  // Lo que esto protege: si el id se generara al pulsar Guardar, cada
  // reintento llevaria uno nuevo y el backend no podria reconocerlo.
  test('el borrador conserva el identificador entre reintentos', () => {
    const datos = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => void datos.set(k, v),
        removeItem: (k: string) => void datos.delete(k),
      },
    };

    const clave = claveBorrador('PC-0123');
    const id = nuevaIdVisita();

    // Primer intento: se guarda el borrador con su id.
    guardarBorrador(clave, {
      idVisita: id,
      paso: 3,
      motivo: 'Visita',
      status: 'Todo Ok',
      tipoIncidencia: '',
      contacto: 'Rosa',
      celular: '',
      procesador: '',
      cod_openpay: '',
      cod_niubiz: '',
      cod_izipay: '',
      beneficios: '',
      material_pop: '',
      observacion: 'Se cortó el envío',
    });

    // El CAP vuelve a entrar: debe recuperar EL MISMO id.
    assert.equal(leerBorrador(clave)?.idVisita, id);
  });

  test('un borrador que solo tiene el identificador está vacío', () => {
    assert.equal(borradorTieneAlgo({ idVisita: nuevaIdVisita() }), false);
  });
});

// ══════════════════════════════════════════════════
describe('qué hacer tras enviar', () => {
  test('guardada', () => {
    assert.equal(queHacerTrasEnvio({ ok: true, data: { fotos: 2 } }), 'guardada');
    assert.equal(queHacerTrasEnvio({ ok: true }), 'guardada');
  });

  // El backend reconoció el id: el primer envío sí llegó. Para el CAP es
  // un éxito como cualquier otro.
  test('repetida cuenta como éxito, no como error', () => {
    assert.equal(
      queHacerTrasEnvio({ ok: true, data: { repetida: true, fotos: 0 } }),
      'repetida',
    );
  });

  test('un corte por el camino se puede reintentar', () => {
    assert.equal(
      queHacerTrasEnvio({ ok: false, reintentable: true }),
      'reintentar',
    );
  });

  // La sesión manda aunque además fuera reintentable: hay que entrar.
  test('la sesión vencida gana sobre todo lo demás', () => {
    assert.equal(
      queHacerTrasEnvio({ ok: false, authError: true, reintentable: true }),
      'sesion',
    );
  });

  test('un rechazo del backend es un error', () => {
    assert.equal(queHacerTrasEnvio({ ok: false }), 'error');
  });
});

describe('borrador', () => {
  /** localStorage mínimo, para poder probar fuera del navegador. */
  function montarStorage() {
    const datos = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => datos.get(k) ?? null,
        setItem: (k: string, v: string) => void datos.set(k, v),
        removeItem: (k: string) => void datos.delete(k),
      },
    };
    return datos;
  }

  const base: Omit<Borrador, 'guardadoEn'> = {
    idVisita: 'v-prueba-1',
    paso: 2,
    motivo: 'Visita',
    status: 'Incidencia',
    tipoIncidencia: 'Local cerrado',
    contacto: 'Rosa Medina',
    celular: '987654321',
    procesador: 'Niubiz',
    cod_openpay: '',
    cod_niubiz: '104552871',
    cod_izipay: '',
    beneficios: '20% dscto',
    material_pop: 'Habladores',
    observacion: 'Estaba cerrado',
  };

  beforeEach(() => {
    montarStorage();
  });

  test('la clave distingue local y asignación', () => {
    assert.equal(claveBorrador('pc-0123'), 'rw_borrador_PC-0123');
    assert.equal(claveBorrador('PC-0123', 'ASG-9'), 'rw_borrador_PC-0123_ASG-9');
    assert.notEqual(claveBorrador('PC-0123'), claveBorrador('CC-0456'));
  });

  // Asics puede estar asignado dos veces hoy: Branding y Cap. Virtual.
  // Cada una debe llevar su propio borrador.
  test('dos asignaciones del mismo local no comparten borrador', () => {
    const branding = claveBorrador('CC-0456', 'ASG-BRAND');
    const virtual = claveBorrador('CC-0456', 'ASG-VIRT');
    assert.notEqual(branding, virtual);

    guardarBorrador(branding, { ...base, observacion: 'Faltan habladores' });
    guardarBorrador(virtual, { ...base, observacion: 'No se conectaron' });

    assert.equal(leerBorrador(branding)?.observacion, 'Faltan habladores');
    assert.equal(leerBorrador(virtual)?.observacion, 'No se conectaron');
  });

  test('el borrador de una asignación no se ve desde la otra', () => {
    const branding = claveBorrador('CC-0456', 'ASG-BRAND');
    const virtual = claveBorrador('CC-0456', 'ASG-VIRT');

    guardarBorrador(branding, base);
    assert.ok(leerBorrador(branding));
    assert.equal(leerBorrador(virtual), null);
  });

  test('la visita extra tampoco comparte con las asignaciones', () => {
    const extra = claveBorrador('CC-0456');
    const conAsg = claveBorrador('CC-0456', 'ASG-BRAND');
    assert.notEqual(extra, conAsg);

    guardarBorrador(conAsg, base);
    assert.equal(leerBorrador(extra), null);
  });

  test('borrar el de una deja intacto el de la otra', () => {
    const branding = claveBorrador('CC-0456', 'ASG-BRAND');
    const virtual = claveBorrador('CC-0456', 'ASG-VIRT');
    guardarBorrador(branding, base);
    guardarBorrador(virtual, base);

    borrarBorrador(branding);
    assert.equal(leerBorrador(branding), null);
    assert.ok(leerBorrador(virtual));
  });

  test('guarda y vuelve a leer lo escrito', () => {
    const clave = claveBorrador('PC-0123');
    guardarBorrador(clave, base);

    const leido = leerBorrador(clave);
    assert.ok(leido);
    assert.equal(leido.contacto, 'Rosa Medina');
    assert.equal(leido.status, 'Incidencia');
    assert.equal(leido.paso, 2);
    assert.ok(leido.guardadoEn > 0);
  });

  test('sin borrador devuelve null', () => {
    assert.equal(leerBorrador(claveBorrador('PC-9999')), null);
  });

  test('caduca a las 24 horas', () => {
    const unDia = HORAS_BORRADOR * 60 * 60 * 1000;
    const viejo = { guardadoEn: Date.now() - unDia - 1000 };
    const reciente = { guardadoEn: Date.now() - 60_000 };

    assert.equal(borradorCaducado(viejo), true);
    assert.equal(borradorCaducado(reciente), false);
    assert.equal(borradorCaducado(null), true);
    assert.equal(borradorCaducado({ guardadoEn: 0 }), true);
  });

  test('un borrador caducado no se ofrece y se limpia solo', () => {
    const clave = claveBorrador('PC-0123');
    guardarBorrador(clave, base);

    const dosDias = Date.now() + 48 * 60 * 60 * 1000;
    assert.equal(leerBorrador(clave, dosDias), null);
    // Ya limpio: tampoco aparece preguntando por el momento actual.
    assert.equal(leerBorrador(clave), null);
  });

  test('borrarBorrador lo quita', () => {
    const clave = claveBorrador('PC-0123');
    guardarBorrador(clave, base);
    assert.ok(leerBorrador(clave));

    borrarBorrador(clave);
    assert.equal(leerBorrador(clave), null);
  });

  test('un borrador vacío no se ofrece', () => {
    const vacio = {
      ...base,
      motivo: null,
      status: null,
      tipoIncidencia: '',
      contacto: '',
      celular: '',
      procesador: '',
      cod_niubiz: '',
      beneficios: '',
      material_pop: '',
      observacion: '',
    };
    assert.equal(borradorTieneAlgo(vacio), false);
    assert.equal(borradorTieneAlgo(base), true);
    assert.equal(borradorTieneAlgo(null), false);
  });

  test('basta un campo con algo para ofrecerlo', () => {
    assert.equal(borradorTieneAlgo({ observacion: 'media frase' }), true);
    assert.equal(borradorTieneAlgo({ observacion: '   ' }), false);
  });

  test('el código de Culqi cuenta', () => {
    assert.equal(borradorTieneAlgo({ cod_culqi: 'CQ-123' }), true);
  });
});

// ══════════════════════════════════════════════════
describe('lo que se envía', () => {
  const local = {
    id_local: 'PC-0001',
    comercio: 'Bodega Rosa',
    mall_puerta: 'Puerta calle',
    direccion: 'Av. Siempre Viva 123',
    kam: 'Ana',
  };
  const datos: DatosVisita = {
    procesador: 'Niubiz, Culqi',
    cod_openpay: '',
    cod_niubiz: '123',
    cod_izipay: '',
    cod_culqi: 'CQ-987',
    beneficios: 'PSI 6, PUNTOS BBVA',
    material_pop: 'Permite',
    motivo: 'Visita',
    contacto: 'Rosa',
    celular: '987654321',
    status: 'Todo Ok',
    observacion: '',
  };
  const envio = { fotosBase64: [], idAsignacion: 'ASG-1', idVisita: 'v-1', creadoEn: 1000 };

  test('cod_culqi viaja en el envío', () => {
    const p = armarPeticionVisita(local, datos, envio);
    assert.equal(p.cod_culqi, 'CQ-987');
    assert.equal(p.procesador, 'Niubiz, Culqi');
    assert.equal(p.id_visita, 'v-1');
    assert.equal(p.creado_en, 1000);
  });

  // La cola guarda la petición tal cual y la reenvía igual.
  test('y en la cola sin conexión', () => {
    const p = armarPeticionVisita(local, datos, envio);
    const entrada = nuevaEntrada('v-1', p, { comercio: 'Bodega Rosa', status: 'Todo Ok', idAsignacion: 'ASG-1', idLocal: 'PC-0001' }, 'cap@x.pe', 1000);
    assert.equal(entrada.payload.cod_culqi, 'CQ-987');
    assert.deepEqual(JSON.parse(JSON.stringify(entrada.payload)), JSON.parse(JSON.stringify(p)));
  });

  test('lo que la visita deja en los datos del local', () => {
    const d = datosTrasVisita(armarPeticionVisita(local, datos, envio), 'Rosa Diaz');
    assert.equal(d.procesador_pos, 'Niubiz, Culqi');
    assert.equal(d.codigo_culqi, 'CQ-987');
    assert.equal(d.material_pop, 'Permite');
    assert.equal(d.contacto_cel, '987654321');
    assert.equal(d.ultimo_status, 'Todo Ok');
    assert.equal(d.ultimo_cap, 'Rosa Diaz');
    assert.equal(datosTrasVisita(armarPeticionVisita(local, datos, envio)).ultimo_cap, undefined);
  });

  test('sin kam, va vacío', () => {
    assert.equal(armarPeticionVisita({ ...local, kam: '' }, datos, envio).kam, '');
  });
});

// ══════════════════════════════════════════════════
describe('hora real de la visita', () => {
  test('la primera vez es el momento de tocar Guardar', () => {
    assert.deepEqual(fijarCreadoEn(null, 'v-1', 1000), { idVisita: 'v-1', creadoEn: 1000 });
  });

  // Un reintento de la misma visita conserva la hora del primer toque.
  test('un reintento de la misma visita no la cambia', () => {
    const primera = fijarCreadoEn(null, 'v-1', 1000);
    assert.equal(fijarCreadoEn(primera, 'v-1', 9000).creadoEn, 1000);
  });

  test('una visita nueva estrena la suya', () => {
    const primera = fijarCreadoEn(null, 'v-1', 1000);
    assert.deepEqual(fijarCreadoEn(primera, 'v-2', 9000), { idVisita: 'v-2', creadoEn: 9000 });
  });
});

// ══════════════════════════════════════════════════
describe('fecha como en la hoja', () => {
  test('dd/MM/yyyy HH:mm en hora de Lima', () => {
    assert.equal(fechaHoja(Date.UTC(2026, 9, 27, 20, 26)), '27/10/2026 15:26');
    // Pasada la medianoche en UTC sigue siendo el día anterior en Lima.
    assert.equal(fechaHoja(Date.UTC(2026, 0, 1, 3, 5)), '31/12/2025 22:05');
  });
});
