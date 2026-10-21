// ══════════════════════════════════════════════════
//  Registro de visita
//
//  Tipos, constantes y lógica pura del formulario.
//  Sin JSX a propósito: los íconos los pone cada pantalla,
//  así esto se puede probar con `npm test`.
// ══════════════════════════════════════════════════

export type Motivo =
  | 'Visita'
  | 'Branding'
  | 'Capacitación Presencial'
  | 'Capacitación Virtual';

export type Status = 'Todo Ok' | 'Incidencia' | 'Reprogramar' | 'No existe';

/** Local del catálogo, tal como lo usa el formulario. */
export interface Local {
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  kam: string;
  ultimo_status?: string;
  [k: string]: unknown;
}

/** Lo que devuelve `getAutocompletado` y precarga el paso 2. */
export interface Autocompletado {
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  kam: string;
  procesador_pos: string;
  codigo_openpay: string;
  codigo_niubiz: string;
  codigo_izipay: string;
  beneficios: string;
  material_pop: string;
  contacto_nombre: string;
  contacto_cel: string;
  ultima_visita: string;
  ultimo_status: string;
  ultima_observacion: string;
  [k: string]: unknown;
}

/** `tipo` es el filtro de catálogo que acepta `buscarComercio`. */
export const MOTIVOS: {
  valor: Motivo;
  label: string;
  tipo: 'pc' | 'cc' | 'todos';
}[] = [
  { valor: 'Visita', label: 'Visita', tipo: 'pc' },
  { valor: 'Branding', label: 'Branding', tipo: 'cc' },
  { valor: 'Capacitación Presencial', label: 'Cap. presencial', tipo: 'todos' },
  { valor: 'Capacitación Virtual', label: 'Cap. virtual', tipo: 'todos' },
];

export const STATUS_LISTA: Status[] = [
  'Todo Ok',
  'Incidencia',
  'Reprogramar',
  'No existe',
];

/** Colores reservados para el resultado de la visita. */
export const STATUS_CLS: Record<Status, { suave: string; fuerte: string }> = {
  'Todo Ok': { suave: 'bg-ok-light text-ok', fuerte: 'border-ok bg-ok-light text-ok' },
  Incidencia: { suave: 'bg-err-light text-err', fuerte: 'border-err bg-err-light text-err' },
  Reprogramar: { suave: 'bg-warn-light text-warn', fuerte: 'border-warn bg-warn-light text-warn' },
  'No existe': { suave: 'bg-gris-light text-ink-2', fuerte: 'border-ink-2 bg-gris-light text-ink-2' },
};

/** Clases por motivo, con la paleta única que nunca pisa a un resultado. */
export const MOTIVO_CLS: Record<Motivo, string> = {
  Visita: 'bg-motivo-visita-light text-motivo-visita',
  Branding: 'bg-motivo-branding-light text-motivo-branding',
  'Capacitación Presencial':
    'bg-motivo-presencial-light text-motivo-presencial',
  'Capacitación Virtual': 'bg-motivo-virtual-light text-motivo-virtual',
};

/** Máximo que acepta el backend por visita. */
export const MAX_FOTOS = 4;
