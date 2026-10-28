// ══════════════════════════════════════════════════
//  Mapa de la ruta del día: lógica sin Leaflet
//
//  El backend manda lat, lng (números) y geo_estado en
//  cada parada que tiene coordenadas; las demás no traen
//  esos campos y van a una lista aparte.
//
//  La ubicación del CAP solo se usa aquí, en el celular:
//  nada de esto la envía a ningún servidor.
// ══════════════════════════════════════════════════

import {
  ordenarRuta,
  estaCompletada,
  estaPendienteDeEnvio,
  esCentroComercial,
  enlaceMapa,
  etiquetaHora,
  type Parada,
} from './ruta.ts';
import { tituloBonito } from './texto.ts';
import { etiquetasPsiPuntos } from './locales.ts';
import { normalizarStatus, type Status } from './visita.ts';

export interface Coordenadas {
  lat: number;
  lng: number;
}

/** Centro de Lima, para cuando no hay ningún punto que enseñar. */
export const CENTRO_LIMA: Coordenadas = { lat: -12.0464, lng: -77.0428 };

/** Zoom con un solo punto: se ve la manzana y las calles de al lado. */
export const ZOOM_UN_PUNTO = 16;

/**
 * Las coordenadas de una parada, o null si no tiene. Acepta número o
 * texto; descarta lo vacío, el 0 (una celda vacía convertida) y lo que
 * está fuera de rango.
 */
