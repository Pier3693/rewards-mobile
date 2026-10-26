import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pesoDeDataUrl,
  pesoEnEnvio,
  pesoTotal,
  pesoPeticion,
  peticionCabe,
  pesoLegible,
  cabeOtraFoto,
  comprimirParaQueQuepa,
  COMPRESION_NORMAL,
  COMPRESION_FUERTE,
  TOPE_FOTOS,
  LIMITE_PETICION,
  FotoNoProcesable,
  type AjustesCompresion,
} from './img.ts';

const CABECERA = 'data:image/jpeg;base64,';

/** Un data URL cuya IMAGEN pesa aproximadamente lo que se pida. */
function fotoDe(bytes: number): string {
  const caracteres = Math.ceil((bytes * 4) / 3);
  return CABECERA + 'A'.repeat(caracteres);
}

/** Un data URL que ocupa EN EL ENVÍO exactamente lo que se pida. */
function fotoQueOcupa(bytes: number): string {
  return CABECERA + 'A'.repeat(Math.max(0, bytes - CABECERA.length));
}

/** El límite de Vercel. */
const LIMITE_VERCEL = 4.5 * 1024 * 1024;

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

describe('peso en el envío', () => {
  // El fallo que corrige esto: medir la imagen y no el base64 dejaba
  // pasar 3.5 MB de fotos que en la petición eran casi 4.7 MB.
  test('el base64 pesa 4/3 de la imagen', () => {
    const foto = fotoDe(300_000);
    const proporcion = pesoEnEnvio(foto) / pesoDeDataUrl(foto);
    assert.ok(Math.abs(proporcion - 4 / 3) < 0.01, `proporción ${proporcion}`);
  });

  test('aguanta entradas vacías', () => {
    assert.equal(pesoEnEnvio(undefined), 0);
    assert.equal(pesoEnEnvio(''), 0);
  });
});

describe('pesoTotal', () => {
  test('suma lo que ocupan en el envío', () => {
    const total = pesoTotal([fotoQueOcupa(100_000), fotoQueOcupa(150_000)]);
    assert.equal(total, 250_000);
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

  test('fotos hasta el tope + el formulario no pasan del límite de Vercel', () => {
    const fotos = [1, 2, 3, 4].map(() => fotoQueOcupa(TOPE_FOTOS / 4));
    const peticion = { action: 'registrarVisita', observacion: 'x'.repeat(2000), fotosBase64: fotos };
    assert.ok(pesoPeticion(peticion) < LIMITE_VERCEL);
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
    const casi = fotoQueOcupa(TOPE_FOTOS - 1000);
    assert.equal(cabeOtraFoto([casi], fotoQueOcupa(1000)), true);
    assert.equal(cabeOtraFoto([casi], fotoQueOcupa(1001)), false);
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

describe('pesoPeticion', () => {
  test('mide el JSON tal como sale', () => {
    assert.equal(pesoPeticion({ a: 'b' }), '{"a":"b"}'.length);
  });

  // Los acentos ocupan dos bytes en UTF-8: contar caracteres se quedaría corto.
  test('cuenta los acentos como lo que pesan', () => {
    assert.equal(pesoPeticion('ñ'), 4); // comillas + 2 bytes
  });

  test('el límite deja margen bajo los 4.5 MB de Vercel', () => {
    assert.ok(LIMITE_PETICION < LIMITE_VERCEL);
  });

  test('una petición normal cabe y una gigante no', () => {
    const normal = { status: 'Todo Ok', fotosBase64: [fotoQueOcupa(400_000)] };
    const gigante = { status: 'Todo Ok', fotosBase64: [fotoQueOcupa(LIMITE_PETICION)] };
    assert.equal(peticionCabe(normal), true);
    assert.equal(peticionCabe(gigante), false);
  });
});

describe('comprimirParaQueQuepa', () => {
  /** Compresor de mentira que devuelve el tamaño pedido para cada ajuste. */
  function compresor(tamanos: Map<AjustesCompresion, number>) {
    const usados: AjustesCompresion[] = [];
    const comprimir = async (a: AjustesCompresion) => {
      usados.push(a);
      return fotoQueOcupa(tamanos.get(a) ?? 0);
    };
    return { comprimir, usados };
  }

  test('si cabe con la normal, no comprime dos veces', async () => {
    const { comprimir, usados } = compresor(
      new Map([[COMPRESION_NORMAL, 300_000]]),
    );
    const foto = await comprimirParaQueQuepa([], comprimir);
    assert.ok(foto);
    assert.deepEqual(usados, [COMPRESION_NORMAL]);
  });

  test('si no cabe, prueba con la fuerte antes de rechazarla', async () => {
    const llenas = [fotoQueOcupa(TOPE_FOTOS - 200_000)];
    const { comprimir, usados } = compresor(
      new Map([
        [COMPRESION_NORMAL, 300_000],
        [COMPRESION_FUERTE, 150_000],
      ]),
    );
    const foto = await comprimirParaQueQuepa(llenas, comprimir);
    assert.equal(pesoEnEnvio(foto!), 150_000);
    assert.deepEqual(usados, [COMPRESION_NORMAL, COMPRESION_FUERTE]);
  });

  test('si ni con la fuerte cabe, devuelve null', async () => {
    const llenas = [fotoQueOcupa(TOPE_FOTOS - 50_000)];
    const { comprimir } = compresor(
      new Map([
        [COMPRESION_NORMAL, 300_000],
        [COMPRESION_FUERTE, 150_000],
      ]),
    );
    assert.equal(await comprimirParaQueQuepa(llenas, comprimir), null);
  });

  test('una foto que no se puede leer sigue avisando', async () => {
    await assert.rejects(
      comprimirParaQueQuepa([], async () => {
        throw new FotoNoProcesable();
      }),
      FotoNoProcesable,
    );
  });

  test('la fuerte comprime de verdad más que la normal', () => {
    assert.ok(COMPRESION_FUERTE.lado < COMPRESION_NORMAL.lado);
    assert.ok(COMPRESION_FUERTE.calidad < COMPRESION_NORMAL.calidad);
  });
});
