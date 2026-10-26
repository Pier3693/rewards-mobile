// ══════════════════════════════════════════════════
//  Caché de la ruta del día
//
//  Tres pantallas necesitan las asignaciones de hoy:
//    - Hoy      → la ruta completa
//    - Buscar   → el chip "En tu ruta hoy"
//    - Detalle  → los datos de la asignación del local
//
//  Cada llamada a Apps Script tarda 1–3 s y hay cuota diaria, así que
//  se pide una sola vez y se comparte.
//
//  Además queda una copia en el celular (localStorage), por usuario y
//  por día, para dos cosas: pintar al instante al abrir la app y poder
//  trabajar sin señal. La copia nunca se da por buena sin más: quien la
//  usa pide la versión fresca en segundo plano (ver rutaNecesitaRefresco).
// ══════════════════════════════════════════════════

import { api, MS_LIMITE_CARGA, type ApiResponse } from './api.ts';
import { getUsuario } from './auth.ts';
import {
  ordenarRuta,
  estaCompletada,
  aplicarEncoladas,
  type Encolada,
  type Parada,
} from './ruta.ts';

export interface DiaData {
  fecha: string;
  pendientes: Parada[];
  completadas: Parada[];
  total: number;
}

const CLAVE_DIA = 'rw_ruta_dia';
const CLAVE_LOCALES = 'rw_locales_dia';

let guardado: DiaData | null = null;
/** Cuándo se trajo del backend, para poder decírselo al CAP. */
let actualizadoEn = 0;
/** La copia en memoria salió del celular y todavía no se confirmó con el backend. */
let deDisco = false;
/** Petición en curso, para que dos pantallas a la vez no pidan dos veces. */
let enVuelo: Promise<ApiResponse<DiaData>> | null = null;

