// ══════════════════════════════════════════════════
//  Contraste de colores (WCAG 2.1)
//
//  Lo usan las pruebas del tema para comprobar que el
//  texto se lee (AA: 4.5:1 para texto normal).
// ══════════════════════════════════════════════════

export const AA = 4.5;

/** '#3d35c8' o '#fff' → [r, g, b] de 0 a 255. */
export function rgbDe(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Color no válido: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** Luminancia relativa, de 0 (negro) a 1 (blanco). */
export function luminancia(hex: string): number {
  const [r, g, b] = rgbDe(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste entre dos colores, de 1 a 21. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}
