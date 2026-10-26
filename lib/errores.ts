// ══════════════════════════════════════════════════
//  Errores de pantalla
//
//  Sin señal, si una pantalla no quedó guardada en el
//  celular, Next no puede cargar su código y lanza un
//  ChunkLoadError. Eso no es un fallo de la app: hay que
//  decirle al CAP qué pasa y darle un "Volver", nunca el
//  "Application error" de Next.
// ══════════════════════════════════════════════════

/** True si el error es que no se pudo cargar el código de una pantalla. */
export function esFalloDeCarga(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: string; message?: string };
  if (name === 'ChunkLoadError') return true;
  return /loading (css )?chunk|dynamically imported module|importing a module script failed/i.test(
    String(message || ''),
  );
}

export interface TextoError {
  titulo: string;
  detalle: string;
}

export function textoDeError(error: unknown): TextoError {
  if (esFalloDeCarga(error)) {
    return {
      titulo: 'Esta pantalla no está guardada en el celular',
      detalle:
        'Conéctate a internet una vez y volverá a funcionar sin señal. Tus visitas guardadas no se pierden.',
    };
  }
  return {
    titulo: 'Algo salió mal',
    detalle: 'Vuelve a la pantalla anterior o inténtalo de nuevo.',
  };
}
