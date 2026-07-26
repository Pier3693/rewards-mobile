// ══════════════════════════════════════════════════
//  Cliente del API (Apps Script)
//  - POST con Content-Type: text/plain → evita el
//    preflight CORS que Apps Script no soporta
//  - Maneja expiración de sesión (authError)
// ══════════════════════════════════════════════════

import { getToken, clearSession } from './auth';

// El cliente SIEMPRE habla con nuestro propio backend (mismo origen).
// Es /api/gs (server-side) quien reenvía a Apps Script, evitando CORS.
const PROXY_URL = '/api/gs';

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  authError?: boolean;
}

export async function api<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token: getToken(), ...params }),
    });

    const json = (await res.json()) as ApiResponse<T>;

    // Sesión expirada o token inválido → limpiar y mandar al login
    if (json.authError) {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }

    return json;
  } catch (e) {
    return {
      ok: false,
      error: navigator.onLine === false
        ? 'Sin conexión a internet. Revisa tu señal e intenta de nuevo.'
        : 'No se pudo conectar con el servidor. Intenta de nuevo.',
    };
  }
}
