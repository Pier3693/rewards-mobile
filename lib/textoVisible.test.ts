import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

// ══════════════════════════════════════════════════
//  En pantalla va el guion normal "-", nunca el largo.
//
//  Se revisa el código sin sus comentarios: lo que queda
//  son textos y JSX, que es lo que el CAP puede ver. Los
//  datos de la hoja no pasan por aquí: se muestran tal cual.
// ══════════════════════════════════════════════════

const GUION_LARGO = '—';

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

/** "archivo:línea" de cada guion largo fuera de comentarios. */
function guionesLargos(nombre: string, codigo: string): string[] {
  return sinComentarios(codigo)
    .split('\n')
    .flatMap((l, i) => (l.includes(GUION_LARGO) ? [`${nombre}:${i + 1}  ${l.trim()}`] : []));
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

describe('guion largo en pantalla', () => {
  test('no aparece en app/, components/ ni lib/', () => {
    const encontrados = ['app', 'components', 'lib']
      .flatMap(archivos)
      .flatMap((ruta) => guionesLargos(relative(process.cwd(), ruta), readFileSync(ruta, 'utf8')));
    assert.deepEqual(encontrados, [], 'Usa "-" en lugar del guion largo:\n' + encontrados.join('\n'));
  });

  test('ni en el manifest', () => {
    const manifest = readFileSync(join(process.cwd(), 'public', 'manifest.json'), 'utf8');
    assert.ok(!manifest.includes(GUION_LARGO));
  });

  // Que la revisión de arriba de verdad lo encuentre.
  test('lo detecta en un texto y lo deja pasar en un comentario', () => {
    assert.equal(guionesLargos('x.tsx', `const a = 'Hoy ${GUION_LARGO} 5 paradas';`).length, 1);
    assert.equal(guionesLargos('x.tsx', `<p>{v || '${GUION_LARGO}'}</p>`).length, 1);
    assert.equal(guionesLargos('x.ts', `// a ${GUION_LARGO} b\nconst a = 1; // c ${GUION_LARGO} d`).length, 0);
    assert.equal(guionesLargos('x.tsx', `/* a ${GUION_LARGO}\n b */ {/* c ${GUION_LARGO} */}`).length, 0);
    assert.equal(guionesLargos('x.js', `// a ${GUION_LARGO} b\r\nconst a = 1;\r\n`).length, 0);
    // "https://" no se toma por un comentario.
    assert.equal(guionesLargos('x.ts', `const u = 'https://x.pe ${GUION_LARGO} y';`).length, 1);
  });

  test('las líneas siguen en su sitio tras quitar un bloque', () => {
    assert.equal(guionesLargos('x.ts', `/*\n\n*/\nconst a = '${GUION_LARGO}';`)[0].split('  ')[0], 'x.ts:4');
  });
});
