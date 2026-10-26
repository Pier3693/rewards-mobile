// ══════════════════════════════════════════════════
//  Versión de la app (solo navegador)
//
//  La versión es la del service worker: la pone el build
//  en app/sw.js/route.ts (el commit en Vercel).
// ══════════════════════════════════════════════════

import type { ResultadoActualizacion } from './perfil.ts';

/** Avisa a ActualizacionApp de que hay una versión esperando. */
export const EVENTO_VERSION_NUEVA = 'rw-version-nueva';

/** Le pregunta la versión al service worker activo. '' si no contesta. */
export function pedirVersion(msLimite = 3000): Promise<string> {
  return new Promise((resolver) => {
    const activo = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
    if (!activo) return resolver('');
    const canal = new MessageChannel();
    const tope = setTimeout(() => resolver(''), msLimite);
    canal.port1.onmessage = (e) => {
      clearTimeout(tope);
      resolver(String(e.data?.version || ''));
    };
    activo.postMessage({ tipo: 'VERSION' }, [canal.port2]);
  });
}

/** Espera a que una versión recién encontrada termine de instalarse. */
function esperarInstalada(w: ServiceWorker): Promise<void> {
  return new Promise((resolver) => {
    const listo = () => w.state === 'installed' || w.state === 'activated' || w.state === 'redundant';
    if (listo()) return resolver();
    const alCambiar = () => {
      if (!listo()) return;
      w.removeEventListener('statechange', alCambiar);
      resolver();
    };
    w.addEventListener('statechange', alCambiar);
  });
}

/** "Buscar actualización" de Perfil. */
export async function buscarActualizacion(): Promise<ResultadoActualizacion> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'sin-sw';
  if (navigator.onLine === false) return 'sin-senal';

  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'sin-sw';
  try {
    await reg.update();
  } catch {
    return 'sin-senal';
  }

  const nueva = reg.installing || reg.waiting;
  if (!nueva) return 'ultima';
  await esperarInstalada(nueva);
  if (nueva.state === 'redundant') return 'ultima';

  window.dispatchEvent(new Event(EVENTO_VERSION_NUEVA));
  return 'nueva';
}
