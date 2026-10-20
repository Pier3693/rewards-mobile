// ══════════════════════════════════════════════════
//  Utilidades de la ruta del día
//
//  Todo lo que el backend ya manda y la app no usaba:
//  hora, hora_fin, estado, meet_link e indicaciones.
//  Vive aparte de la página para poder reusarlo en
//  Buscar (Fase 3) e Historial (Fase 6).
// ══════════════════════════════════════════════════

export interface Parada {
  id_asignacion: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  motivo: string;
  /** Status de la ASIGNACIÓN: Pendiente | Completado | Cancelada */
  status: string;
  /** Resultado de la VISITA: Todo Ok | Incidencia | Reprogramar | No existe.
   *  Llega solo si la hoja `asignaciones` tiene la columna `resultado`. */
  resultado?: string;
  indicaciones: string;
  hora: string;
  hora_fin: string;
  /** 'flexible' | 'rango' | vacío (hora exacta) */
  estado: string;
  meet_link: string;
  id_local: string;
  [k: string]: string | undefined;
}

export const MOTIVO_VIRTUAL = 'Capacitación Virtual';

/** Minutos antes de la reunión a partir de los cuales se destaca "Unirse". */
export const MINUTOS_MEET_URGENTE = 10;

// ── Horas ─────────────────────────────────────────

/**
 * "HH:mm" → minutos desde medianoche. Devuelve null si no hay hora.
 * Compara por número y no por texto, para que "9:00" no quede
 * después de "10:00" cuando la hoja no trae el cero delante.
 */
export function horaAMinutos(hora: string | undefined): number | null {
  const m = String(hora || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** True si la parada no tiene hora fija. */
export function esHoraFlexible(p: Parada): boolean {
  return p.estado === 'flexible' || horaAMinutos(p.hora) === null;
}

/** Minutos que faltan para la hora de la parada. Negativo si ya pasó. */
export function minutosHasta(hora: string | undefined, ahora = new Date()): number | null {
  const destino = horaAMinutos(hora);
  if (destino === null) return null;
  return destino - (ahora.getHours() * 60 + ahora.getMinutes());
}

/** "en 25 min" · "en 1 h 20 min" · "ahora" · "hace 15 min" */
export function textoEspera(minutos: number | null): string {
  if (minutos === null) return '';
  if (minutos <= 0 && minutos > -15) return 'ahora';
  if (minutos < 0) {
    const atraso = Math.abs(minutos);
    return atraso >= 60
      ? `hace ${Math.floor(atraso / 60)} h`
      : `hace ${atraso} min`;
  }
  if (minutos < 60) return `en ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m ? `en ${h} h ${m} min` : `en ${h} h`;
}

/** Etiqueta de hora para la lista: "09:00", "09:00 – 11:00" o "Hora flexible". */
export function etiquetaHora(p: Parada): string {
  if (esHoraFlexible(p)) return 'Hora flexible';
  if (p.estado === 'rango' && p.hora_fin) return `${p.hora} – ${p.hora_fin}`;
  return p.hora;
}

// ── Orden de la ruta ──────────────────────────────

/**
 * Primero las paradas con hora, de la más temprana a la más tarde.
 * Después las de hora flexible, en el orden en que vienen de la hoja.
 * El orden es estable: a igual hora, se respeta el original.
 */
export function ordenarRuta(paradas: Parada[]): Parada[] {
  return paradas
    .map((p, i) => ({ p, i, min: esHoraFlexible(p) ? null : horaAMinutos(p.hora) }))
    .sort((a, b) => {
      if (a.min === null && b.min === null) return a.i - b.i;
      if (a.min === null) return 1;
      if (b.min === null) return -1;
      return a.min - b.min || a.i - b.i;
    })
    .map((x) => x.p);
}

// ── Enlaces ───────────────────────────────────────

/**
 * Enlace de Meet de una parada.
 * Misma lógica que ya usa el correo de la ruta: columna propia y, en
 * rutas antiguas, el enlace escrito dentro de las indicaciones.
 * Si no trae protocolo, se le antepone https://.
 */
export function enlaceMeet(p: Parada): string {
  let meet = String(p.meet_link || '').trim();
  if (!meet && p.indicaciones) {
    const m = String(p.indicaciones).match(/https:\/\/meet\.google\.com\/[^\s|]+/);
    if (m) meet = m[0];
  }
  if (meet && meet.indexOf('http') !== 0) meet = 'https://' + meet;
  return meet;
}

/** True si es una capacitación virtual con enlace utilizable. */
export function tieneMeet(p: Parada): boolean {
  return p.motivo === MOTIVO_VIRTUAL && !!enlaceMeet(p);
}

/** True si la reunión ya empezó o empieza en menos de 10 minutos. */
export function meetEsUrgente(p: Parada, ahora = new Date()): boolean {
  const min = minutosHasta(p.hora, ahora);
  return min !== null && min <= MINUTOS_MEET_URGENTE;
}

/**
 * Google Maps por texto. No hay coordenadas en el catálogo, así que se
 * busca por mall + marca (centros comerciales) o por dirección + distrito
 * (puerta calle). Por eso tampoco se muestra distancia en km.
 */
export function enlaceMapa(p: Parada): string {
  const partes = esCentroComercial(p)
    ? [p.mall_puerta, p.comercio, p.distrito]
    : [p.direccion, p.distrito, 'Lima'];
  const query = partes.filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// ── Ubicación ─────────────────────────────────────

/**
 * El catálogo fija mall_puerta = "Puerta Calle" para los locales PC, así
 * que ese literal no identifica nada: hay que mirar la dirección.
 */
export function esCentroComercial(p: Parada): boolean {
  const mall = String(p.mall_puerta || '').trim();
  return !!mall && !/^puerta\s*calle$/i.test(mall);
}

/**
 * Línea de ubicación que distingue de verdad una parada de otra:
 * "Jockey Plaza · Surco" o "Av. Benavides 730 · Miraflores".
 */
export function ubicacionDe(p: Parada): string {
  const partes = esCentroComercial(p)
    ? [p.mall_puerta, p.distrito]
    : [p.direccion, p.distrito];
  const texto = partes.map((x) => String(x || '').trim()).filter(Boolean).join(' · ');
  return texto || String(p.mall_puerta || '').trim() || 'Sin ubicación';
}

// ── Indicaciones ──────────────────────────────────

/** Las indicaciones usan "|" como separador interno: se muestra lo de antes. */
export function indicacionesLimpias(p: Parada): string {
  return String(p.indicaciones || '').replace(/\|.*$/, '').trim();
}

// ── Estado de la parada ───────────────────────────

export function estaCompletada(p: Parada): boolean {
  return /completad/i.test(String(p.status || ''));
}

// ── Saludo y fecha ────────────────────────────────

export function saludoPorHora(ahora = new Date()): string {
  const h = ahora.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/**
 * "Martes, 20 de octubre": solo la inicial en mayúscula y sin año.
 * La clase CSS `capitalize` no sirve acá porque capitaliza cada palabra
 * ("Martes, 20 De Octubre").
 */
export function fechaLarga(ahora = new Date()): string {
  const texto = ahora.toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
