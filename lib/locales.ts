// ══════════════════════════════════════════════════
//  Locales del catálogo
//
//  Es lo que devuelven las acciones `buscarComercio` y
//  `getAutocompletado`: los datos fijos del catálogo más
//  los de la última visita registrada.
// ══════════════════════════════════════════════════

export interface LocalCompleto {
  // Del catálogo
  id_local: string;
  tipo: string; // 'PC' | 'CC'
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  kam: string;
  psi: string;
  puntos_bbva: string;

  // De la última visita
  procesador_pos: string;
  codigo_openpay: string;
  codigo_niubiz: string;
  codigo_izipay: string;
  codigo_culqi?: string;
  beneficios: string;
  material_pop: string;
  contacto_nombre: string;
  contacto_cel: string;
  ultima_visita: string;
  ultimo_status: string;
  ultima_observacion: string;
  ultimo_cap: string;
  ultimo_motivo: string;

  [k: string]: unknown;
}

/** A partir de cuántos días sin visita se avisa en la lista. */
export const DIAS_SIN_VISITA_AVISO = 30;

/**
 * Días transcurridos desde una fecha del backend ("dd/MM/yyyy HH:mm").
 * Devuelve null si no hay fecha o no se entiende.
 */
export function diasDesde(fecha: string | undefined, ahora = new Date()): number | null {
  const m = String(fecha || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  const visita = new Date(anio, mes - 1, dia);
  if (
    visita.getFullYear() !== anio ||
    visita.getMonth() !== mes - 1 ||
    visita.getDate() !== dia
  ) {
    return null; // fecha imposible, como 31/02
  }

  // Comparamos días completos, sin que la hora mueva el resultado.
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.floor((hoy.getTime() - visita.getTime()) / 86_400_000);
}

export type AvisoVisita =
  | { tipo: 'nunca' }
  | { tipo: 'hace-mucho'; dias: number }
  | { tipo: 'reciente'; dias: number };

/**
 * Qué decir sobre la última visita de un local: nunca, hace más de 30
 * días (un aviso) o reciente (de 0 a 30 días).
 */
export function avisoUltimaVisita(
  local: Pick<LocalCompleto, 'ultima_visita'>,
  ahora = new Date(),
): AvisoVisita {
  const dias = diasDesde(local.ultima_visita, ahora);
  if (dias === null) return { tipo: 'nunca' };
  if (dias > DIAS_SIN_VISITA_AVISO) return { tipo: 'hace-mucho', dias };
  return { tipo: 'reciente', dias };
}

/** True si la última visita del local terminó en incidencia. */
export function ultimaFueIncidencia(
  local: Pick<LocalCompleto, 'ultimo_status'>,
): boolean {
  return /incidencia/i.test(String(local.ultimo_status || ''));
}

/** "hoy", "ayer" o "hace N días", para la tarjeta de última visita. */
export function textoAntiguedad(dias: number | null): string {
  if (dias === null) return '';
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

export interface EtiquetaVisita {
  texto: string;
  /** 'ok' solo para "Visitado hoy": es lo que evita repetir la visita. */
  tono: 'ok' | 'neutro';
  /** El reloj de "Sin visita hace N días". */
  reloj: boolean;
}

/**
 * La etiqueta de visita de un local en el buscador: siempre una.
 *
 * `encoladaEn` es la hora de una visita a este local que sigue en el
 * celular sin enviar: el backend todavía no la tiene, pero cuenta.
 */
export function etiquetaVisita(
  local: Pick<LocalCompleto, 'ultima_visita'>,
  ahora = new Date(),
  { encoladaEn }: { encoladaEn?: number } = {},
): EtiquetaVisita {
  const delBackend = diasDesde(local.ultima_visita, ahora);
  let dias = delBackend;
  if (encoladaEn) {
    const e = new Date(encoladaEn);
    const enCola = diasDesde(
      `${e.getDate()}/${e.getMonth() + 1}/${e.getFullYear()}`,
      ahora,
    );
    if (enCola !== null && (dias === null || enCola < dias)) dias = enCola;
  }

  if (dias === null) return { texto: 'Nunca visitado', tono: 'neutro', reloj: false };
  if (dias > DIAS_SIN_VISITA_AVISO) {
    return { texto: `Sin visita hace ${dias} días`, tono: 'neutro', reloj: true };
  }
  return {
    texto: `Visitado ${textoAntiguedad(dias)}`,
    tono: dias <= 0 ? 'ok' : 'neutro',
    reloj: false,
  };
}

/** True si el local es de centro comercial. */
export function esLocalCC(local: Pick<LocalCompleto, 'tipo' | 'mall_puerta'>): boolean {
  if (String(local.tipo || '').toUpperCase() === 'CC') return true;
  const mall = String(local.mall_puerta || '').trim();
  return !!mall && !/^puerta\s*calle$/i.test(mall);
}

/**
 * Lo que se copia al tocar "Copiar": la dirección, o el mall cuando es
 * centro comercial, porque esos locales no traen dirección en el catálogo.
 */
export function textoParaCopiar(local: LocalCompleto): string {
  const partes = esLocalCC(local)
    ? [local.mall_puerta, local.distrito]
    : [local.direccion, local.distrito];
  return partes
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ');
}
