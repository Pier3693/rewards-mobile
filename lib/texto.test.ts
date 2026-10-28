import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  tituloBonito,
  partirPorCoincidencia,
  telefonoWhatsApp,
  telefonoLegible,
  telefonoLlamada,
  horaDe,
  haceCuanto,
} from './texto.ts';

describe('tituloBonito', () => {
  test('el caso real de la hoja', () => {
    assert.equal(tituloBonito('C.C. PLAZA SAN MIGUEL'), 'C.C. Plaza San Miguel');
  });

  test('respeta las siglas con puntos', () => {
    assert.equal(tituloBonito('P.C. LARCOMAR'), 'P.C. Larcomar');
    assert.equal(tituloBonito('INVERSIONES S.A.C.'), 'Inversiones S.A.C.');
  });

  test('las particulas van en minuscula salvo al inicio', () => {
    assert.equal(tituloBonito('MALL DEL SUR'), 'Mall del Sur');
    assert.equal(tituloBonito('PLAZA DE ARMAS'), 'Plaza de Armas');
    assert.equal(tituloBonito('EL AGUSTINO'), 'El Agustino');
  });

  test('respeta numeros romanos y tokens con digitos', () => {
    assert.equal(tituloBonito('PLAZA NORTE II'), 'Plaza Norte II');
    assert.equal(tituloBonito('AV. BENAVIDES 730'), 'Av. Benavides 730');
  });

  test('deja intacto lo que ya esta bien escrito', () => {
    assert.equal(tituloBonito('Jockey Plaza'), 'Jockey Plaza');
    assert.equal(tituloBonito('Real Plaza Salaverry'), 'Real Plaza Salaverry');
  });

  test('conserva los separadores', () => {
    assert.equal(tituloBonito('SAN JUAN-LURIGANCHO'), 'San Juan-Lurigancho');
  });

  test('vacio y espacios', () => {
    assert.equal(tituloBonito(''), '');
    assert.equal(tituloBonito(undefined), '');
    assert.equal(tituloBonito('   '), '');
  });

  // Sheets con PROPER() deja "1Er"; en mayúsculas llega "1ER".
  test('ordinales en minuscula despues del numero', () => {
    assert.equal(tituloBonito('Cal. Libertad Nro. 130 (1Er Piso)'), 'Cal. Libertad Nro. 130 (1er Piso)');
    assert.equal(tituloBonito('CAL. LIBERTAD NRO. 130 (1ER PISO)'), 'Cal. Libertad Nro. 130 (1er Piso)');
    assert.equal(tituloBonito('2DO PISO'), '2do Piso');
    assert.equal(tituloBonito('3RO, 4TO Y 10MO'), '3ro, 4to y 10mo');
    assert.equal(tituloBonito('1RA ETAPA'), '1ra Etapa');
  });

  test('no toca otras letras pegadas a un numero', () => {
    assert.equal(tituloBonito('DPTO 12B'), 'Dpto 12B');
    assert.equal(tituloBonito('Dpto. 4B'), 'Dpto. 4B');
  });

  test('funciona con tildes y enes', () => {
    assert.equal(tituloBonito('MIRAFLORES ESPAÑA'), 'Miraflores España');
  });
});

describe('partirPorCoincidencia', () => {
  /** Une los trozos para comprobar que no se pierde ni se duplica nada. */
  const reconstruir = (t: { texto: string }[]) => t.map((x) => x.texto).join('');
  const resaltado = (t: { texto: string; coincide: boolean }[]) =>
    t.filter((x) => x.coincide).map((x) => x.texto);

  test('resalta sin importar mayusculas', () => {
    const trozos = partirPorCoincidencia('PARDOS CHICKEN', 'pardos');
    assert.deepEqual(resaltado(trozos), ['PARDOS']);
    assert.equal(reconstruir(trozos), 'PARDOS CHICKEN');
  });

  test('resalta sin importar tildes', () => {
    const trozos = partirPorCoincidencia('Café París', 'cafe');
    assert.deepEqual(resaltado(trozos), ['Café']);
    assert.equal(reconstruir(trozos), 'Café París');
  });

  test('resalta cada palabra de la consulta por separado', () => {
    const trozos = partirPorCoincidencia('GMO Jockey Surco', 'gmo surco');
    assert.deepEqual(resaltado(trozos), ['GMO', 'Surco']);
  });

  test('resalta todas las apariciones', () => {
    const trozos = partirPorCoincidencia('Plaza Plaza', 'plaza');
    assert.equal(resaltado(trozos).length, 2);
  });

  test('sin coincidencia devuelve el texto entero sin marcar', () => {
    const trozos = partirPorCoincidencia('Tambo', 'pardos');
    assert.deepEqual(trozos, [{ texto: 'Tambo', coincide: false }]);
  });

  test('ignora las letras sueltas de la consulta', () => {
    const trozos = partirPorCoincidencia('Pardos Chicken', 'a');
    assert.deepEqual(trozos, [{ texto: 'Pardos Chicken', coincide: false }]);
  });

  test('consulta o texto vacios', () => {
    assert.deepEqual(partirPorCoincidencia('', 'pardos'), []);
    assert.deepEqual(partirPorCoincidencia('Tambo', ''), [
      { texto: 'Tambo', coincide: false },
    ]);
  });

  test('nunca pierde ni duplica caracteres', () => {
    const texto = 'C.C. Plaza San Miguel';
    assert.equal(reconstruir(partirPorCoincidencia(texto, 'plaza miguel')), texto);
  });
});

