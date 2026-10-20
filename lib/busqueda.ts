// ══════════════════════════════════════════════════
//  Búsqueda de comercios
//
//  Dos problemas que resuelve este módulo:
//   - Las respuestas pueden llegar desordenadas: si "par" tarda más que
//     "pardos", la lista terminaría mostrando lo que el CAP ya no buscó.
//   - Las últimas búsquedas se guardan en el celular para repetirlas.
// ══════════════════════════════════════════════════

/** Filtros de la pantalla, en el formato que ya acepta el backend. */
export type TipoLocal = 'todos' | 'pc' | 'cc';

export const FILTROS: { valor: TipoLocal; label: string }[] = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'pc', label: 'Puerta calle' },
  { valor: 'cc', label: 'C. comercial' },
];

/** Mínimo de letras para empezar a buscar; el backend exige lo mismo. */
export const MIN_LETRAS = 2;

/** Espera entre teclas antes de llamar al backend. */
export const MS_ESPERA = 300;

/** Máximo de resultados que devuelve el backend hoy. */
export const TOPE_RESULTADOS = 15;

// ── Carreras entre respuestas ─────────────────────

export interface ControlDeCarrera {
  /** Registra una búsqueda nueva y devuelve su número. */
  iniciar(): number;
  /** True solo si esa búsqueda sigue siendo la última pedida. */
  esVigente(numero: number): boolean;
}

/**
 * Lleva la cuenta de las búsquedas para descartar las respuestas viejas.
 *
 * Cada búsqueda toma un número al salir y lo comprueba al volver: si
 * mientras tanto salió otra, la respuesta se ignora. Así, si la de "par"
 * llega después de la de "pardos", no pisa los resultados buenos.
 */
export function crearControlDeCarrera(): ControlDeCarrera {
  let ultimo = 0;
  return {
    iniciar: () => ++ultimo,
    esVigente: (numero: number) => numero === ultimo,
  };
}

// ── Búsquedas recientes ───────────────────────────

const CLAVE_RECIENTES = 'rw_busquedas';
export const MAX_RECIENTES = 5;

/** Añade una búsqueda al principio, sin repetidas y con tope. */
export function agregarReciente(lista: string[], termino: string): string[] {
  const limpio = String(termino || '').trim();
  if (limpio.length < MIN_LETRAS) return lista;
  const resto = lista.filter(
    (x) => x.toLowerCase() !== limpio.toLowerCase(),
  );
  return [limpio, ...resto].slice(0, MAX_RECIENTES);
}

export function leerRecientes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const crudo = window.localStorage.getItem(CLAVE_RECIENTES);
    if (!crudo) return [];
    const lista: unknown = JSON.parse(crudo);
    if (!Array.isArray(lista)) return [];
    return lista.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECIENTES);
  } catch {
    // En modo privado el navegador lanza excepción al tocar storage.
    return [];
  }
}

export function guardarRecientes(lista: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    /* sin espacio o bloqueado: no es crítico */
  }
}

export function borrarRecientes() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLAVE_RECIENTES);
  } catch {
    /* ignorar */
  }
}
