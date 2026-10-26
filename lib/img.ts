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

export interface AjustesCompresion {
  /** Píxeles del lado mayor: así una foto vertical no queda más grande. */
  lado: number;
  calidad: number;
}

export const COMPRESION_NORMAL: AjustesCompresion = { lado: 1000, calidad: 0.72 };

/** Segundo intento para una foto que no cabe con la normal. */
export const COMPRESION_FUERTE: AjustesCompresion = { lado: 800, calidad: 0.6 };

/**
 * Tope del peso EN EL ENVÍO de las fotos de una visita.
 *
 * Se mide el base64, que es lo que viaja y pesa 4/3 de la foto real:
 * medir los bytes de la imagen dejaba pasar peticiones de más de 4.5 MB.
 * Queda 1 MB de margen bajo el límite de Vercel para el resto del
 * formulario.
 */
export const TOPE_FOTOS = 3.5 * 1024 * 1024;

/**
 * Tope de la petición entera. Vercel corta a los 4.5 MB
 * (413 FUNCTION_PAYLOAD_TOO_LARGE); medio MB de margen.
 */
export const LIMITE_PETICION = 4 * 1024 * 1024;

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
  ajustes: AjustesCompresion,
): string {
  const escala = Math.min(1, ajustes.lado / Math.max(anchoOriginal, altoOriginal));
  const w = Math.round(anchoOriginal * escala) || anchoOriginal;
  const h = Math.round(altoOriginal * escala) || altoOriginal;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new FotoNoProcesable();
  ctx.drawImage(fuente, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', ajustes.calidad);
}

/** Primer intento: el elemento <img>, que es lo que soporta todo navegador. */
function comprimirConImg(dataUrl: string, ajustes: AjustesCompresion): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onerror = () => reject(new Error('decode-fail'));
    img.onload = () => {
      try {
        resolve(aJpeg(img, img.width, img.height, ajustes));
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
async function comprimirConBitmap(file: File, ajustes: AjustesCompresion): Promise<string> {
  if (typeof createImageBitmap !== 'function') throw new FotoNoProcesable();
  const bitmap = await createImageBitmap(file);
  try {
    return aJpeg(bitmap, bitmap.width, bitmap.height, ajustes);
  } finally {
    bitmap.close?.();
  }
}

/**
 * Comprime una foto a JPEG.
 * @throws FotoNoProcesable si el navegador no puede decodificarla.
 */
export async function comprimirImagen(
  file: File,
  ajustes: AjustesCompresion = COMPRESION_NORMAL,
): Promise<string> {
  const dataUrl = await leerComoDataUrl(file);

  try {
    return await comprimirConImg(dataUrl, ajustes);
  } catch {
    // El elemento no pudo; probamos con el decodificador nativo.
  }

  try {
    return await comprimirConBitmap(file, ajustes);
  } catch {
    // Ya no queda nada que intentar. Antes se enviaba el original sin
    // comprimir: un HEIC de 2 a 4 MB que reventaba el límite de Vercel.
    throw new FotoNoProcesable();
  }
}

/**
 * Comprime una foto para que quepa con las que ya hay: primero normal y,
 * si no cabe, una vez más con compresión fuerte antes de rechazarla.
 *
 * Recibe el compresor para poder probar la decisión sin canvas.
 * @return la foto comprimida, o null si no cabe ni así.
 * @throws FotoNoProcesable si el navegador no puede decodificarla.
 */
export async function comprimirParaQueQuepa(
  fotosActuales: string[],
  comprimir: (ajustes: AjustesCompresion) => Promise<string>,
): Promise<string | null> {
  const normal = await comprimir(COMPRESION_NORMAL);
  if (cabeOtraFoto(fotosActuales, normal)) return normal;

  const fuerte = await comprimir(COMPRESION_FUERTE);
  return cabeOtraFoto(fotosActuales, fuerte) ? fuerte : null;
}

// ══════════════════════════════════════════════════
//  Peso
// ══════════════════════════════════════════════════

/**
 * Bytes reales de la imagen de un data URL.
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

/**
 * Lo que ocupa una foto en la petición: el data URL entero, que es texto
 * ASCII, así que cada carácter es un byte.
 */
export function pesoEnEnvio(dataUrl: string | undefined): number {
  return String(dataUrl || '').length;
}

/** Peso en el envío de varias fotos. Es el que se compara con el tope. */
export function pesoTotal(fotos: string[]): number {
  return fotos.reduce((suma, f) => suma + pesoEnEnvio(f), 0);
}

/** Bytes de la petición entera, tal como sale por la red. */
export function pesoPeticion(payload: unknown): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}

/** True si la petición entera cabe bajo el límite de Vercel. */
export function peticionCabe(payload: unknown): boolean {
  return pesoPeticion(payload) <= LIMITE_PETICION;
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
  return pesoTotal(fotosActuales) + pesoEnEnvio(nueva) <= TOPE_FOTOS;
}
