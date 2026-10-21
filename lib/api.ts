// ══════════════════════════════════════════════════
//  Cliente del API (Apps Script)
//  - POST con Content-Type: text/plain → evita el
//    preflight CORS que Apps Script no soporta
//  - Maneja expiración de sesión (authError)
//  - Toda llamada tiene límite de tiempo: sin él, una
//    petición que nunca responde deja la pantalla
//    colgada para siempre
// ══════════════════════════════════════════════════

import { getToken, clearSession, marcarSesionExpirada } from './auth.ts';

// El cliente SIEMPRE habla con nuestro propio backend (mismo origen).
// Es /api/gs (server-side) quien reenvía a Apps Script, evitando CORS.
const PROXY_URL = '/api/gs';

/**
 * Para cargar una pantalla. Pasado esto no vale la pena seguir
 * esperando: mejor enseñar el error y el botón de reintentar.
 */
export const MS_LIMITE_CARGA = 15_000;

/**
 * Para guardar con fotos. NO es un plazo de espera, es una red de
 * seguridad: `registrarVisita` sube hasta 4 fotos a Drive dentro de la
 * misma petición y en 4G eso pasa de 15 s con facilidad. Cortarlo antes
 * convertiría un guardado lento en un guardado fallido.
 */
export const MS_LIMITE_GUARDADO = 180_000;

/** Login, búsqueda y listas: rápidas, pero sin apretar de más. */
export const MS_LIMITE_POR_DEFECTO = 60_000;

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  authError?: boolean;
}

export interface OpcionesApi {
  /** Milisegundos antes de cancelar la petición. */
  msLimite?: number;
}

/**
 * Mensaje para los errores que no vienen de nuestro código, o vacío si
 * la respuesta se puede leer como JSON normal.
 *
 * El 413 importa de verdad: Vercel corta cualquier petición de más de
 * 4.5 MB. Las fotos comprimidas no llegan ahí, pero cuando el navegador
 * no puede decodificar una imagen —un HEIC de la galería del iPhone—
 * lib/img.ts manda el archivo original, y uno solo puede pasarse.
 */
function mensajePorEstado(estado: number): string {
  if (estado === 413) {
    return 'Las fotos pesan demasiado. Quita una o tómalas con la cámara en vez de elegirlas de la galería.';
  }
  if (estado === 504) {
    return 'El servidor tardó demasiado en responder. Revisa si la visita se guardó antes de reintentar.';
  }
  if (estado >= 500) {
    return 'El servidor no está disponible en este momento. Intenta de nuevo.';
  }
  return '';
}

/** True si el fallo vino de nuestro propio aborto por tiempo. */
function esAborto(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}

export async function api<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
  opciones: OpcionesApi = {},
): Promise<ApiResponse<T>> {
  const msLimite = opciones.msLimite ?? MS_LIMITE_POR_DEFECTO;

  // AbortController y no AbortSignal.timeout: el segundo no existe en
  // navegadores de teléfonos viejos y aquí no podemos permitirnos fallar.
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), msLimite);

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: getToken(), ...params }),
      signal: control.signal,
    });

    // Algunos errores los devuelve la plataforma antes de llegar a
    // nuestro proxy, con un cuerpo que no es JSON. Hay que mirarlos por
    // estado o res.json() revienta y el CAP ve un error genérico.
    const porEstado = mensajePorEstado(res.status);
    if (porEstado) return { ok: false, error: porEstado };

    const json = (await res.json()) as ApiResponse<T>;

    // Sesión expirada o token inválido → avisar y mandar al login.
    // El último usuario escrito ya quedó guardado al ingresar, así que el
    // login lo precarga y solo hay que volver a poner la contraseña.
    if (json.authError) {
      marcarSesionExpirada();
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }

    return json;
  } catch (e) {
    if (esAborto(e)) {
      return {
        ok: false,
        error: 'El servidor está tardando demasiado. Intenta de nuevo.',
      };
    }
    const sinRed =
      typeof navigator !== 'undefined' && navigator.onLine === false;
    return {
      ok: false,
      error: sinRed
        ? 'Sin conexión a internet. Revisa tu señal e intenta de nuevo.'
        : 'No se pudo conectar con el servidor. Intenta de nuevo.',
    };
  } finally {
    // Siempre, también en el camino feliz: si no, el temporizador seguiría
    // vivo y abortaría una petición ya terminada.
    clearTimeout(temporizador);
  }
}
