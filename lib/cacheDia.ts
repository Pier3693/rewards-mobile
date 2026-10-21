// ══════════════════════════════════════════════════
//  Caché de la ruta del día
//
//  Tres pantallas necesitan las asignaciones de hoy:
//    - Hoy      → la ruta completa
//    - Buscar   → el chip "En tu ruta hoy"
//    - Detalle  → los datos de la asignación del local
//
//  Cada llamada a Apps Script tarda 1–3 s y hay cuota diaria, así que
//  se pide una sola vez y se comparte. Vive en memoria: al recargar la
//  página se vuelve a pedir, así que no hay datos viejos pegados.
// ══════════════════════════════════════════════════

import { api, type ApiResponse } from './api.ts';
import { ordenarRuta, estaCompletada, type Parada } from './ruta.ts';

export interface DiaData {
  fecha: string;
  pendientes: Parada[];
  completadas: Parada[];
  total: number;
}

let guardado: DiaData | null = null;
/** Petición en curso, para que dos pantallas a la vez no pidan dos veces. */
let enVuelo: Promise<ApiResponse<DiaData>> | null = null;

/**
 * Las asignaciones de hoy, de la caché si ya se pidieron.
 * @param forzar vuelve a preguntarle al backend aunque haya copia.
 */
export async function getRutaDeHoy(forzar = false): Promise<ApiResponse<DiaData>> {
  if (!forzar && guardado) return { ok: true, data: guardado };
  if (!forzar && enVuelo) return enVuelo;

  enVuelo = api<DiaData>('getAsignacionesDia').then((r) => {
    if (r.ok && r.data) guardado = r.data;
    enVuelo = null;
    return r;
  });

  return enVuelo;
}

/** Lo ya cargado, sin pedir nada. Null si todavía no se pidió. */
export function rutaDeHoyEnCache(): DiaData | null {
  return guardado;
}

/** Tira la copia. Se llama al actualizar a mano y al guardar una visita. */
export function invalidarRutaDeHoy() {
  guardado = null;
  enVuelo = null;
}

/** Todas las paradas del día, pendientes y hechas, sin ordenar. */
export function paradasDelDia(data: DiaData | null): Parada[] {
  if (!data) return [];
  return [...data.pendientes, ...data.completadas];
}

/** Todas las asignaciones de hoy de un local, ordenadas por hora. */
export function asignacionesDeLocal(
  data: DiaData | null,
  idLocal: string,
): Parada[] {
  const id = String(idLocal || '').trim().toUpperCase();
  if (!id) return [];
  return ordenarRuta(
    paradasDelDia(data).filter(
      (p) => String(p.id_local || '').trim().toUpperCase() === id,
    ),
  );
}

/**
 * Solo las que todavía se pueden registrar.
 *
 * El registro nunca se engancha a una asignación ya completada: hacerlo
 * sobrescribiría su `resultado` y se perdería el de la primera visita.
 * Si todas están hechas, la segunda visita se guarda suelta.
 */
export function asignacionesPendientesDeLocal(
  data: DiaData | null,
  idLocal: string,
): Parada[] {
  return asignacionesDeLocal(data, idLocal).filter((p) => !estaCompletada(p));
}

/**
 * La asignación que se puede dar por supuesta, o null.
 *
 * Devuelve null cuando hay dos pendientes a propósito: un local puede
 * estar asignado dos veces el mismo día (por ejemplo Branding y
 * Capacitación Virtual) y elegir a ciegas escribiría el resultado en la
 * fila equivocada. En ese caso le toca preguntar a quien llama.
 */
export function asignacionDeLocal(
  data: DiaData | null,
  idLocal: string,
): Parada | null {
  const pendientes = asignacionesPendientesDeLocal(data, idLocal);
  return pendientes.length === 1 ? pendientes[0] : null;
}
