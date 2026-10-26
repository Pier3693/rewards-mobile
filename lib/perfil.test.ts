import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rolLegible, textoCierreSesion, textoActualizacion, mensajeContacto } from './perfil.ts';

describe('rol', () => {
  test('los del backend, con su nombre', () => {
    assert.equal(rolLegible('CAP'), 'Capacitador de campo');
    assert.equal(rolLegible('kam'), 'Key Account Manager');
    assert.equal(rolLegible('ADMIN'), 'Administrador');
  });

  test('uno desconocido se muestra tal cual', () => {
    assert.equal(rolLegible('SUPERVISOR'), 'SUPERVISOR');
    assert.equal(rolLegible(undefined), '');
  });
});

describe('cerrar sesión con visitas en la cola', () => {
  test('sin visitas pendientes, sale sin preguntar', () => {
    assert.equal(textoCierreSesion(0), null);
  });

  // Lo que importa: que el CAP sepa que NO se pierden y cuándo se envían.
  test('con visitas, avisa que quedan y cuándo se envían', () => {
    const t = textoCierreSesion(3)!;
    assert.equal(t.titulo, 'Tienes 3 visitas sin enviar');
    assert.match(t.detalle, /guardadas en este celular/);
    assert.match(t.detalle, /cuando vuelvas a entrar con tu usuario/);
    assert.match(t.detalle, /otra persona/);
  });

  test('en singular cuando es una', () => {
    const t = textoCierreSesion(1)!;
    assert.equal(t.titulo, 'Tienes 1 visita sin enviar');
    assert.match(t.detalle, /^Queda guardada/);
    assert.match(t.detalle, /se enviará cuando/);
  });
});

describe('buscar actualización', () => {
  test('cada resultado dice qué pasa', () => {
    assert.match(textoActualizacion('nueva'), /versión nueva/);
    assert.match(textoActualizacion('ultima'), /última versión/);
    assert.match(textoActualizacion('sin-senal'), /conexión/);
    assert.ok(textoActualizacion('sin-sw'));
  });
});

describe('contactar al administrador', () => {
  test('el mensaje lleva el nombre del CAP', () => {
    assert.match(mensajeContacto('Rosa Díaz'), /Rosa Díaz/);
  });

  test('sin nombre, un mensaje genérico', () => {
    assert.doesNotMatch(mensajeContacto(''), /soy\s*,/);
  });
});
