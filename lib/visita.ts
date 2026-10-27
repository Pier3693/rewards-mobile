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
  /** Puede faltar si el backend es anterior a Culqi. */
  codigo_culqi?: string;
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

/**
 * El status tal como lo escribe la app, o null si no es uno de los
 * cuatro. La hoja puede traerlo con otras mayúsculas o espacios.
 */
export function normalizarStatus(texto: string | null | undefined): Status | null {
  const t = String(texto || '').trim().toLowerCase();
  return STATUS_LISTA.find((s) => s.toLowerCase() === t) || null;
}

/**
 * Colores reservados para el resultado de la visita.
 *
 *  suave       chip del resumen
 *  fuerte      borde y fondo de la tarjeta seleccionada
 *  icono       cuadrado del ícono, visible desde el inicio
 *  iconoActivo el mismo cuadrado, en sólido, al seleccionar
 */
export const STATUS_CLS: Record<
  Status,
  { suave: string; fuerte: string; icono: string; iconoActivo: string }
> = {
  'Todo Ok': {
    suave: 'bg-ok-light text-ok',
    fuerte: 'border-ok bg-ok-light text-ok',
    icono: 'bg-ok-light text-ok',
    iconoActivo: 'bg-ok text-sobre-estado',
  },
  Incidencia: {
    suave: 'bg-err-light text-err',
    fuerte: 'border-err bg-err-light text-err',
    icono: 'bg-err-light text-err',
    iconoActivo: 'bg-err text-sobre-estado',
  },
  Reprogramar: {
    suave: 'bg-warn-light text-warn',
    fuerte: 'border-warn bg-warn-light text-warn',
    icono: 'bg-warn-light text-warn',
    iconoActivo: 'bg-warn text-sobre-estado',
  },
  'No existe': {
    suave: 'bg-gris-suave text-gris',
    fuerte: 'border-gris bg-gris-suave text-gris',
    icono: 'bg-gris-suave text-gris',
    iconoActivo: 'bg-gris text-sobre-estado',
  },
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

// ══════════════════════════════════════════════════
//  Validación
// ══════════════════════════════════════════════════

/**
 * Celular peruano: 9 dígitos que empiezan por 9.
 * El vacío es válido porque el celular no es obligatorio.
 */
export function celularEsValido(celular: string | undefined): boolean {
  const limpio = String(celular || '').replace(/\s|-/g, '');
  if (!limpio) return true;
  return /^9\d{8}$/.test(limpio);
}

/** El mensaje a mostrar bajo el campo, o vacío si está bien. */
export function errorCelular(celular: string | undefined): string {
  if (celularEsValido(celular)) return '';
  return 'Debe tener 9 dígitos y empezar con 9';
}

// ══════════════════════════════════════════════════
//  Tipo de incidencia
//
//  La hoja no tiene columna para esto, así que viaja como
//  prefijo de las observaciones.
// ══════════════════════════════════════════════════

export const TIPOS_INCIDENCIA = [
  'POS no aplica beneficio',
  'Falta material POP',
  'Personal no capacitado',
  'Local cerrado',
  'Otro',
];

/** "[POS no aplica beneficio] el texto del CAP" */
export function componerObservacion(
  tipo: string | undefined,
  texto: string | undefined,
): string {
  const limpio = String(texto || '').trim();
  const t = String(tipo || '').trim();
  if (!t) return limpio;
  return limpio ? `[${t}] ${limpio}` : `[${t}]`;
}

/**
 * Lo contrario: separa el prefijo del texto.
 *
 * Hace falta para rehidratar el borrador y, sobre todo, para que al
 * cambiar de tipo dos veces no quede "[Local cerrado] [POS no aplica
 * beneficio] texto". Solo reconoce los tipos de la lista: un corchete
 * que el CAP escribió a mano se respeta como texto suyo.
 */
export function separarObservacion(observacion: string | undefined): {
  tipo: string;
  texto: string;
} {
  const crudo = String(observacion || '').trim();
  const m = crudo.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
  if (!m) return { tipo: '', texto: crudo };

  const posible = m[1].trim();
  const conocido = TIPOS_INCIDENCIA.find(
    (t) => t.toLowerCase() === posible.toLowerCase(),
  );
  if (!conocido) return { tipo: '', texto: crudo };

  return { tipo: conocido, texto: m[2].trim() };
}

// ══════════════════════════════════════════════════
//  Borrador
//
//  Se guarda lo escrito, nunca las fotos: pesan demasiado
//  y llenarían la cuota de localStorage.
// ══════════════════════════════════════════════════

export interface Borrador {
  /** Identificador de ESTA visita. Ver nuevaIdVisita. */
  idVisita: string;
  paso: number;
  motivo: Motivo | null;
  status: Status | null;
  tipoIncidencia: string;
  contacto: string;
  celular: string;
  procesador: string;
  cod_openpay: string;
  cod_niubiz: string;
  cod_izipay: string;
  /** Falta en los borradores de antes de Culqi. */
  cod_culqi?: string;
  beneficios: string;
  material_pop: string;
  observacion: string;
  /** Milisegundos epoch del último guardado. */
  guardadoEn: number;
}

const PREFIJO_BORRADOR = 'rw_borrador_';

/** Un borrador más viejo que esto confunde más de lo que ayuda. */
export const HORAS_BORRADOR = 24;

export function claveBorrador(idLocal: string, idAsignacion?: string): string {
  return PREFIJO_BORRADOR + String(idLocal || '').toUpperCase() +
    (idAsignacion ? `_${idAsignacion}` : '');
}

/**
 * Identificador único de una visita, para que el backend reconozca un
 * reenvío y no cree una fila repetida.
 *
 * Se genera AL ABRIR el formulario, nunca al pulsar Guardar: si se
 * generara al guardar, cada reintento llevaría uno distinto y la
 * deduplicación no serviría de nada. Por eso también viaja en el
 * borrador, para sobrevivir a salir y volver.
 */
export function nuevaIdVisita(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* navegador viejo o contexto sin crypto */
  }
  // Respaldo: hora más azar. No necesita ser criptográfico, solo único
  // entre los envíos de un mismo CAP.
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ══════════════════════════════════════════════════
//  Qué hacer tras enviar
// ══════════════════════════════════════════════════

export type TrasEnvio =
  /** El backend la escribió. */
  | 'guardada'
  /** El backend reconoció el id_visita: ya estaba de un envío anterior. */
  | 'repetida'
  /** Se cortó por el camino: reenviar con el mismo id es seguro. */
  | 'reintentar'
  /** La sesión venció: la visita no se pierde, hay que volver a entrar. */
  | 'sesion'
  /** El backend la rechazó: reenviar lo mismo daría lo mismo. */
  | 'error';

/** Lo mínimo de `ApiResponse` que hace falta para decidir. */
export interface RespuestaEnvio {
  ok: boolean;
  data?: unknown;
  authError?: boolean;
  reintentable?: boolean;
}

/**
 * Traduce la respuesta de `registrarVisita` a lo que tiene que hacer la
 * pantalla. Separado para poder probarlo sin React.
 */
export function queHacerTrasEnvio(r: RespuestaEnvio): TrasEnvio {
  if (r.ok) {
    const repetida = !!(r.data as { repetida?: boolean } | undefined)?.repetida;
    return repetida ? 'repetida' : 'guardada';
  }
  if (r.authError) return 'sesion';
  if (r.reintentable) return 'reintentar';
  return 'error';
}

/** El momento en que el CAP tocó Guardar, atado a una visita. */
export interface MomentoGuardado {
  idVisita: string;
  /** Milisegundos epoch. Viaja como creado_en. */
  creadoEn: number;
}

/**
 * La hora real de la visita es la del PRIMER toque de Guardar. Un
 * reintento de la misma visita (mismo idVisita) conserva esa hora; una
 * visita nueva estrena la suya. Sin esto, una visita guardada sin señal
 * a las 13:47 quedaba en la hoja con la hora de envío.
 */
export function fijarCreadoEn(
  actual: MomentoGuardado | null,
  idVisita: string,
  ahora = Date.now(),
): MomentoGuardado {
  return actual && actual.idVisita === idVisita ? actual : { idVisita, creadoEn: ahora };
}

// ══════════════════════════════════════════════════
//  Lo que se envía a registrarVisita
//
//  Lo mismo va al envío inmediato y a la cola sin
//  conexión, que lo guarda y lo reenvía tal cual.
// ══════════════════════════════════════════════════

/** Lo que el CAP llenó en el formulario. */
export interface DatosVisita {
  procesador: string;
  cod_openpay: string;
  cod_niubiz: string;
  cod_izipay: string;
  cod_culqi: string;
  beneficios: string;
  material_pop: string;
  motivo: Motivo | null;
  contacto: string;
  celular: string;
  status: Status | null;
  /** Ya con el tipo de incidencia delante (componerObservacion). */
  observacion: string;
}

export function armarPeticionVisita(
  local: Pick<Autocompletado, 'id_local' | 'comercio' | 'mall_puerta' | 'direccion' | 'kam'>,
  datos: DatosVisita,
  envio: { fotosBase64: string[]; idAsignacion: string; idVisita: string; creadoEn: number },
) {
  return {
    id_local: local.id_local,
    comercio: local.comercio,
    mall_puerta: local.mall_puerta,
    direccion: local.direccion,
    kam: local.kam || '',
    procesador: datos.procesador,
    cod_openpay: datos.cod_openpay,
    cod_niubiz: datos.cod_niubiz,
    cod_izipay: datos.cod_izipay,
    cod_culqi: datos.cod_culqi,
    beneficios: datos.beneficios,
    material_pop: datos.material_pop,
    motivo: datos.motivo,
    contacto: datos.contacto,
    celular: datos.celular,
    status: datos.status,
    observacion: datos.observacion,
    fotosBase64: envio.fotosBase64,
    id_asignacion: envio.idAsignacion,
    id_visita: envio.idVisita,
    creado_en: envio.creadoEn,
  };
}

/**
 * "27/10/2026 15:26" en hora de Lima: el formato de `ultima_visita` en la
 * hoja, para que la copia del celular se lea igual que la del servidor.
 */
export function fechaHoja(ms: number): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Lima',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

/**
 * Lo que la visita recién guardada cambia en los datos del local, con los
 * nombres de `getAutocompletado`. Se escribe en la copia del celular para
 * que, al volver a abrir el local, aparezca aunque no haya señal.
 */
export function datosTrasVisita(
  peticion: ReturnType<typeof armarPeticionVisita>,
  cap = '',
): Partial<Autocompletado> {
  return {
    procesador_pos: peticion.procesador,
    codigo_openpay: peticion.cod_openpay,
    codigo_niubiz: peticion.cod_niubiz,
    codigo_izipay: peticion.cod_izipay,
    codigo_culqi: peticion.cod_culqi,
    beneficios: peticion.beneficios,
    material_pop: peticion.material_pop,
    contacto_nombre: peticion.contacto,
    contacto_cel: peticion.celular,
    ultima_visita: fechaHoja(peticion.creado_en),
    ultimo_status: peticion.status || '',
    ultima_observacion: peticion.observacion,
    ultimo_motivo: peticion.motivo || '',
    ...(cap ? { ultimo_cap: cap } : {}),
  };
}

/** True si el borrador tiene algo que valga la pena ofrecer. */
export function borradorTieneAlgo(b: Partial<Borrador> | null): boolean {
  if (!b) return false;
  // El idVisita no cuenta: un borrador que solo lo tiene está vacío.
  const campos = [
    b.motivo, b.status, b.tipoIncidencia, b.contacto, b.celular,
    b.procesador, b.cod_openpay, b.cod_niubiz, b.cod_izipay, b.cod_culqi,
    b.beneficios, b.material_pop, b.observacion,
  ];
  return campos.some((x) => String(x || '').trim());
}

export function guardarBorrador(clave: string, datos: Omit<Borrador, 'guardadoEn'>) {
  if (typeof window === 'undefined') return;
  try {
    const completo: Borrador = { ...datos, guardadoEn: Date.now() };
    window.localStorage.setItem(clave, JSON.stringify(completo));
  } catch {
    /* sin espacio o bloqueado: el registro sigue funcionando */
  }
}

/** Devuelve el borrador, o null si no hay o ya caducó. */
export function leerBorrador(clave: string, ahora = Date.now()): Borrador | null {
  if (typeof window === 'undefined') return null;
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    if (borradorCaducado(b, ahora)) {
      window.localStorage.removeItem(clave);
      return null;
    }
    return b;
  } catch {
    return null;
  }
}

export function borradorCaducado(
  b: Pick<Borrador, 'guardadoEn'> | null,
  ahora = Date.now(),
): boolean {
  if (!b || !b.guardadoEn) return true;
  return ahora - b.guardadoEn > HORAS_BORRADOR * 60 * 60 * 1000;
}

export function borrarBorrador(clave: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(clave);
  } catch {
    /* ignorar */
  }
}

// ══════════════════════════════════════════════════
//  Dictado por voz
// ══════════════════════════════════════════════════

/** True si el navegador soporta dictado; si no, el botón no se pinta. */
export function hayDictado(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}
