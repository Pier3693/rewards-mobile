// ══════════════════════════════════════════════════
//  Contraste de colores (WCAG 2.1)
//
//  Lo usan las pruebas del tema para comprobar que el
//  texto se lee (AA: 4.5:1 para texto normal).
//
//  El modo oscuro usa colores con transparencia (los chips
//  son el color al 20 %, el texto secundario va al 60 %):
//  esos se componen sobre el fondo real antes de medir.
// ══════════════════════════════════════════════════

export const AA = 4.5;

type Rgb = [number, number, number];

export interface Color {
  rgb: Rgb;
  alfa: number;
}

/** '#3d35c8', '#fff' o 'rgba(235, 235, 245, 0.6)'. */
export function leerColor(texto: string): Color {
  const t = texto.trim();
  const m = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return {
      rgb: [Number(m[1]), Number(m[2]), Number(m[3])],
      alfa: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  let h = t.replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Color no válido: ${texto}`);
  return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb, alfa: 1 };
}

/** El color tal como se ve encima de un fondo opaco. */
export function componer(color: string, fondo: string): Rgb {
  const c = leerColor(color);
  const f = leerColor(fondo);
  if (f.alfa < 1) throw new Error(`El fondo tiene que ser opaco: ${fondo}`);
  return c.rgb.map((v, i) => Math.round(v * c.alfa + f.rgb[i] * (1 - c.alfa))) as Rgb;
}

function luminanciaRgb(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Luminancia relativa de un color opaco, de 0 (negro) a 1 (blanco). */
export function luminancia(color: string): number {
  return luminanciaRgb(leerColor(color).rgb);
}

/**
 * Relación de contraste entre un texto y su fondo, de 1 a 21.
 *
 * @param base el fondo opaco que hay debajo cuando el fondo o el texto
 *   tienen transparencia (por ejemplo la tarjeta, bajo un chip al 20 %).
 */
export function contraste(texto: string, fondo: string, base = '#ffffff'): number {
  const fondoVisto = componer(fondo, base);
  const fondoHex = `rgb(${fondoVisto.join(',')})`;
  const textoVisto = componer(texto, fondoHex);
  const [claro, oscuro] = [luminanciaRgb(textoVisto), luminanciaRgb(fondoVisto)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}
