import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { esFalloDeCarga, textoDeError } from './errores.ts';

describe('fallo de carga de una pantalla', () => {
  // Lo que se vio sin señal en /visita/[id].
  test('reconoce el ChunkLoadError de webpack', () => {
    const e = new Error(
      'Loading chunk 572 failed. (error: http://localhost:3000/_next/static/chunks/app/(app)/visita/%5Bid%5D/page-aea1.js)',
    );
    e.name = 'ChunkLoadError';
    assert.equal(esFalloDeCarga(e), true);
  });

  test('reconoce el mensaje aunque no traiga el nombre', () => {
    assert.equal(esFalloDeCarga(new Error('Loading CSS chunk 3 failed')), true);
    assert.equal(
      esFalloDeCarga(new TypeError('Failed to fetch dynamically imported module: /x.js')),
      true,
    );
    // Safari lo dice de otra forma.
    assert.equal(esFalloDeCarga(new TypeError('Importing a module script failed.')), true);
  });

  test('un error cualquiera no lo es', () => {
    assert.equal(esFalloDeCarga(new Error('Cannot read properties of undefined')), false);
    assert.equal(esFalloDeCarga(null), false);
    assert.equal(esFalloDeCarga('texto'), false);
  });

  test('el texto explica qué hacer, no "Application error"', () => {
    const e = new Error('x');
    e.name = 'ChunkLoadError';
    const t = textoDeError(e);
    assert.match(t.titulo, /no está guardada/);
    assert.match(t.detalle, /internet/);
    assert.doesNotMatch(t.titulo + t.detalle, /application error/i);
  });

  test('otro error tiene su propio texto', () => {
    assert.equal(textoDeError(new Error('x')).titulo, 'Algo salió mal');
  });
});