/** Fecha de hoy en el formato del backend (dd/MM/yyyy). */
function hoyTexto(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** De quién es la copia: en un celular compartido no se mezclan rutas. */
function correoActual(): string {
  return String(getUsuario()?.correo || '').trim().toLowerCase();
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

interface RutaEnDisco {
  correo: string;
  fecha: string;
  data: DiaData;
  actualizadoEn: number;
}

function leerDeDisco(): RutaEnDisco | null {
  try {
    const crudo = storage()?.getItem(CLAVE_DIA);
    if (!crudo) return null;
    const g = JSON.parse(crudo) as RutaEnDisco;
    // La ruta de ayer, o la de otro CAP, no sirve: mejor vacío que
    // enseñar paradas que no son.
    if (g.fecha !== hoyTexto() || g.correo !== correoActual()) return null;
    return g;
  } catch {
    return null;
  }
}

function escribirEnDisco(data: DiaData, cuando: number) {
  try {
    const g: RutaEnDisco = {
      correo: correoActual(),
      fecha: hoyTexto(),
      data,
      actualizadoEn: cuando,
    };
    storage()?.setItem(CLAVE_DIA, JSON.stringify(g));
  } catch {
    /* sin espacio o bloqueado: la app sigue, solo pierde el modo sin señal */
  }
}

/** Cuándo se trajo la ruta del backend. 0 si nunca. */
export function rutaActualizadaEn(): number {
  if (actualizadoEn) return actualizadoEn;
  return leerDeDisco()?.actualizadoEn || 0;
}

/**
 * True si lo que se está enseñando es la copia del celular y conviene
 * pedir la fresca con `getRutaDeHoy(true)`.
 */
export function rutaNecesitaRefresco(): boolean {
  return deDisco;
}

// ── Locales del día ───────────────────────────────

interface LocalEnDisco {
  correo: string;
  fecha: string;
  /** Cuándo se trajo, para decir "datos de las 8:12". */
  guardadoEn: number;
  datos: unknown;
}

function leerLocales(): Record<string, LocalEnDisco> {
  try {
    const crudo = storage()?.getItem(CLAVE_LOCALES);
    return crudo ? (JSON.parse(crudo) as Record<string, LocalEnDisco>) : {};
  } catch {
    return {};
  }
}

function claveLocal(idLocal: string): string {
  return String(idLocal || '').trim().toUpperCase();
}

function esDeHoyYMio(g: LocalEnDisco | undefined): g is LocalEnDisco {
  return !!g && g.fecha === hoyTexto() && g.correo === correoActual();
}

/**
 * Datos de `getAutocompletado` de un local, guardados para que el
 * detalle y el registro funcionen sin señal.
 */
export function guardarLocalDelDia(idLocal: string, datos: unknown) {
  const id = claveLocal(idLocal);
  if (!id) return;
  try {
    // De paso se tira lo de otros días y otros usuarios: si no, el mapa
    // crecería sin fin.
    const vigentes: Record<string, LocalEnDisco> = {};
    for (const [k, g] of Object.entries(leerLocales())) {
      if (esDeHoyYMio(g)) vigentes[k] = g;
    }
    vigentes[id] = {
      correo: correoActual(),
      fecha: hoyTexto(),
      guardadoEn: Date.now(),
      datos,
    };
    storage()?.setItem(CLAVE_LOCALES, JSON.stringify(vigentes));
  } catch {
    /* ignorar */
  }
}

/** Lo guardado de un local, o null si no hay, es de otro día o de otro CAP. */
export function localDelDiaEnCache<T>(
  idLocal: string,
): { datos: T; guardadoEn: number } | null {
  const g = leerLocales()[claveLocal(idLocal)];
  if (!esDeHoyYMio(g)) return null;
  return { datos: g.datos as T, guardadoEn: g.guardadoEn };
}

export interface RespuestaLocal<T> extends ApiResponse<T> {
  /** Se usó la copia del celular porque el backend no respondió. */
  deCache?: boolean;
  /** Cuándo se guardó esa copia. */
  guardadoEn?: number;
}

/**
 * Una copia de menos de esto se usa sin preguntar al backend. Cubre el
 * recorrido normal Hoy → Detalle → Registro, que antes hacía tres
 * llamadas iguales a Apps Script (de 1 a 3 s cada una) por el mismo local.
 */
export const MS_LOCAL_FRESCO = 10 * 60_000;

/** Pedidos en curso por local: dos pantallas a la vez comparten uno. */
const localesEnVuelo = new Map<string, Promise<ApiResponse<unknown>>>();

/** Pide un local al backend (uno en vuelo por local) y guarda la copia. */
function pedirLocal<T>(idLocal: string, msLimite = MS_LIMITE_CARGA): Promise<ApiResponse<T>> {
  const id = claveLocal(idLocal);
  const enCurso = localesEnVuelo.get(id);
  if (enCurso) return enCurso as Promise<ApiResponse<T>>;

  const pedido = api<T>('getAutocompletado', { id_local: idLocal }, { msLimite })
    .then((r) => {
      if (r.ok && r.data) guardarLocalDelDia(idLocal, r.data);
      return r;
    })
    .finally(() => localesEnVuelo.delete(id));
  localesEnVuelo.set(id, pedido as Promise<ApiResponse<unknown>>);
  return pedido;
}

/**
 * Los datos de un local, para el detalle y el registro:
 * - si el celular lo guardó hace menos de 10 min, esa copia, sin red;
 * - si no, del backend, y si el fallo es de camino, la copia vieja.
 */
export async function getLocalDelDia<T>(
  idLocal: string,
  msLimite = MS_LIMITE_CARGA,
  ahora = Date.now(),
): Promise<RespuestaLocal<T>> {
  const reciente = localDelDiaEnCache<T>(idLocal);
  if (reciente && ahora - reciente.guardadoEn < MS_LOCAL_FRESCO) {
    return { ok: true, data: reciente.datos };
  }

  const r = await pedirLocal<T>(idLocal, msLimite);
  if (r.ok && r.data) return r;

  // Solo se cae a la copia si el fallo fue de camino: si el backend dice
  // que el local no existe, una copia vieja no debe taparlo.
  const copia = r.reintentable ? localDelDiaEnCache<T>(idLocal) : null;
  if (copia) {
    return { ok: true, data: copia.datos, deCache: true, guardadoEn: copia.guardadoEn };
  }

  const sinRed = typeof navigator !== 'undefined' && navigator.onLine === false;
  return sinRed
    ? { ...r, error: 'Necesitas conexión para abrir un local que no está en tu ruta de hoy.' }
    : r;
}

let precargando = false;

/**
 * Trae en segundo plano los locales de la ruta que todavía no están en
 * el celular, para que abran sin señal. De uno en uno, para no gastar
 * la cuota de Apps Script de golpe, y se detiene al primer fallo.
 */
export async function precargarLocalesDelDia(idsLocales: string[]) {
  if (precargando) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  precargando = true;
  try {
    const faltan = [...new Set(idsLocales.map(claveLocal).filter(Boolean))].filter(
      (id) => !localDelDiaEnCache(id),
    );
    for (const id of faltan) {
      // Comparte el pedido si el CAP abre ese local mientras tanto.
      const r = await pedirLocal(id);
      if (!r.ok || !r.data) break;
    }
  } finally {
    precargando = false;
  }
}

/** Al cerrar sesión: la ruta y los locales son del CAP que se va. */
export function borrarCacheDelDia() {
  invalidarRutaDeHoy();
  try {
    storage()?.removeItem(CLAVE_DIA);
    storage()?.removeItem(CLAVE_LOCALES);
  } catch {
    /* ignorar */
  }
}

// ── Ruta del día ──────────────────────────────────

/**
 * Las asignaciones de hoy, de la caché si ya se pidieron.
 *
 * Sin `forzar`, la copia del celular vuelve al instante. Con `forzar`
 * se pregunta al backend y, si no responde, se devuelve esa copia en vez
 * de dejar la pantalla vacía.
 */
export async function getRutaDeHoy(
  forzar = false,
  msLimite = MS_LIMITE_CARGA,
): Promise<ApiResponse<DiaData>> {
  if (!forzar && guardado) return { ok: true, data: guardado };
  if (!forzar && enVuelo) return enVuelo;

  if (!guardado) {
    const disco = leerDeDisco();
    if (disco) {
      guardado = disco.data;
      actualizadoEn = disco.actualizadoEn;
      deDisco = true;
      if (!forzar) return { ok: true, data: guardado };
    }
  }

  // El catch y el finally no son adorno: si la promesa se rechazara,
  // `enVuelo` quedaría apuntando a una promesa rechazada para siempre y
  // todas las llamadas siguientes devolverían ese mismo rechazo, dejando
  // la pantalla colgada incluso al pulsar "Reintentar".
  enVuelo = api<DiaData>('getAsignacionesDia', {}, { msLimite })
    .then((r): ApiResponse<DiaData> => {
      if (r.ok && r.data) {
        guardado = r.data;
        actualizadoEn = Date.now();
        deDisco = false;
        escribirEnDisco(r.data, actualizadoEn);
        return r;
      }
      // Sin señal pero con copia: mejor la copia que la pantalla vacía.
      // Un authError sí se deja pasar, para que mande al login.
      if (guardado && !r.authError) return { ok: true, data: guardado };
      return r;
    })
    .catch((): ApiResponse<DiaData> => {
      if (guardado) return { ok: true, data: guardado };
      return {
        ok: false,
        error: 'No se pudo cargar tu ruta de hoy. Intenta de nuevo.',
      };
    })
    .finally(() => {
      enVuelo = null;
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
  actualizadoEn = 0;
  deDisco = false;
}

/**
 * El día con las visitas en cola contadas como hechas. Así Hoy, el
 * detalle y la confirmación no ofrecen registrar otra vez lo que ya
 * está esperando envío.
 */
export function aplicarEncoladasAlDia(
  data: DiaData | null,
  encoladas: Encolada[],
): DiaData | null {
  if (!data || !encoladas.length) return data;
  return {
    ...data,
    pendientes: aplicarEncoladas(data.pendientes, encoladas),
    completadas: aplicarEncoladas(data.completadas, encoladas),
  };
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
