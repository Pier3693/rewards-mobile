import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pesoDeDataUrl,
  pesoTotal,
  pesoLegible,
  cabeOtraFoto,
  TOPE_FOTOS,
  FotoNoProcesable,
} from './img.ts';

/** Un data URL con el peso aproximado que se pida. */
function fotoDe(bytes: number): string {
  const caracteres = Math.ceil((bytes * 4) / 3);
  return 'data:image/jpeg;base64,' + 'A'.repeat(caracteres);
}

describe('pesoDeDataUrl', () => {
  test('cuenta los bytes reales, no la longitud del texto', () => {
    // 4 caracteres de base64 son 3 bytes.
    assert.equal(pesoDeDataUrl('data:image/jpeg;base64,AAAA'), 3);
    assert.equal(pesoDeDataUrl('data:image/jpeg;base64,AAAAAAAA'), 6);
  });

  test('descuenta el relleno final', () => {
    assert.equal(pesoDeDataUrl('data:image/jpeg;base64,AAA='), 2);
    assert.equal(pesoDeDataUrl('data:image/jpeg;base64,AA=='), 1);
  });

  test('aguanta entradas raras sin reventar', () => {
    assert.equal(pesoDeDataUrl(''), 0);
    assert.equal(pesoDeDataUrl(undefined), 0);
    assert.equal(pesoDeDataUrl('no-es-un-data-url'), 0);
    assert.equal(pesoDeDataUrl('data:image/jpeg;base64,'), 0);
  });

  test('una foto de 200 KB mide lo que debe', () => {
    const doscientos = 200 * 1024;
    const medido = pesoDeDataUrl(fotoDe(doscientos));
    assert.ok(Math.abs(medido - doscientos) < 10, `midió ${medido}`);
  });
});

describe('pesoTotal', () => {
  test('suma las fotos', () => {
    const total = pesoTotal([fotoDe(100_000), fotoDe(150_000)]);
    assert.ok(Math.abs(total - 250_000) < 10);
  });

  test('sin fotos pesa cero', () => {
    assert.equal(pesoTotal([]), 0);
  });
});

describe('cabeOtraFoto', () => {
  // El límite real es el de Vercel: 4.5 MB por petición.
  test('el tope deja margen bajo el límite de 4.5 MB', () => {
    assert.ok(TOPE_FOTOS < 4.5 * 1024 * 1024);
    assert.ok(TOPE_FOTOS >= 3 * 1024 * 1024, 'pero sin quedarse corto');
  });

  test('cuatro fotos normales caben de sobra', () => {
    const fotos: string[] = [];
    for (let i = 0; i < 4; i++) {
      const nueva = fotoDe(300 * 1024); // una foto comprimida grande
      assert.equal(cabeOtraFoto(fotos, nueva), true, `falló en la foto ${i + 1}`);
      fotos.push(nueva);
    }
  });

  // El caso que esto evita: un HEIC sin comprimir revienta el límite y
  // el error salía al guardar, con el formulario ya lleno.
  test('una foto enorme no cabe, aunque sea la primera', () => {
    const heic = fotoDe(4 * 1024 * 1024);
    assert.equal(cabeOtraFoto([], heic), false);
  });

  test('corta justo cuando se pasaría del tope', () => {
    const casi = fotoDe(TOPE_FOTOS - 1000);
    assert.equal(cabeOtraFoto([casi], fotoDe(500)), true);
    assert.equal(cabeOtraFoto([casi], fotoDe(5000)), false);
  });
});

describe('pesoLegible', () => {
  test('usa MB cuando toca y KB cuando no', () => {
    assert.equal(pesoLegible(1.4 * 1024 * 1024), '1.4 MB');
    assert.equal(pesoLegible(820 * 1024), '820 KB');
    assert.equal(pesoLegible(0), '0 KB');
  });
});

describe('FotoNoProcesable', () => {
  test('dice qué hacer, no solo que falló', () => {
    const e = new FotoNoProcesable();
    assert.equal(e.name, 'FotoNoProcesable');
    assert.match(e.message, /cámara/i);
    assert.match(e.message, /galería/i);
  });

  test('se puede distinguir de un error cualquiera', () => {
    assert.ok(new FotoNoProcesable() instanceof Error);
    assert.equal(new Error('otro') instanceof FotoNoProcesable, false);
  });
});
