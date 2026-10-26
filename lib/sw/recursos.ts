// ══════════════════════════════════════════════════
//  Archivos del build que el service worker guarda
//
//  /hoy solo nombra sus propios chunks, así que con leer el
//  HTML no basta: los de /visita/[id] o /local/[id] solo
//  aparecerían si el CAP hubiera entrado con señal. Se lista
//  el directorio entero en el build (app/sw.js/route.ts) y
//  no el manifest de Next: así entran también los chunks
//  que se cargan bajo demanda, y no depende del formato
//  interno de cada versión de Next.
// ══════════════════════════════════════════════════

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Lo que se recorre dentro de .next/static. */
const CARPETAS = ['chunks', 'css', 'media'];

/** chunks/pages es del router de páginas, que la app no usa. */
const EXCLUIDAS = [join('chunks', 'pages')];

/**
 * La ruta tal como la pide el navegador: `[id]` → `%5Bid%5D`, los
 * paréntesis de `(app)` literales. Igual que claveDe en lib/sw/sw.js.
 */
export function claveDe(ruta: string): string {
  try {
    return encodeURI(decodeURI(ruta));
  } catch {
    return ruta;
  }
}

function recorrer(dir: string, base: string, salida: string[]) {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const completo = join(dir, entrada.name);
    const rel = relative(base, completo);
    if (EXCLUIDAS.some((ex) => rel === ex || rel.startsWith(ex + sep))) continue;
    if (entrada.isDirectory()) recorrer(completo, base, salida);
    else if (entrada.isFile()) salida.push(rel);
  }
}

/**
 * Todos los archivos de `.next/static` que usa la app, como
 * `/_next/static/...`. Vacío si el directorio no existe (dev, pruebas).
 */
export function listarRecursosEstaticos(dirStatic: string): string[] {
  const salida: string[] = [];
  for (const carpeta of CARPETAS) {
    const dir = join(dirStatic, carpeta);
    if (existsSync(dir)) recorrer(dir, dirStatic, salida);
  }
  return salida
    .map((rel) => claveDe(`/_next/static/${rel.split(sep).join('/')}`))
    .sort();
}
