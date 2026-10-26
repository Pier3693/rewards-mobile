// ══════════════════════════════════════════════════
//  /sw.js con versión
//
//  El código vive en lib/sw/sw.js como JS normal. Aquí se le
//  pone la versión del despliegue (el commit en Vercel), así
//  cada despliegue trae un service worker nuevo con su propia
//  caché y el aviso "Hay una nueva versión". También se le
//  pone la lista de archivos del build, para que guarde los
//  chunks de todas las pantallas aunque el CAP no las haya
//  abierto con señal.
//
//  force-static: se arma una sola vez, en el build, cuando
//  .next/static ya existe. El Cache-Control va en
//  next.config.mjs.
// ══════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// Relativa y con extensión, como en lib/: las pruebas importan esta ruta
// con node --test, que no conoce el alias @/.
import { listarRecursosEstaticos } from '../../lib/sw/recursos.ts';

export const dynamic = 'force-static';

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || `local-${Date.now().toString(36)}`;

export function GET() {
  // En desarrollo los chunks cambian a cada guardado: no se listan.
  const recursos =
    process.env.NODE_ENV === 'production'
      ? listarRecursosEstaticos(join(process.cwd(), '.next', 'static'))
      : [];

  // Se reemplazan los literales exactos, no cualquier aparición.
  const codigo = readFileSync(join(process.cwd(), 'lib', 'sw', 'sw.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(VERSION))
    .replace('[] /* __RECURSOS_APP__ */', JSON.stringify(recursos));

  return new Response(codigo, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
