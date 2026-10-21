// ══════════════════════════════════════════════════
//  Utilidades de la ruta del día
//
//  Todo lo que el backend ya manda y la app no usaba:
//  hora, hora_fin, estado, meet_link e indicaciones.
//  Vive aparte de la página para poder reusarlo en
//  Buscar (Fase 3) e Historial (Fase 6).
// ══════════════════════════════════════════════════

import { tituloBonito } from './texto.ts';

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

/**
 * Lo mínimo para saber dónde está un local y cómo escribirlo.
 *
 * Lo cumplen `Parada`, `Autocompletado` y `LocalCompleto`, así que las
 * tres pantallas —Hoy, Buscar y el registro— usan las mismas funciones
 * sin castings.
 */
export interface Ubicable {
  comercio?: string;
  mall_puerta?: string;
  direccion?: string;
  distrito?: string;
}

/** Momento en que está una parada. Los cuatro valores son excluyentes. */
export type EstadoTemporal = 'flexible' | 'programada' | 'en-curso' | 'atrasada';

/** Minutos antes de la hora a partir de los cuales se destaca "Unirse". */
export const MINUTOS_ANTES_DESTACAR = 10;

/** Cuánto dura una parada cuando la hoja no trae hora_fin. */
export const MINUTOS_DURACION_POR_DEFECTO = 60;

/** Margen después del fin antes de dar una parada por perdida. */
export const MINUTOS_TOLERANCIA = 60;

/** Margen para llegar a una parada sin hora de fin antes de marcarla atrasada. */
export const MINUTOS_MARGEN_LLEGADA = 15;

// ── Horas ─────────────────────────────────────────

/**
 * "HH:mm" → minutos desde medianoche. Devuelve null si no hay hora.
 * Compara por número y no por texto, para que "9:00" no quede
 * después de "10:00" cuando la hoja no trae el cero delante.
 */
