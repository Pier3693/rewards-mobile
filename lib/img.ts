// ══════════════════════════════════════════════════
//  Compresión de fotos en el cliente antes de enviarlas
//  Reduce peso ~80% vs. foto sin comprimir de cámara
//  → crucial para 4G en campo
//
//  Dos intentos de decodificación, porque <img> no puede
//  con todos los formatos. Si ninguno funciona se avisa
//  AL ELEGIR la foto: antes se enviaba el original sin
//  comprimir y el error salía al guardar, con el
//  formulario ya lleno.
// ══════════════════════════════════════════════════

const MAX_ANCHO = 1000;
const CALIDAD_JPEG = 0.72;

/**
 * Tope del peso total de las fotos de una visita.
 *
 * Vercel corta cualquier petición de más de 4.5 MB
 * (413 FUNCTION_PAYLOAD_TOO_LARGE), así que se deja 1 MB de margen
 * para el resto del formulario y la sobrecarga del JSON.
 */
export const TOPE_FOTOS = 3.5 * 1024 * 1024;

/** El error que distingue "no se pudo leer la imagen" de un fallo cualquiera. */
export class FotoNoProcesable extends Error {
  constructor() {
    super(
      'No pudimos procesar esta foto. Tómala con la cámara en vez de elegirla de la galería.',
    );
    this.name = 'FotoNoProcesable';
  }
}

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/** Dibuja en un canvas al tamaño de destino y devuelve el JPEG. */
function aJpeg(
  fuente: CanvasImageSource,
  anchoOriginal: number,
  altoOriginal: number,
): string {
  const escala = Math.min(1, MAX_ANCHO / anchoOriginal);
  const w = Math.round(anchoOriginal * escala) || anchoOriginal;
  const h = Math.round(altoOriginal * escala) || altoOriginal;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new FotoNoProcesable();
  ctx.drawImage(fuente, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', CALIDAD_JPEG);
}

/** Primer intento: el elemento <img>, que es lo que soporta todo navegador. */
function comprimirConImg(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onerror = () => reject(new Error('decode-fail'));
    img.onload = () => {
      try {
        resolve(aJpeg(img, img.width, img.height));
      } catch (e) {
        reject(e);
      }
    };
    img.src = dataUrl;
  });
}

/**
 * Segundo intento: createImageBitmap, que decodifica formatos que el
 * elemento <img> no acepta. Es el que rescata muchos HEIC de iPhone.
 */
async function comprimirConBitmap(file: File): Promise<string> {
  if (typeof createImageBitmap !== 'function') throw new FotoNoProcesable();
  const bitmap = await createImageBitmap(file);
  try {
    return aJpeg(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close?.();
  }
}

/**
 * Comprime una foto a JPEG.
 * @throws FotoNoProcesable si el navegador no puede decodificarla.
 */
export async function comprimirImagen(file: File): Promise<string> {
  const dataUrl = await leerComoDataUrl(file);

  try {
    return await comprimirConImg(dataUrl);
  } catch {
    // El elemento no pudo; probamos con el decodificador nativo.
  }

  try {
    return await comprimirConBitmap(file);
  } catch {
    // Ya no queda nada que intentar. Antes se enviaba el original sin
    // comprimir: un HEIC de 2 a 4 MB que reventaba el límite de Vercel.
    throw new FotoNoProcesable();
  }
}

// ══════════════════════════════════════════════════
//  Peso
// ══════════════════════════════════════════════════

/**
 * Bytes reales de un data URL.
 *
 * El base64 usa 4 caracteres por cada 3 bytes, y el relleno final ("=")
 * no son datos, así que contar la longitud del texto exageraría el peso.
 */
export function pesoDeDataUrl(dataUrl: string | undefined): number {
  const texto = String(dataUrl || '');
  const coma = texto.indexOf(',');
  if (coma < 0) return 0;

  const base64 = texto.slice(coma + 1);
  if (!base64) return 0;

  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno);
}

/** Peso sumado de varias fotos. */
export function pesoTotal(fotos: string[]): number {
  return fotos.reduce((suma, f) => suma + pesoDeDataUrl(f), 0);
}

/** "1.4 MB", "820 KB" — para decirle al CAP cuánto lleva. */
export function pesoLegible(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * True si la foto nueva cabe sin pasar del tope.
 * Se comprueba al elegirla, no al guardar.
 */
export function cabeOtraFoto(fotosActuales: string[], nueva: string): boolean {
  return pesoTotal(fotosActuales) + pesoDeDataUrl(nueva) <= TOPE_FOTOS;
}