describe('telefonoWhatsApp', () => {
  test('agrega el 51 cuando falta', () => {
    assert.equal(telefonoWhatsApp('987654321'), '51987654321');
  });

  test('no lo duplica si ya viene', () => {
    assert.equal(telefonoWhatsApp('51987654321'), '51987654321');
  });

  test('limpia espacios, guiones y el signo mas', () => {
    assert.equal(telefonoWhatsApp('+51 987-654-321'), '51987654321');
    assert.equal(telefonoWhatsApp('987 654 321'), '51987654321');
  });

  test('rechaza lo que no es un celular peruano valido', () => {
    assert.equal(telefonoWhatsApp('12345'), '');
    assert.equal(telefonoWhatsApp('887654321'), ''); // no empieza en 9
    assert.equal(telefonoWhatsApp('9876543210'), ''); // 10 digitos
    assert.equal(telefonoWhatsApp(''), '');
    assert.equal(telefonoWhatsApp(undefined), '');
    assert.equal(telefonoWhatsApp('sin numero'), '');
  });
});

describe('telefonoLegible', () => {
  test('agrupa de tres en tres', () => {
    assert.equal(telefonoLegible('51987654321'), '987 654 321');
    assert.equal(telefonoLegible('987654321'), '987 654 321');
  });

  test('si no es valido devuelve lo que habia', () => {
    assert.equal(telefonoLegible('anexo 204'), 'anexo 204');
  });

  test('un fijo con su código', () => {
    assert.equal(telefonoLegible('011234567'), '01 123 4567');
    assert.equal(telefonoLegible('044123456'), '044 123 456');
  });
});

describe('telefonoLlamada', () => {
  test('celular y fijo, con el 51 y sin el 0 del código', () => {
    assert.equal(telefonoLlamada('987 654 321'), '+51987654321');
    assert.equal(telefonoLlamada('01 123 4567'), '+5111234567');
    assert.equal(telefonoLlamada('044123456'), '+5144123456');
  });

  test('un fijo no tiene WhatsApp', () => {
    assert.equal(telefonoWhatsApp('011234567'), '');
  });

  test('lo que no se puede marcar, vacío', () => {
    assert.equal(telefonoLlamada('12345'), '');
    assert.equal(telefonoLlamada(''), '');
  });
});

describe('horas de actualización', () => {
  test('horaDe da horas y minutos con cero delante', () => {
    const d = new Date(2026, 9, 21, 8, 5);
    assert.equal(horaDe(d.getTime()), '08:05');
  });

  test('haceCuanto escala de minutos a horas', () => {
    const ahora = 1_700_000_000_000;
    assert.equal(haceCuanto(ahora - 20_000, ahora), 'hace un momento');
    assert.equal(haceCuanto(ahora - 5 * 60_000, ahora), 'hace 5 min');
    assert.equal(haceCuanto(ahora - 125 * 60_000, ahora), 'hace 2 h');
  });

  test('sin fecha no dice nada', () => {
    assert.equal(haceCuanto(0), '');
  });

  // El reloj del celular puede ir adelantado respecto a lo guardado.
  test('una fecha futura no da negativos', () => {
    assert.equal(haceCuanto(Date.now() + 60_000), 'hace un momento');
  });
});
