// ══════════════════════════════════════════════════
//  Envío de las visitas que quedaron en cola
//
//  La política vive separada del almacenamiento y de la
//  red: procesarCola recibe sus dependencias, así las
//  pruebas le pasan un almacén y un emisor falsos.
//
//  Regla de oro: una visita NUNCA se descarta. Si no se
//  puede enviar, sigue esperando.
// ══════════════════════════════════════════════════

import type { AlmacenCola, VisitaEncolada } from './cola.ts';
import type { ApiResponse } from './api.ts';

/**
 * Espera entre intentos. Empieza corto, por si fue un bache de señal,
 * y se alarga para no castigar la batería ni la cuota de Apps Script.
 */
export const ESPERAS_MS = [
  5_000, // 5 s
  15_000, // 15 s
  60_000, // 1 min
  300_000, // 5 min
  900_000, // 15 min
  1_800_000, // 30 min, el tope
];

/**
 * A partir de aquí se deja de reintentar solo y se le pide al CAP que lo
 * mande a mano. La visita NO se borra: sigue en la cola.
 */
export const MAX_INTENTOS_AUTOMATICOS = 8;

export function esperaParaIntento(intentos: number): number {
  const i = Math.min(Math.max(intentos, 0), ESPERAS_MS.length - 1);
  return ESPERAS_MS[i];
}

/** True si ya toca reintentar esta visita. */
export function tocaReintentar(v: VisitaEncolada, ahora: number): boolean {
  return ahora >= v.proximoIntento;
}

/** True si se dejó de reintentar sola y espera al CAP. */
export function esperaEnvioManual(v: VisitaEncolada): boolean {
  return v.intentos >= MAX_INTENTOS_AUTOMATICOS;
}

export interface ResultadoSincronizacion {
  enviadas: number;
  pendientes: number;
  /** La sesión venció: no se tocó nada y hay que volver a entrar. */
  sesionVencida: boolean;
}

export interface OpcionesSincronizacion {
  almacen: AlmacenCola;
  /** Manda una visita al backend. Normalmente `api('registrarVisita', …)`. */
  enviar: (payload: Record<string, unknown>) => Promise<ApiResponse<unknown>>;
  ahora?: number;
  /** true para saltarse las esperas: lo usa el botón de reintentar. */
  forzar?: boolean;
}

/**
 * Recorre la cola e intenta enviar lo que toque.
 *
 * - Éxito, o el backend dice que ya estaba guardada → se borra.
 * - Sesión vencida → se detiene TODO y no se borra nada: la visita
 *   espera a que el CAP vuelva a entrar.
 * - Cualquier otro fallo → se cuenta el intento y se aplaza.
 */
export async function procesarCola({
  almacen,
  enviar,
  ahora = Date.now(),
  forzar = false,
}: OpcionesSincronizacion): Promise<ResultadoSincronizacion> {
  const visitas = await almacen.listar();
  let enviadas = 0;

  for (const v of visitas) {
    if (!forzar && !tocaReintentar(v, ahora)) continue;
    if (!forzar && esperaEnvioManual(v)) continue;

    let respuesta: ApiResponse<unknown>;
    try {
      respuesta = await enviar(v.payload);
    } catch (e) {
      await aplazar(almacen, v, ahora, String(e));
      continue;
    }

    if (respuesta.authError) {
      // Nada de borrar: la visita tiene que sobrevivir al nuevo login.
      return {
        enviadas,
        pendientes: (await almacen.contar()) ?? 0,
        sesionVencida: true,
      };
    }

    if (respuesta.ok) {
      // Vale igual si el backend responde que ya estaba guardada: el
      // trabajo está hecho y mantenerla en cola solo la reenviaría.
      await almacen.borrar(v.idVisita);
      enviadas++;
      continue;
    }

    await aplazar(almacen, v, ahora, respuesta.error || 'No se pudo enviar');
  }

  return {
    enviadas,
    pendientes: (await almacen.contar()) ?? 0,
    sesionVencida: false,
  };
}

async function aplazar(
  almacen: AlmacenCola,
  v: VisitaEncolada,
  ahora: number,
  error: string,
) {
  const intentos = v.intentos + 1;
  await almacen.guardar({
    ...v,
    intentos,
    proximoIntento: ahora + esperaParaIntento(intentos),
    ultimoError: error,
  });
}
