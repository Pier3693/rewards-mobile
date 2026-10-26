import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  crearControlDeCarrera,
  agregarReciente,
  MAX_RECIENTES,
  MIN_LETRAS,
} from './busqueda.ts';

describe('crearControlDeCarrera', () => {
  test('solo la ultima busqueda sigue vigente', () => {
    const c = crearControlDeCarrera();
    const par = c.iniciar();
    const pardos = c.iniciar();

    assert.equal(c.esVigente(par), false);
    assert.equal(c.esVigente(pardos), true);
  });

  test('el caso reportado: "par" llega despues de "pardos"', async () => {
    const control = crearControlDeCarrera();
    let pintado = '';

    /** Simula una respuesta que tarda lo que se le diga. */
    async function buscar(termino: string, tarda: number) {
      const numero = control.iniciar();
      await new Promise((r) => setTimeout(r, tarda));
      if (!control.esVigente(numero)) return; // respuesta vieja
      pintado = termino;
    }

    // "par" sale primero pero tarda 40 ms; "pardos" sale despues y tarda 5.
    const lenta = buscar('par', 40);
    await new Promise((r) => setTimeout(r, 1));
    const rapida = buscar('pardos', 5);
    await Promise.all([lenta, rapida]);

    assert.equal(pintado, 'pardos');
  });

  test('una sola busqueda siempre es vigente', () => {
    const c = crearControlDeCarrera();
    assert.equal(c.esVigente(c.iniciar()), true);
  });

  test('cada control lleva su propia cuenta', () => {
    const a = crearControlDeCarrera();
    const b = crearControlDeCarrera();
    const na = a.iniciar();
    b.iniciar();
    b.iniciar();
    assert.equal(a.esVigente(na), true);
  });
});

describe('agregarReciente', () => {
  test('la ultima va primero', () => {
    assert.deepEqual(agregarReciente(['chilis'], 'pardos'), ['pardos', 'chilis']);
  });

  test('no repite y mueve la existente al frente', () => {
    const lista = ['chilis', 'pardos', 'tambo'];
    assert.deepEqual(agregarReciente(lista, 'pardos'), [
      'pardos',
      'chilis',
      'tambo',
    ]);
  });

  test('tampoco repite cambiando mayusculas', () => {
    assert.deepEqual(agregarReciente(['Pardos'], 'pardos'), ['pardos']);
  });

  test('guarda como maximo cinco', () => {
    let lista: string[] = [];
    for (const t of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7']) {
      lista = agregarReciente(lista, t);
    }
    assert.equal(lista.length, MAX_RECIENTES);
    assert.deepEqual(lista, ['g7', 'f6', 'e5', 'd4', 'c3']);
  });

  test('ignora lo que es demasiado corto', () => {
    assert.deepEqual(agregarReciente(['pardos'], 'p'), ['pardos']);
    assert.deepEqual(agregarReciente(['pardos'], '  '), ['pardos']);
    assert.equal(MIN_LETRAS, 2);
  });

  test('recorta los espacios', () => {
    assert.deepEqual(agregarReciente([], '  pardos  '), ['pardos']);
  });
});
