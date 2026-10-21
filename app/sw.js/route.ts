// ══════════════════════════════════════════════════
//  /sw.js con versión
//
//  El código vive en lib/sw/sw.js como JS normal. Aquí se le
//  pone la versión del despliegue (el commit en Vercel), así
//  cada despliegue trae un service worker nuevo con su propia
//  caché y el aviso "Hay una nueva versión".
//
//  force-static: se arma una sola vez, en el build. El
//  Cache-Control va en next.config.mjs.
// ══════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-static';

const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || `local-${Date.now().toString(36)}`;

export function GET() {
  // Se reemplaza el literal entre comillas, no cualquier aparición.
  const codigo = readFileSync(join(process.cwd(), 'lib', 'sw', 'sw.js'), 'utf8').replace(
    "'__VERSION__'",
    JSON.stringify(VERSION),
  );
  return new Response(codigo, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}
