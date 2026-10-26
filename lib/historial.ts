// ══════════════════════════════════════════════════
//  Historial de visitas del CAP
//
//  Junta lo que dice el backend (getMisVisitas) con lo que
//  sigue en la cola del celular. Una visita que ya llegó
//  pero todavía está en la cola sale una sola vez: manda
//  el backend, y la cola se reconoce por su id_visita.
//
//  Las fechas llegan ya en hora de Lima como texto
//  'dd/MM/yyyy HH:mm': se comparan como días de calendario,
//  sin pasar por Date con zona horaria.
//
//  Como la ruta del día, queda una copia en el celular por
//  usuario para abrir sin señal.
// ══════════════════════════════════════════════════

import { api, MS_LIMITE_CARGA, type ApiResponse } from './api.ts';
import { getUsuario } from './auth.ts';
import type { VisitaEncolada } from './cola.ts';
import { normalizarStatus, type Status } from './visita.ts';

/** Lo que devuelve `getMisVisitas` por cada visita. */
export interface VisitaApi {
  id_visita: string;
  fecha: string;
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  motivo: string;
  status: string;
  observacion: string;
  fotos: string;
}

export interface VisitaHistorial extends VisitaApi {
  /** Sigue en la cola del celular, todavía no llegó al backend. */
  pendiente: boolean;
  /** Las fotos de una visita en cola: todavía no tienen enlace de Drive. */
  fotosBase64?: string[];
}

/** Cuántas visitas se piden: cubre de sobra una semana de trabajo. */
export const LIMITE_HISTORIAL = 100;

// ── Fechas ────────────────────────────────────────

export interface Dia {
  anio: number;
  mes: number;
  dia: number;
}

export interface Momento extends Dia {
  hora: string;
}

/** 'dd/MM/yyyy HH:mm' → partes, o null si no se entiende. */
export function parsearFecha(texto: string | undefined): Momento | null {
  const m = String(texto || '')
    .trim()
    .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  const [, d, mes, anio, h, min] = m;
  const r = { anio: Number(anio), mes: Number(mes), dia: Number(d) };
  if (r.mes < 1 || r.mes > 12 || r.dia < 1 || r.dia > 31) return null;
  return { ...r, hora: h ? `${h.padStart(2, '0')}:${min}` : '' };
}

/** Hoy en el reloj del celular. */
export function diaDeHoy(ahora = new Date()): Dia {
  return { anio: ahora.getFullYear(), mes: ahora.getMonth() + 1, dia: ahora.getDate() };
}

/** Días desde 1970: para restar fechas sin líos de horario de verano. */
function numeroDeDia(d: Dia): number {
  return Math.floor(Date.UTC(d.anio, d.mes - 1, d.dia) / 86_400_000);
}

/** 0 = domingo … 6 = sábado. */
function diaDeSemana(d: Dia): number {
  return new Date(Date.UTC(d.anio, d.mes - 1, d.dia)).getUTCDay();
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "Hoy", "Ayer", "Lun 19 oct", y con el año si no es el de hoy. */
export function tituloDeDia(d: Dia, hoy: Dia): string {
  const diferencia = numeroDeDia(hoy) - numeroDeDia(d);
  if (diferencia === 0) return 'Hoy';
  if (diferencia === 1) return 'Ayer';
  const base = `${DIAS[diaDeSemana(d)]} ${d.dia} ${MESES[d.mes - 1]}`;
  return d.anio === hoy.anio ? base : `${base} ${d.anio}`;
}

/** 'dd/MM/yyyy HH:mm' en el reloj del celular, como lo escribe el backend. */
export function fechaComoBackend(ms: number): string {
  const f = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)}/${f.getFullYear()} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

