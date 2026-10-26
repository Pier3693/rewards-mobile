// ══════════════════════════════════════════════════
//  Pedirle al service worker que guarde páginas
//
//  Hoy le pasa las páginas de las paradas del día. Antes se
//  mandaba en cada cambio de la pantalla (la cola, la ruta
//  fresca, el reloj): decenas de veces en pocos minutos.
//  Ahora solo cuando cambia la lista, y como mucho una vez
//  cada 5 minutos.
// ══════════════════════════════════════════════════

export const MS_ENTRE_ENVIOS = 5 * 60_000;

const CLAVE_RUTAS = 'rw_precalentado';
const CLAVE_BASE = 'rw_precalentado_base';

export interface UltimoEnvio {
  clave: string;
  en: number;
}

export type Decision =
  | { accion: 'enviar'; clave: string }
  | { accion: 'nada' }
  | { accion: 'esperar'; ms: number };

/** La misma lista en otro orden es la misma lista. */
export function claveDeRutas(rutas: string[]): string {
  return [...new Set(rutas)].sort().join('|');
}

export function decidirPrecalentar(
  rutas: string[],
  ahora: number,
  ultimo: UltimoEnvio | null,
): Decision {
  if (!rutas.length) return { accion: 'nada' };
  const clave = claveDeRutas(rutas);
  if (ultimo?.clave === clave) return { accion: 'nada' };
  if (!ultimo) return { accion: 'enviar', clave };

  const pasado = ahora - ultimo.en;
  if (pasado >= MS_ENTRE_ENVIOS) return { accion: 'enviar', clave };
  return { accion: 'esperar', ms: MS_ENTRE_ENVIOS - pasado };
}

// ── Navegador ─────────────────────────────────────

function sesion(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function leerUltimo(): UltimoEnvio | null {
  try {
    const crudo = sesion()?.getItem(CLAVE_RUTAS);
    return crudo ? (JSON.parse(crudo) as UltimoEnvio) : null;
  } catch {
    return null;
  }
}

/**
 * Manda el mensaje al service worker activo. Si es la primera visita y
 * todavía no controla la página, espera a que esté listo.
 */
function mandar(mensaje: unknown) {
  navigator.serviceWorker?.ready
    .then((reg) => reg.active?.postMessage(mensaje))
    .catch(() => {});
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Pide guardar estas páginas, si cambiaron y toca. */
export function precalentarRutas(rutas: string[]) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;

  const d = decidirPrecalentar(rutas, Date.now(), leerUltimo());
  if (d.accion === 'esperar') {
    temporizador = setTimeout(() => precalentarRutas(rutas), d.ms);
    return;
  }
  if (d.accion !== 'enviar') return;

  try {
    sesion()?.setItem(CLAVE_RUTAS, JSON.stringify({ clave: d.clave, en: Date.now() }));
  } catch {
    /* sin sessionStorage se envía igual; el service worker salta lo guardado */
  }
  mandar({ tipo: 'precalentar', rutas });
}

/** Las pantallas principales y los chunks del build: una vez por sesión. */
export function precalentarBase() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (sesion()?.getItem(CLAVE_BASE)) return;
    sesion()?.setItem(CLAVE_BASE, '1');
  } catch {
    /* se envía igual */
  }
  mandar({ tipo: 'PRECALENTAR_BASE' });
}

/**
 * Al cambiar de versión el service worker estrena caché vacía: hay que
 * volver a pedirle todo.
 */
export function olvidarPrecalentado() {
  try {
    sesion()?.removeItem(CLAVE_RUTAS);
    sesion()?.removeItem(CLAVE_BASE);
  } catch {
    /* ignorar */
  }
}
