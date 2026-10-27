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

/** "a 80 m", "a 350 m", "a 1.2 km", "a 12 km". */
export function textoDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '';
  if (metros < 1000) return `a ${Math.max(10, Math.round(metros / 10) * 10)} m`;
  if (metros < 10_000) return `a ${(metros / 1000).toFixed(1)} km`;
  return `a ${Math.round(metros / 1000)} km`;
}

// ── Encuadre ──────────────────────────────────────

export type Encuadre =
  | { tipo: 'limites'; limites: [[number, number], [number, number]] }
  | { tipo: 'centro'; centro: Coordenadas; zoom: number };

/**
 * Qué enseñar al abrir: todos los puntos y la ubicación del CAP. Con un
 * solo punto, centrado y cerca; sin ninguno, null (el mapa va a Lima).
 */
export function encuadre(puntos: Coordenadas[], ubicacion?: Coordenadas | null): Encuadre | null {
  const todos = ubicacion ? [...puntos, ubicacion] : [...puntos];
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
