import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  leerProcesadores,
  procesadoresATexto,
  alternarProcesador,
  leerBeneficios,
  beneficiosATexto,
  alternarBeneficio,
  leerMaterialPop,
  BENEFICIOS,
  SIN_PROCESADORES,
  SIN_BENEFICIOS,
} from './datosLocal.ts';

// ══════════════════════════════════════════════════
describe('procesadores', () => {
  test('ida y vuelta', () => {
    const sel = leerProcesadores('Niubiz, Culqi');
    assert.deepEqual(sel.marcados, ['Niubiz', 'Culqi']);
    assert.equal(procesadoresATexto(sel), 'Niubiz, Culqi');
    assert.deepEqual(leerProcesadores(procesadoresATexto(sel)).marcados, sel.marcados);
  });

  test('se escriben en el orden de la lista, sin importar el de marcado', () => {
    let sel = alternarProcesador(SIN_PROCESADORES, 'Culqi');
    sel = alternarProcesador(sel, 'Openpay');
    assert.equal(procesadoresATexto(sel), 'Openpay, Culqi');
    assert.equal(procesadoresATexto(SIN_PROCESADORES), '');
  });

  test('formatos viejos, sin importar mayúsculas', () => {
    assert.deepEqual(leerProcesadores('NI').marcados, ['Niubiz']);
    assert.deepEqual(leerProcesadores('niubiz').marcados, ['Niubiz']);
    assert.deepEqual(leerProcesadores('Visanet').marcados, ['Niubiz']);
    assert.deepEqual(leerProcesadores('OP / IZ').marcados, ['Openpay', 'Izipay']);
    assert.deepEqual(leerProcesadores('Izi Pay y culqi').marcados, ['Izipay', 'Culqi']);
    assert.deepEqual(leerProcesadores('Niubiz, NI, niubiz').marcados, ['Niubiz']);
    assert.deepEqual(leerProcesadores('').marcados, []);
  });

  test('un código con valor marca su procesador', () => {
    const sel = leerProcesadores('', { cod_niubiz: '123456' });
    assert.deepEqual(sel.marcados, ['Niubiz']);
    assert.equal(sel.codigos.cod_niubiz, '123456');
    assert.deepEqual(leerProcesadores('Openpay', { cod_culqi: 'CQ-1' }).marcados, ['Openpay', 'Culqi']);
    // Un código vacío o de espacios no marca nada.
    assert.deepEqual(leerProcesadores('', { cod_izipay: '  ' }).marcados, []);
  });

  test('uno que no es de la lista se conserva', () => {
    const sel = leerProcesadores('Niubiz, PagoEfectivo');
    assert.deepEqual(sel.extras, ['PagoEfectivo']);
    assert.deepEqual(sel.marcados, ['Niubiz', 'PagoEfectivo']);
    assert.equal(procesadoresATexto(sel), 'Niubiz, PagoEfectivo');
    assert.equal(procesadoresATexto(alternarProcesador(sel, 'PagoEfectivo')), 'Niubiz');
  });

  test('desmarcar limpia su código y no toca los demás', () => {
    const sel = leerProcesadores('Niubiz, Izipay', { cod_niubiz: '111', cod_izipay: '222' });
    const sin = alternarProcesador(sel, 'Niubiz');
    assert.deepEqual(sin.marcados, ['Izipay']);
    assert.equal(sin.codigos.cod_niubiz, '');
    assert.equal(sin.codigos.cod_izipay, '222');
    // Volver a marcarlo no recupera el código borrado.
    assert.equal(alternarProcesador(sin, 'Niubiz').codigos.cod_niubiz, '');
  });
});

// ══════════════════════════════════════════════════
describe('beneficios', () => {
  test('ida y vuelta, con Otro al final', () => {
    const texto = 'PSI 6, PUNTOS BBVA, 2x1 jueves';
    const sel = leerBeneficios(texto);
    assert.deepEqual(sel.marcados, ['PSI 6', 'PUNTOS BBVA']);
    assert.equal(sel.otro, true);
    assert.equal(sel.textoOtro, '2x1 jueves');
    assert.equal(beneficiosATexto(sel), texto);
    assert.deepEqual(leerBeneficios(beneficiosATexto(sel)), sel);
  });

  test('sin Otro, o con Otro vacío', () => {
    let sel = alternarBeneficio(SIN_BENEFICIOS, 'Promo regular');
    sel = alternarBeneficio(sel, 'PSI 3');
    assert.equal(beneficiosATexto(sel), 'PSI 3, Promo regular');
    assert.equal(beneficiosATexto({ ...sel, otro: true, textoOtro: '   ' }), 'PSI 3, Promo regular');
    // El texto de Otro no se guarda si Otro está desmarcado.
    assert.equal(beneficiosATexto({ ...sel, otro: false, textoOtro: '2x1' }), 'PSI 3, Promo regular');
    assert.equal(beneficiosATexto(SIN_BENEFICIOS), '');
  });

  test('todas las opciones se leen a sí mismas', () => {
    const sel = leerBeneficios(BENEFICIOS.join(', '));
    assert.deepEqual(sel.marcados, BENEFICIOS);
    assert.equal(sel.otro, false);
  });

  test('formatos viejos, sin importar mayúsculas ni tildes', () => {
    assert.deepEqual(leerBeneficios('6 PSI').marcados, ['PSI 6']);
    assert.deepEqual(leerBeneficios('psi12').marcados, ['PSI 12']);
    assert.deepEqual(leerBeneficios('36 psi').marcados, ['PSI 36']);
    assert.deepEqual(leerBeneficios('Puntos BBVA').marcados, ['PUNTOS BBVA']);
    assert.deepEqual(leerBeneficios('promo cuenta sueldo; PROMO REGULAR').marcados, [
      'Promo Cuenta Sueldo',
      'Promo regular',
    ]);
    assert.deepEqual(leerBeneficios('Prómo Régular').marcados, ['Promo regular']);
  });

  test('lo que no es de la lista va a Otro', () => {
    // 7 cuotas no es un plazo de la lista.
    const sel = leerBeneficios('PSI 7, 20% dscto, 2x1 jueves y viernes, 6 PSI');
    assert.deepEqual(sel.marcados, ['PSI 6']);
    assert.equal(sel.textoOtro, 'PSI 7, 20% dscto, 2x1 jueves y viernes');
    assert.equal(beneficiosATexto(sel), 'PSI 6, PSI 7, 20% dscto, 2x1 jueves y viernes');
  });
});

// ══════════════════════════════════════════════════
describe('material POP', () => {
  test('las dos opciones', () => {
    assert.equal(leerMaterialPop('Permite'), 'Permite');
    assert.equal(leerMaterialPop('  no PERMITE '), 'No permite');
    assert.equal(leerMaterialPop('Sí'), 'Permite');
    assert.equal(leerMaterialPop('No'), 'No permite');
  });

  test('lo demás queda sin elegir', () => {
    assert.equal(leerMaterialPop('Afiche, stopper, habladores'), '');
    assert.equal(leerMaterialPop(''), '');
  });
});
