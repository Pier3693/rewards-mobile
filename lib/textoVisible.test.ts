import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// ══════════════════════════════════════════════════
//  En pantalla va el guion normal "-", nunca el largo
//  ni el medio.
//
//  Se revisa el código sin sus comentarios: lo que queda
//  son textos y JSX, que es lo que el CAP puede ver. Los
//  datos de la hoja no pasan por aquí: se muestran tal cual.
// ══════════════════════════════════════════════════

const GUION_LARGO = '—';
const GUION_MEDIO = '–';
const NOMBRE: Record<string, string> = { [GUION_LARGO]: 'guion largo', [GUION_MEDIO]: 'guion medio' };

/**
 * El código sin comentarios, con las líneas en su sitio para poder decir
 * dónde está el problema. Los de línea solo cuentan si `//` va al
 * comienzo o detrás de un espacio: así no se corta un "https://…".
 */
export function sinComentarios(codigo: string): string {
  const sinBloques = codigo.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ''));
  // Hay archivos con fin de línea de Windows: con el \r, `.*$` no llega al final.
  return sinBloques
    .split(/\r?\n/)
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** "archivo:línea (guion largo)" de cada guion largo o medio fuera de comentarios. */
function guionesProhibidos(nombre: string, codigo: string): string[] {
  return sinComentarios(codigo)
    .split('\n')
    .flatMap((l, i) =>
      [GUION_LARGO, GUION_MEDIO]
        .filter((g) => l.includes(g))
        .map((g) => `${nombre}:${i + 1} (${NOMBRE[g]})  ${l.trim()}`),
    );
}

function archivos(carpeta: string): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name);
      if (e.isDirectory()) recorrer(ruta);
      else if (/\.(tsx?|m?js)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) salida.push(ruta);
    }
  };
  recorrer(join(process.cwd(), carpeta));
  return salida;
}

describe('guion largo y medio en pantalla', () => {
  test('no aparecen en app/, components/ ni lib/', () => {
    const encontrados = ['app', 'components', 'lib']
      .flatMap(archivos)
      .flatMap((ruta) => guionesProhibidos(relative(process.cwd(), ruta), readFileSync(ruta, 'utf8')));
    assert.deepEqual(encontrados, [], 'Usa "-" en su lugar:\n' + encontrados.join('\n'));
  });

  test('ni en el manifest', () => {
    const manifest = readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8');
    assert.ok(!manifest.includes(GUION_LARGO));
    assert.ok(!manifest.includes(GUION_MEDIO));
  });

  // Que la revisión de arriba de verdad los encuentre.
  for (const g of [GUION_LARGO, GUION_MEDIO]) {
    test(`detecta el ${NOMBRE[g]} en un texto y lo deja pasar en un comentario`, () => {
      assert.equal(guionesProhibidos('x.tsx', `const a = 'Hoy ${g} 5 paradas';`).length, 1);
      assert.equal(guionesProhibidos('x.tsx', `<p>{v || '${g}'}</p>`).length, 1);
      assert.equal(guionesProhibidos('x.ts', 'return `${inicio}' + g + '${fin}`;').length, 1);
      assert.equal(guionesProhibidos('x.ts', `// a ${g} b\nconst a = 1; // c ${g} d`).length, 0);
      assert.equal(guionesProhibidos('x.tsx', `/* a ${g}\n b */ {/* c ${g} */}`).length, 0);
      assert.equal(guionesProhibidos('x.js', `// a ${g} b\r\nconst a = 1;\r\n`).length, 0);
      // "https://" no se toma por un comentario.
      assert.equal(guionesProhibidos('x.ts', `const u = 'https://x.pe ${g} y';`).length, 1);
    });
  }

  test('dice cuál apareció y en qué línea, aunque se quite un bloque', () => {
    assert.deepEqual(
      guionesProhibidos('x.ts', `/*\n\n*/\nconst a = '${GUION_MEDIO}';`).map((e) => e.split('  ')[0]),
      ['x.ts:4 (guion medio)'],
    );
  });
});