/** Para ordenar: 'yyyymmddHHMM'. Las fechas raras van al final. */
function claveOrden(v: VisitaApi): string {
  const m = parsearFecha(v.fecha);
  if (!m) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${m.anio}${p(m.mes)}${p(m.dia)}${m.hora.replace(':', '')}`;
}

export function ordenarRecientes<T extends VisitaApi>(visitas: T[]): T[] {
  return [...visitas].sort((a, b) => claveOrden(b).localeCompare(claveOrden(a)));
}

// ── Agrupar ───────────────────────────────────────

export interface GrupoDia<T extends VisitaApi = VisitaHistorial> {
  clave: string;
  titulo: string;
  visitas: T[];
}

/** Por día, de más reciente a más antiguo. */
export function agruparPorDia<T extends VisitaApi>(visitas: T[], hoy: Dia): GrupoDia<T>[] {
  const grupos = new Map<string, GrupoDia<T>>();
  for (const v of ordenarRecientes(visitas)) {
    const m = parsearFecha(v.fecha);
    const clave = m ? claveOrden(v).slice(0, 8) : 'sin-fecha';
    if (!grupos.has(clave)) {
      grupos.set(clave, { clave, titulo: m ? tituloDeDia(m, hoy) : 'Sin fecha', visitas: [] });
    }
    grupos.get(clave)!.visitas.push(v);
  }
  // ordenarRecientes ya deja las sin fecha al final.
  return [...grupos.values()];
}

// ── Unir con la cola ──────────────────────────────

function texto(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Una visita de la cola, con la forma del historial. */
export function deLaCola(e: VisitaEncolada): VisitaHistorial {
  const p = e.payload || {};
  const fotos = Array.isArray(p.fotosBase64)
    ? (p.fotosBase64 as unknown[]).filter((f): f is string => typeof f === 'string')
    : [];
  return {
    id_visita: e.idVisita,
    fecha: fechaComoBackend(e.creadoEn),
    id_local: e.resumen.idLocal || texto(p.id_local),
    comercio: e.resumen.comercio || texto(p.comercio),
    mall_puerta: texto(p.mall_puerta),
    direccion: texto(p.direccion),
    motivo: texto(p.motivo),
    status: e.resumen.status || texto(p.status),
    observacion: texto(p.observacion),
    fotos: '',
    pendiente: true,
    fotosBase64: fotos,
  };
}

export interface HistorialUnido {
  /** En la cola del celular, la más reciente primero. */
  pendientes: VisitaHistorial[];
  /** Las que ya están en el backend. */
  enviadas: VisitaHistorial[];
}

/**
 * Junta el backend y la cola sin repetir: si una visita de la cola ya
 * está en el historial con el mismo id_visita (llegó pero la cola aún no
 * se enteró), sale solo una vez, la del backend. Las del escritorio no
 * traen id y nunca se toman por repetidas.
 */
export function unirConCola(historial: VisitaApi[], cola: VisitaEncolada[]): HistorialUnido {
  const enBackend = new Set(historial.map((v) => String(v.id_visita || '').trim()).filter(Boolean));
  const pendientes = cola
    .filter((e) => !enBackend.has(String(e.idVisita || '').trim()))
    .sort((a, b) => b.creadoEn - a.creadoEn)
    .map(deLaCola);
  return {
    pendientes,
    enviadas: ordenarRecientes(historial).map((v) => ({ ...v, pendiente: false })),
  };
}

// ── Filtro y conteos ──────────────────────────────

export type FiltroStatus = Status | 'todas';

export function filtrarPorStatus<T extends VisitaApi>(visitas: T[], filtro: FiltroStatus): T[] {
  if (filtro === 'todas') return visitas;
  return visitas.filter((v) => normalizarStatus(v.status) === filtro);
}

export function contarPorStatus(visitas: VisitaApi[]): Record<FiltroStatus, number> {
  const c: Record<FiltroStatus, number> = {
    todas: visitas.length,
    'Todo Ok': 0,
    Incidencia: 0,
    Reprogramar: 0,
    'No existe': 0,
  };
  for (const v of visitas) {
    const s = normalizarStatus(v.status);
    if (s) c[s]++;
  }
  return c;
}

// ── Resumen ───────────────────────────────────────

export interface Resumen {
  hoy: number;
  semana: number;
}

/** Visitas de hoy y de esta semana (de lunes a hoy). Sin metas. */
export function resumen(visitas: VisitaApi[], hoy: Dia): Resumen {
  const nHoy = numeroDeDia(hoy);
  const lunes = nHoy - ((diaDeSemana(hoy) + 6) % 7);
  let deHoy = 0;
  let deLaSemana = 0;
  for (const v of visitas) {
    const m = parsearFecha(v.fecha);
    if (!m) continue;
    const n = numeroDeDia(m);
    if (n === nHoy) deHoy++;
    if (n >= lunes && n <= nHoy) deLaSemana++;
  }
  return { hoy: deHoy, semana: deLaSemana };
}

// ── Fotos ─────────────────────────────────────────

export interface Foto {
  url: string;
  /** Miniatura de Drive, o '' si no se pudo sacar el id. */
  miniatura: string;
}

/**
 * La columna "Fotos o videos": enlaces de Drive separados por coma, o
 * un texto como "2 foto(s) - no se pudieron subir".
 */
export function fotosDe(campo: string | undefined): { fotos: Foto[]; nota: string } {
  const partes = String(campo || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const fotos: Foto[] = [];
  const notas: string[] = [];
  for (const p of partes) {
    if (!/^https?:\/\//i.test(p)) {
      notas.push(p);
      continue;
    }
    const id = p.match(/\/d\/([\w-]+)/)?.[1] || p.match(/[?&]id=([\w-]+)/)?.[1] || '';
    fotos.push({
      url: p,
      miniatura: id ? `https://drive.google.com/thumbnail?id=${id}&sz=w240` : '',
    });
  }
  return { fotos, nota: notas.join(', ') };
}

