// ══════════════════════════════════════════════════
//  Rutas de los próximos días
//
//  El admin puede asignar hoy la ruta de mañana, o el viernes
//  la del lunes. getAsignacionesProximas trae las de los
//  próximos 7 días (sin hoy) y aquí se guardan en el celular,
//  por CAP, para verlas antes y sin señal. Son de solo
//  lectura: se registran el día que toca.
//
//  Cuando llega ese día, su ruta pasa a ser la de Hoy: si no
//  hay señal ni copia de hoy, getRutaDeHoy (cacheDia.ts) usa
//  la que quedó guardada aquí.
// ══════════════════════════════════════════════════

import { api, MS_LIMITE_CARGA } from './api.ts';
import { getUsuario } from './auth.ts';
import type { DiaData } from './cacheDia.ts';

const CLAVE = 'rw_rutas_proximas';

// ── Fechas ("dd/MM/yyyy", como las manda el backend) ──

/** La fecha a medianoche del celular, o null si no se entiende. */
export function fechaDe(texto: string | undefined): Date | null {
  const m = String(texto || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return f.getDate() === Number(m[1]) && f.getMonth() === Number(m[2]) - 1 ? f : null;
}

export function textoFecha(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Días de calendario de `desde` a `hasta`, sin líos de horario de verano. */
export function diasEntre(desde: Date, hasta: Date): number {
  const dia = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000;
  return Math.round(dia(hasta) - dia(desde));
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * La pestaña de un día: "Hoy", "Mañana" (solo el día siguiente del
 * calendario: del viernes, el lunes es "Lun 2 nov") o "Lun 2 nov".
 */
export function etiquetaDia(fecha: string, hoy = new Date()): string {
  const f = fechaDe(fecha);
  if (!f) return fecha;
  const dias = diasEntre(hoy, f);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()} ${MESES_CORTOS[f.getMonth()]}`;
}

/** "Lunes 2 de noviembre". */
export function tituloDia(fecha: string): string {
  const f = fechaDe(fecha);
  if (!f) return fecha;
  const dia = DIAS[f.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)} ${f.getDate()} de ${MESES[f.getMonth()]}`;
}

/** "Disponible mañana", "Disponible el lunes", o a una semana, "Disponible el lunes 9". */
export function textoDisponible(fecha: string, hoy = new Date()): string {
  const f = fechaDe(fecha);
  if (!f) return 'Disponible ese día';
  const dias = diasEntre(hoy, f);
  if (dias === 1) return 'Disponible mañana';
  // A 7 días cae el mismo día de la semana que hoy: con el número no se confunde.
  return `Disponible el ${DIAS[f.getDay()]}${dias >= 7 ? ` ${f.getDate()}` : ''}`;
}

/** True si la fecha es después de hoy: su ruta solo se mira. */
export function esDiaFuturo(fecha: string, hoy = new Date()): boolean {
  const f = fechaDe(fecha);
  return !!f && diasEntre(hoy, f) > 0;
}

/** "31/10/2026" → "31-10-2026", para la URL del detalle (?dia=). */
export function diaParaUrl(fecha: string): string {
  return fechaDe(fecha) ? fecha.replace(/\//g, '-') : '';
}

/** "31-10-2026" → "31/10/2026", o '' si no es una fecha. */
export function diaDeUrl(param: string | null | undefined): string {
  const fecha = String(param || '').trim().replace(/-/g, '/');
  return fechaDe(fecha) ? fecha : '';
}

/**
 * Si el detalle de un local se abrió desde una parada de un día que viene
 * (?dia=), no se registra: "Disponible mañana" o "Disponible el lunes".
 * '' si se puede registrar: sin día, hoy, o un día que ya pasó.
 */
export function registroBloqueado(param: string | null | undefined, hoy = new Date()): string {
  const fecha = diaDeUrl(param);
  return fecha && esDiaFuturo(fecha, hoy) ? textoDisponible(fecha, hoy) : '';
}

/** Solo los días que vienen, con alguna parada, del más cercano al más lejano. */
export function soloFuturos(dias: DiaData[], hoy = new Date()): DiaData[] {
  return dias
    .filter((d) => esDiaFuturo(d.fecha, hoy) && d.total > 0)
    .sort((a, b) => fechaDe(a.fecha)!.getTime() - fechaDe(b.fecha)!.getTime());
}

export interface OpcionDia {
  fecha: string;
  etiqueta: string;
  total: number;
  esHoy: boolean;
}

/**
 * Las pestañas: Hoy siempre, más los días que vienen con paradas. Sin
 * días que vengan, ninguna: el selector no se muestra y Hoy queda como era.
 */
export function diasDelSelector(totalHoy: number, dias: DiaData[], hoy = new Date()): OpcionDia[] {
  const futuros = soloFuturos(dias, hoy);
  if (!futuros.length) return [];
  return [
    { fecha: textoFecha(hoy), etiqueta: 'Hoy', total: totalHoy, esHoy: true },
    ...futuros.map((d) => ({ fecha: d.fecha, etiqueta: etiquetaDia(d.fecha, hoy), total: d.total, esHoy: false })),
  ];
}

// ── Copia en el celular ───────────────────────────

interface CopiaProximas {
  correo: string;
  guardadoEn: number;
  dias: DiaData[];
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function correoActual(): string {
  return String(getUsuario()?.correo || '').trim().toLowerCase();
}

/** Lo guardado del CAP conectado (de otro CAP no se usa), o null. */
function leerCopia(): CopiaProximas | null {
  try {
    const crudo = storage()?.getItem(CLAVE);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as CopiaProximas;
    return c.correo === correoActual() && Array.isArray(c.dias) ? c : null;
  } catch {
    return null;
  }
}

function escribirCopia(dias: DiaData[], ahora = Date.now()) {
  try {
    const c: CopiaProximas = { correo: correoActual(), guardadoEn: ahora, dias };
    storage()?.setItem(CLAVE, JSON.stringify(c));
  } catch {
    /* sin espacio: solo se pierde verlas sin señal */
  }
}

/** Al cerrar sesión: son del CAP que se va. */
export function borrarRutasProximas() {
  try {
    storage()?.removeItem(CLAVE);
  } catch {
    /* ignorar */
  }
}

/** Los días que vienen, de la copia del celular, sin pedir nada. */
export function rutasProximasEnCopia(hoy = new Date()): DiaData[] {
  return soloFuturos(leerCopia()?.dias || [], hoy);
}

/**
 * La ruta de hoy que se guardó como "próxima" (ayer o el viernes). La usa
 * getRutaDeHoy cuando no hay señal ni copia de hoy.
 */
export function rutaDeHoyGuardada(hoy = new Date()): DiaData | null {
  const c = leerCopia();
  return c?.dias.find((d) => d.fecha === textoFecha(hoy)) || null;
}

export interface RespuestaProximas {
  dias: DiaData[];
  /** Viene de la copia porque el backend no respondió. */
  deCache: boolean;
}

/**
 * Las rutas de los próximos días: del backend, guardándolas, o de la
 * copia si no responde. Nunca falla: sin nada, una lista vacía (y el
 * selector no aparece). Un backend anterior a esta acción responde
 * "Acción no reconocida": también lista vacía.
 */
export async function getRutasProximas(hoy = new Date()): Promise<RespuestaProximas> {
  // Sin redirigir al login: va por detrás de la ruta de hoy, que ya lo hace.
  const r = await api<{ dias: DiaData[] }>('getAsignacionesProximas', {}, { msLimite: MS_LIMITE_CARGA, redirigirSiVence: false }).catch(
    () => ({ ok: false as const, reintentable: true }),
  );
  if (r.ok && r.data && Array.isArray(r.data.dias)) {
    escribirCopia(r.data.dias);
    return { dias: soloFuturos(r.data.dias, hoy), deCache: false };
  }
  return { dias: rutasProximasEnCopia(hoy), deCache: true };
}