export function horaAMinutos(hora: string | undefined): number | null {
  // Sin anclar al inicio: la hoja a veces trae basura alrededor, como "15:00'".
  const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * La hora lista para mostrar, siempre como HH:mm.
 *
 * La celda puede venir con caracteres de más —un caso real fue "15:00'",
 * que se pintaba tal cual— o sin el cero delante. Devuelve cadena vacía
 * si no hay nada reconocible, para no mostrar basura.
 */
export function horaNormalizada(hora: string | undefined): string {
  const min = horaAMinutos(hora);
  if (min === null) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True si la parada no tiene hora fija. */
export function esHoraFlexible(p: Parada): boolean {
  return p.estado === 'flexible' || horaAMinutos(p.hora) === null;
}

/** Minutos transcurridos desde medianoche. */
export function minutosDelDia(ahora = new Date()): number {
  return ahora.getHours() * 60 + ahora.getMinutes();
}

/** Minutos que faltan para la hora de la parada. Negativo si ya pasó. */
export function minutosHasta(hora: string | undefined, ahora = new Date()): number | null {
  const destino = horaAMinutos(hora);
  if (destino === null) return null;
  return destino - minutosDelDia(ahora);
}

/**
 * Minuto del día en que termina la parada: hora_fin si viene, y si no
 * una hora después del inicio. Un hora_fin anterior o igual al inicio es
 * un dato malo de la hoja y se ignora.
 */
export function finEnMinutos(p: Parada): number | null {
  const inicio = horaAMinutos(p.hora);
  if (inicio === null) return null;
  const fin = horaAMinutos(p.hora_fin);
  return fin !== null && fin > inicio ? fin : inicio + MINUTOS_DURACION_POR_DEFECTO;
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
  const inicio = horaNormalizada(p.hora);
  const fin = horaNormalizada(p.hora_fin);
  if (p.estado === 'rango' && fin) return `${inicio} – ${fin}`;
  return inicio;
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

/** True si la parada es una capacitación virtual. */
export function esVirtual(p: Parada): boolean {
  return p.motivo === MOTIVO_VIRTUAL;
}

/** True si es una capacitación virtual con enlace utilizable. */
export function tieneMeet(p: Parada): boolean {
  return esVirtual(p) && !!enlaceMeet(p);
}

/**
 * True solo DENTRO de la ventana de la reunión: desde 10 minutos antes
 * de la hora hasta que termina.
 *
 * Antes solo se miraba "faltan 10 minutos o menos", sin límite inferior,
 * así que una reunión de las 09:00 seguía destacada a las 11:25.
 */
export function meetEsUrgente(p: Parada, ahora = new Date()): boolean {
  const inicio = horaAMinutos(p.hora);
  const fin = finEnMinutos(p);
  if (inicio === null || fin === null) return false;
  const t = minutosDelDia(ahora);
  return t >= inicio - MINUTOS_ANTES_DESTACAR && t <= fin;
}

/**
 * Google Maps por texto. No hay coordenadas en el catálogo, así que se
 * busca por mall + marca (centros comerciales) o por dirección + distrito
 * (puerta calle). Por eso tampoco se muestra distancia en km.
 */
export function enlaceMapa(p: Ubicable): string {
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
export function esCentroComercial(p: Ubicable): boolean {
  const mall = String(p.mall_puerta || '').trim();
  return !!mall && !/^puerta\s*calle$/i.test(mall);
}

/**
 * Línea de ubicación que distingue de verdad una parada de otra:
 * "Jockey Plaza · Surco" o "Av. Benavides 730 · Miraflores".
 */
export function ubicacionDe(p: Ubicable): string {
  const partes = esCentroComercial(p)
    ? [p.mall_puerta, p.distrito]
    : [p.direccion, p.distrito];
  // La hoja los guarda en mayúsculas; acá solo se arregla cómo se ven.
  const texto = partes.map(tituloBonito).filter(Boolean).join(' · ');
  return texto || tituloBonito(p.mall_puerta) || 'Sin ubicación';
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

/**
 * Una parada ya no vale la pena: se salta al elegir "Siguiente visita".
 *
 * - Hora flexible: nunca vence, se puede hacer en cualquier momento.
 * - Capacitación Virtual: vence cuando termina la reunión. Entrar a un
 *   Meet que ya acabó no sirve de nada.
 * - El resto: vence una hora después de su fin, que da margen para
 *   llegar tarde pero evita proponer algo de la mañana a media tarde.
 */
export function estaVencida(p: Parada, ahora = new Date()): boolean {
  const fin = finEnMinutos(p);
  if (fin === null) return false;
  const t = minutosDelDia(ahora);
  return p.motivo === MOTIVO_VIRTUAL ? t > fin : t > fin + MINUTOS_TOLERANCIA;
}

/**
 * Una parada tiene ventana real cuando se sabe hasta cuándo dura: las
 * capacitaciones virtuales (la reunión ocupa un rato) y cualquiera que
 * traiga un hora_fin posterior al inicio.
 */
export function tieneVentanaReal(p: Parada): boolean {
  const inicio = horaAMinutos(p.hora);
  if (inicio === null) return false;
  const fin = horaAMinutos(p.hora_fin);
  return esVirtual(p) || (fin !== null && fin > inicio);
}

/**
 * En qué momento de su vida está una parada. Un único valor en vez de
 * varios booleanos sueltos: así es imposible que diga "en curso" y
 * "atrasada" a la vez, que era justo el error.
 *
 *   CON ventana real          hora            fin
 *                              │               │
 *      ────── programada ──────┼── en-curso ───┼── atrasada ──►
 *
 *   SIN ventana real          hora       hora + 15 min
 *                              │              │
 *      ────── programada ──────┴──────────────┼── atrasada ──►
 *                                      margen para llegar
 */
export function estadoTemporal(p: Parada, ahora = new Date()): EstadoTemporal {
  if (esHoraFlexible(p)) return 'flexible';

  const inicio = horaAMinutos(p.hora);
  if (inicio === null) return 'flexible';

  // Lo ya hecho no se atrasa ni sigue en curso: muestra su hora y punto.
  if (estaCompletada(p)) return 'programada';

  const t = minutosDelDia(ahora);
  if (t < inicio) return 'programada';

  if (tieneVentanaReal(p)) {
    return t <= (finEnMinutos(p) as number) ? 'en-curso' : 'atrasada';
  }
  return t <= inicio + MINUTOS_MARGEN_LLEGADA ? 'programada' : 'atrasada';
}

/**
 * Texto de la hora según el estado.
 *
 * El rango solo se muestra cuando hora_fin es un dato real de la hoja.
 * En una virtual sin hora_fin el final lo calcula el código, y enseñarlo
 * sería presentar una suposición nuestra como si fuera un dato.
 */
export function textoEstado(p: Parada, ahora = new Date()): string {
  const estado = estadoTemporal(p, ahora);
  if (estado === 'en-curso') {
    const fin = horaAMinutos(p.hora_fin);
    const inicio = horaAMinutos(p.hora);
    const rango =
      fin !== null && inicio !== null && fin > inicio
        ? `${horaNormalizada(p.hora)}–${horaNormalizada(p.hora_fin)}`
        : horaNormalizada(p.hora);
    return `En curso · ${rango}`;
  }
  if (estado === 'atrasada') return `Atrasada · ${horaNormalizada(p.hora)}`;
  return etiquetaHora(p);
}

/**
 * Primera parada pendiente que todavía se puede hacer. Si todas las
 * pendientes vencieron, devuelve la primera de ellas: habiendo trabajo
 * por hacer, la tarjeta nunca se queda vacía.
 */
export function siguienteParada(ruta: Parada[], ahora = new Date()): Parada | null {
  const pendientes = ruta.filter((p) => !estaCompletada(p));
  if (!pendientes.length) return null;
  return pendientes.find((p) => !estaVencida(p, ahora)) || pendientes[0];
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