// ── Copia en el celular ───────────────────────────

const CLAVE = 'rw_historial';

interface CopiaHistorial {
  correo: string;
  guardadoEn: number;
  data: VisitaApi[];
}

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

function leerCopia(): CopiaHistorial | null {
  try {
    const crudo = storage()?.getItem(CLAVE);
    if (!crudo) return null;
    const c = JSON.parse(crudo) as CopiaHistorial;
    // La de otro CAP en un celular compartido no se enseña.
    if (!c || c.correo !== correoActual() || !Array.isArray(c.data)) return null;
    return c;
  } catch {
    return null;
  }
}

function escribirCopia(data: VisitaApi[], cuando: number) {
  try {
    const c: CopiaHistorial = { correo: correoActual(), guardadoEn: cuando, data };
    storage()?.setItem(CLAVE, JSON.stringify(c));
  } catch {
    /* sin espacio: solo se pierde el modo sin señal */
  }
}

/** Al cerrar sesión. La cola no se toca. */
export function borrarCopiaHistorial() {
  enMemoria = null;
  try {
    storage()?.removeItem(CLAVE);
  } catch {
    /* ignorar */
  }
}

export interface RespuestaHistorial extends ApiResponse<VisitaApi[]> {
  /** Es la copia del celular porque el backend no respondió. */
  deCache?: boolean;
  guardadoEn?: number;
}

/** Lo último que se trajo, para que Perfil e Historial no pidan dos veces seguidas. */
let enMemoria: { r: RespuestaHistorial; en: number; correo: string } | null = null;
const MS_MEMORIA = 60_000;

/**
 * Las visitas del CAP: del backend si hay señal; si el fallo es de
 * camino, la copia del celular.
 * @param forzar pide al backend aunque haya algo reciente en memoria.
 */
export async function getMisVisitas(forzar = false): Promise<RespuestaHistorial> {
  const correo = correoActual();
  if (!forzar && enMemoria && enMemoria.correo === correo && Date.now() - enMemoria.en < MS_MEMORIA) {
    return enMemoria.r;
  }

  const r = await api<VisitaApi[]>(
    'getMisVisitas',
    { limite: LIMITE_HISTORIAL },
    { msLimite: MS_LIMITE_CARGA },
  );

  if (r.ok && Array.isArray(r.data)) {
    const ahora = Date.now();
    escribirCopia(r.data, ahora);
    const fresca: RespuestaHistorial = { ok: true, data: r.data };
    enMemoria = { r: fresca, en: ahora, correo };
    return fresca;
  }

  // Solo se tapa con la copia un fallo de camino: un error del backend
  // o una sesión vencida tienen que verse.
  const copia = r.reintentable ? leerCopia() : null;
  if (copia) return { ok: true, data: copia.data, deCache: true, guardadoEn: copia.guardadoEn };
  return r;
}

/** Lo guardado en el celular, sin pedir nada. */
export function historialEnCopia(): { data: VisitaApi[]; guardadoEn: number } | null {
  const c = leerCopia();
  return c ? { data: c.data, guardadoEn: c.guardadoEn } : null;
}
