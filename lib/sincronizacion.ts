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

import { delUsuario, type AlmacenCola, type VisitaEncolada } from './cola.ts';
import type { ApiResponse } from './api.ts';
import { queHacerTrasEnvio, type TrasEnvio } from './visita.ts';

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
  /**
   * El CAP conectado. Solo se envían sus visitas: el token es suyo, y
   * las de otro saldrían a su nombre.
   */
  correo: string;
  /** Manda una visita al backend. Normalmente `api('registrarVisita', …)`. */
  enviar: (payload: Record<string, unknown>) => Promise<ApiResponse<unknown>>;
  ahora?: number;
  /** true para saltarse las esperas: lo usa el botón de reintentar. */
  forzar?: boolean;
  /**
   * Visitas que ya se están enviando por otro lado (el envío inmediato
   * de Guardar). No se tocan: saldrían dos veces a la vez.
   */
  excluir?: ReadonlySet<string>;
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
  correo,
  enviar,
  ahora = Date.now(),
  forzar = false,
  excluir,
}: OpcionesSincronizacion): Promise<ResultadoSincronizacion> {
  const visitas = delUsuario(await almacen.listar(), correo);
  let enviadas = 0;
  const pendientes = async () => delUsuario(await almacen.listar(), correo).length;

  for (const v of visitas) {
    if (excluir?.has(v.idVisita)) continue;
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
      return { enviadas, pendientes: await pendientes(), sesionVencida: true };
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

  return { enviadas, pendientes: await pendientes(), sesionVencida: false };
}

/**
 * Lo que se hace con la entrada después del envío inmediato de Guardar.
 *
 * - Guardada o repetida → se borra: el trabajo está hecho.
 * - Rechazo del backend → se queda, marcada para revisar. El CAP ya vio
 *   la confirmación y salió del formulario: borrarla la perdería.
 * - Corte por el camino → se cuenta el intento y queda para la cola.
 * - Sesión vencida → no se toca: se envía al volver a entrar.
 */
export async function registrarResultado(
  almacen: AlmacenCola,
  v: VisitaEncolada,
  resultado: TrasEnvio,
  ahora = Date.now(),
  error = '',
) {
  if (resultado === 'guardada' || resultado === 'repetida') {
    await almacen.borrar(v.idVisita);
    return;
  }
  if (resultado === 'error') {
    // Sin reintentos solos (reenviar lo mismo daría lo mismo): espera al
    // botón Reintentar, que pasa por encima con `forzar`.
    await almacen.guardar({
      ...v,
      revisar: true,
      intentos: Math.max(v.intentos, MAX_INTENTOS_AUTOMATICOS),
      ultimoError: error || 'El servidor no aceptó la visita',
    });
    return;
  }
  if (resultado === 'reintentar') {
    await aplazar(almacen, v, ahora, error || 'No se pudo enviar');
  }
}

/** Manda una entrada y deja la cola como corresponda. Nunca rechaza. */
export async function enviarAhora({
  almacen,
  entrada,
  enviar,
  ahora = () => Date.now(),
}: {
  almacen: AlmacenCola;
  entrada: VisitaEncolada;
  enviar: (payload: Record<string, unknown>) => Promise<ApiResponse<unknown>>;
  ahora?: () => number;
}): Promise<{ resultado: TrasEnvio; error: string }> {
  let r: ApiResponse<unknown>;
  try {
    r = await enviar(entrada.payload);
  } catch (e) {
    r = { ok: false, reintentable: true, error: String(e) };
  }
  const resultado = queHacerTrasEnvio(r);
  const error = r.error || '';
  await registrarResultado(almacen, entrada, resultado, ahora(), error);
  return { resultado, error };
}

/**
 * Guardar "primero en el celular": en cuanto la visita está en la cola,
 * devuelve, y el envío sigue por detrás. La pantalla enseña la
 * confirmación sin esperar a Apps Script ni a la subida de las fotos.
 *
 * Mientras se envía, la visita está en `enVuelo`: procesarCola no la toca
 * (recibe ese mismo conjunto en `excluir`), así no sale dos veces.
 *
 * @return enCola false si no hay IndexedDB (modo privado): entonces toca
 *   enviar a la antigua, esperando la respuesta.
 */
export async function guardarPrimeroLocal({
  almacen,
  entrada,
  enviar,
  enVuelo,
  ahora,
}: {
  almacen: AlmacenCola;
  entrada: VisitaEncolada;
  enviar: (payload: Record<string, unknown>) => Promise<ApiResponse<unknown>>;
  enVuelo: Set<string>;
  ahora?: () => number;
}): Promise<{ enCola: false } | { enCola: true; envio: Promise<{ resultado: TrasEnvio; error: string }> }> {
  try {
    await almacen.guardar(entrada);
  } catch {
    return { enCola: false };
  }
  enVuelo.add(entrada.idVisita);
  const envio = enviarAhora({ almacen, entrada, enviar, ahora }).finally(() =>
    enVuelo.delete(entrada.idVisita),
  );
  return { enCola: true, envio };
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