export function coordenadasDe(p: { [k: string]: unknown }): Coordenadas | null {
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 || lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** 'OK' | 'Aproximado' | 'Manual' | '' tal como viene del backend. */
export function geoEstadoDe(p: Parada): string {
  return String(p.geo_estado || '').trim();
}

export interface ParadaEnMapa {
  parada: Parada;
  /** Su número en la ruta del día, el mismo orden que Hoy. */
  numero: number;
  coordenadas: Coordenadas | null;
}

/** Las paradas con y sin ubicación, en el orden de la ruta. */
export function separarParadas(paradas: Parada[]): {
  conUbicacion: ParadaEnMapa[];
  sinUbicacion: ParadaEnMapa[];
} {
  const todas = ordenarRuta(paradas).map((parada, i) => ({
    parada,
    numero: i + 1,
    coordenadas: coordenadasDe(parada),
  }));
  return {
    conUbicacion: todas.filter((p) => p.coordenadas),
    sinUbicacion: todas.filter((p) => !p.coordenadas),
  };
}

// ── Distancia ─────────────────────────────────────

const RADIO_TIERRA_M = 6_371_000;

/** Distancia en línea recta, en metros (fórmula de haversine). */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "80 m", "350 m", "1.2 km", "12.4 km": metros hasta 1 km y luego km con un decimal. */
export function textoMetros(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '';
  // Se redondea antes de elegir: 999 m serían "1000 m".
  const redondeo = Math.round(metros / 10) * 10;
  if (redondeo < 1000) return `${Math.max(10, redondeo)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

/** "a 80 m", "a 350 m", "a 1.2 km", "a 12.4 km". */
export function textoDistancia(metros: number): string {
  const t = textoMetros(metros);
  return t ? `a ${t}` : '';
}

// ── Encuadre ──────────────────────────────────────

export type Encuadre =
  | { tipo: 'limites'; limites: [[number, number], [number, number]] }
  | { tipo: 'centro'; centro: Coordenadas; zoom: number };

/**
 * Más lejos que esto de su parada más cercana, el CAP no entra en el
 * encuadre: el mapa se alejaría tanto que no se verían las paradas.
 */
export const MAX_M_CAP_EN_ENCUADRE = 3000;

/**
 * Qué enseñar al abrir: todos los puntos, y la ubicación del CAP si está
 * cerca de alguno. Con un solo punto, centrado y cerca; sin ninguno,
 * el CAP, o null (el mapa va a Lima).
 */
export function encuadre(puntos: Coordenadas[], ubicacion?: Coordenadas | null): Encuadre | null {
  const capCerca =
    !!ubicacion &&
    (!puntos.length || Math.min(...puntos.map((p) => distanciaMetros(ubicacion, p))) <= MAX_M_CAP_EN_ENCUADRE);
  const todos = capCerca ? [...puntos, ubicacion!] : [...puntos];
  if (!todos.length) return null;
  if (todos.length === 1) return { tipo: 'centro', centro: todos[0], zoom: ZOOM_UN_PUNTO };
  const lats = todos.map((p) => p.lat);
  const lngs = todos.map((p) => p.lng);
  return {
    tipo: 'limites',
    limites: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
  };
}

// ── Agrupar las cercanas ──────────────────────────

/** Radio en pantalla bajo el que dos paradas se juntan: el de un dedo. */
export const RADIO_GRUPO_PX = 40;
/** Hasta esta distancia entre todas, están en el mismo sitio (un mall). */
export const MAX_M_MISMO_LUGAR = 30;

/** Píxeles en el mundo a ese zoom: la proyección Web Mercator de Leaflet. */
export function aPixeles(c: Coordenadas, zoom: number): { x: number; y: number } {
  const escala = 256 * 2 ** zoom;
  const sen = Math.sin((c.lat * Math.PI) / 180);
  return {
    x: ((c.lng + 180) / 360) * escala,
    y: (0.5 - Math.log((1 + sen) / (1 - sen)) / (4 * Math.PI)) * escala,
  };
}

export interface GrupoEnMapa {
  /** En el orden de la ruta. */
  paradas: ParadaEnMapa[];
  /** El promedio de sus puntos. */
  centro: Coordenadas;
  /** Todas a pocos metros: acercar no las separa, se listan. */
  mismoLugar: boolean;
}

/**
 * Junta las paradas que a ese zoom quedarían una encima de otra. Recorre
 * en el orden de la ruta y cada una entra al primer grupo cuyo primer
 * punto esté a menos de `radioPx`. Un grupo de una es un marcador normal.
 * Solo las que tienen coordenadas.
 */
export function agruparParadas(
  puntos: ParadaEnMapa[],
  zoom: number,
  radioPx = RADIO_GRUPO_PX,
): GrupoEnMapa[] {
  const grupos: { ancla: { x: number; y: number }; paradas: ParadaEnMapa[] }[] = [];
  for (const p of puntos) {
    if (!p.coordenadas) continue;
    const px = aPixeles(p.coordenadas, zoom);
    const grupo = grupos.find((g) => Math.hypot(g.ancla.x - px.x, g.ancla.y - px.y) < radioPx);
    if (grupo) grupo.paradas.push(p);
    else grupos.push({ ancla: px, paradas: [p] });
  }
  return grupos.map(({ paradas }) => {
    const cs = paradas.map((p) => p.coordenadas!);
    const centro = {
      lat: cs.reduce((s, c) => s + c.lat, 0) / cs.length,
      lng: cs.reduce((s, c) => s + c.lng, 0) / cs.length,
    };
    const mismoLugar =
      cs.length > 1 && cs.every((a) => cs.every((b) => distanciaMetros(a, b) <= MAX_M_MISMO_LUGAR));
    return { paradas, centro, mismoLugar };
  });
}

// ── Marcadores ────────────────────────────────────

const COLOR_MOTIVO: Record<string, string> = {
  Visita: 'var(--color-motivo-visita)',
  Branding: 'var(--color-motivo-branding)',
  'Capacitación Presencial': 'var(--color-motivo-presencial)',
  'Capacitación Virtual': 'var(--color-motivo-virtual)',
};

const COLOR_STATUS: Record<Status, string> = {
  'Todo Ok': 'var(--color-ok)',
  Incidencia: 'var(--color-err)',
  Reprogramar: 'var(--color-warn)',
  'No existe': 'var(--color-gris)',
};

export interface EstiloMarcador {
  numero: number;
  /** Variable CSS del color: así sale bien en claro y en oscuro. */
  color: string;
  hecha: boolean;
  /** Hecha, pero la visita sigue en el celular. */
  pendienteEnvio: boolean;
}

/** Pendiente: color de su motivo. Hecha: color de su resultado, atenuada. */
export function estiloMarcador({ parada, numero }: ParadaEnMapa): EstiloMarcador {
  const hecha = estaCompletada(parada);
  const resultado = hecha ? normalizarStatus(parada.resultado) : null;
  return {
    numero,
    color: resultado
      ? COLOR_STATUS[resultado]
      : hecha
        ? 'var(--color-ok)'
        : COLOR_MOTIVO[parada.motivo] || 'var(--color-ink-2)',
    hecha,
    pendienteEnvio: estaPendienteDeEnvio(parada),
  };
}

// ── La hoja de detalle ────────────────────────────

/** Lo que trae getAutocompletado de un local (la copia del día). */
export interface DatosLocal {
  kam?: string;
  beneficios?: string;
  psi?: string;
  puntos_bbva?: string;
  [k: string]: unknown;
}

export interface InfoHoja {
  titulo: string;
  motivo: string;
  kam: string;
  beneficios: string;
  direccion: string;
  /** Solo si es un centro comercial. */
  mall: string;
  hora: string;
  /** El backend la ubicó por aproximación: puede no ser exacta. */
  aproximado: boolean;
  /** "a 350 m", si se sabe dónde está el CAP. */
  distancia: string;
  idLocal: string;
  idAsignacion: string;
  hecha: boolean;
  /** "PSI 6" y "Puntos BBVA · No", del catálogo; vacíos hasta que llega el local. */
  psi: string;
  puntos: string;
}

export function infoHoja(
  parada: Parada,
  local?: DatosLocal | null,
  ubicacion?: Coordenadas | null,
): InfoHoja {
  const coordenadas = coordenadasDe(parada);
  const centroComercial = esCentroComercial(parada);
  return {
    titulo: parada.comercio || 'Sin comercio',
    motivo: parada.motivo || '',
    // Primero lo de la asignación; la copia del local trae los beneficios
    // de la última visita, que en un local nuevo vienen vacíos.
    kam: tituloBonito(String(parada.kam || local?.kam || '').trim()),
    beneficios: String(parada.beneficios || local?.beneficios || '').trim(),
    direccion: [tituloBonito(parada.direccion), tituloBonito(parada.distrito)].filter(Boolean).join(' · '),
    mall: centroComercial ? tituloBonito(parada.mall_puerta) : '',
    hora: etiquetaHora(parada),
    aproximado: geoEstadoDe(parada).toLowerCase() === 'aproximado',
    distancia: ubicacion && coordenadas ? textoDistancia(distanciaMetros(ubicacion, coordenadas)) : '',
    idLocal: parada.id_local || '',
    idAsignacion: parada.id_asignacion || '',
    hecha: estaCompletada(parada),
    ...(local ? etiquetasPsiPuntos(local) : { psi: '', puntos: '' }),
  };
}

/**
 * "Cómo llegar": con coordenadas buenas (OK o Manual), Google Maps hacia
 * ese punto exacto. Si son aproximadas o no hay, la búsqueda por
 * dirección de siempre, que en ese caso suele acertar más.
 */
export function enlaceComoLlegar(p: Parada): string {
  const c = coordenadasDe(p);
  const estado = geoEstadoDe(p).toLowerCase();
  if (c && (estado === 'ok' || estado === 'manual')) {
    return `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`;
  }
  return enlaceMapa(p);
}
