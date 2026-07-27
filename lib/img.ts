// ══════════════════════════════════════════════════
//  Compresión de fotos en el cliente antes de enviarlas
//  Reduce peso ~80% vs. foto sin comprimir de cámara
//  → crucial para 4G en campo
//
//  Fallback: si el navegador no puede decodificar la
//  imagen (típico con HEIC de iPhone elegido desde la
//  galería), se envía el archivo original sin comprimir
//  en vez de descartarlo en silencio.
// ══════════════════════════════════════════════════

const MAX_ANCHO = 1000;
const CALIDAD_JPEG = 0.72;

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export async function comprimirImagen(file: File): Promise<string> {
  const dataUrl = await leerComoDataUrl(file);

  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('decode-fail'));
      img.onload = () => {
        const escala = Math.min(1, MAX_ANCHO / img.width);
        const w = Math.round(img.width * escala) || img.width;
        const h = Math.round(img.height * escala) || img.height;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas-unavailable'));
        ctx.drawImage(img, 0, 0, w, h);

        resolve(canvas.toDataURL('image/jpeg', CALIDAD_JPEG));
      };
      img.src = dataUrl;
    });
  } catch {
    // El navegador no pudo decodificar (ej: HEIC) → enviamos
    // el archivo original sin comprimir en vez de perderlo.
    return dataUrl;
  }
}
