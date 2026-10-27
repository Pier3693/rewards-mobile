// ══════════════════════════════════════════════════
//  Paso 2 · Datos del local: procesadores, beneficios
//  y material POP como opciones para marcar.
//
//  En la hoja siguen siendo texto separado por comas
//  ("Niubiz, Culqi"), igual que antes. Aquí se lee ese
//  texto, también los formatos viejos ("6 PSI", "NI"),
//  y se vuelve a escribir. Lo que no se reconoce no se
//  pierde: los procesadores quedan como opción extra y
//  los beneficios van a "Otro".
// ══════════════════════════════════════════════════

/** Minúsculas, sin tildes y sin espacios de más. */
export function normalizar(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Solo letras y números: "Izi Pay." y "izipay" son lo mismo. */
function compacto(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]/g, '');
}

function sinRepetir(lista: string[]): string[] {
  return lista.filter((x, i) => lista.indexOf(x) === i);
}

// ── Procesadores ──────────────────────────────────

export type Procesador = 'Openpay' | 'Niubiz' | 'Izipay' | 'Culqi';
export type CampoCodigo = 'cod_openpay' | 'cod_niubiz' | 'cod_izipay' | 'cod_culqi';
export type Codigos = Record<CampoCodigo, string>;

export const PROCESADORES: {
  valor: Procesador;
  campo: CampoCodigo;
  etiqueta: string;
  /** Cómo puede venir escrito, ya en compacto(). */
  alias: string[];
}[] = [
  { valor: 'Openpay', campo: 'cod_openpay', etiqueta: 'Código OPENPAY', alias: ['openpay', 'op'] },
  // Visanet es el nombre que tenía Niubiz.
  { valor: 'Niubiz', campo: 'cod_niubiz', etiqueta: 'Código NIUBIZ', alias: ['niubiz', 'ni', 'visanet'] },
  { valor: 'Izipay', campo: 'cod_izipay', etiqueta: 'Código IZIPAY', alias: ['izipay', 'iz', 'izi'] },
  { valor: 'Culqi', campo: 'cod_culqi', etiqueta: 'Código CULQI', alias: ['culqi'] },
];

export const CODIGOS_VACIOS: Codigos = { cod_openpay: '', cod_niubiz: '', cod_izipay: '', cod_culqi: '' };

export interface SeleccionProcesadores {
  /** Los de PROCESADORES por su nombre; los extra, tal como venían. */
  marcados: string[];
  /** Los que venían escritos y no son de la lista: se ofrecen igual. */
  extras: string[];
  codigos: Codigos;
}

export const SIN_PROCESADORES: SeleccionProcesadores = { marcados: [], extras: [], codigos: CODIGOS_VACIOS };

function procesadorDe(texto: string): Procesador | null {
  const c = compacto(texto);
  return PROCESADORES.find((p) => p.alias.includes(c))?.valor || null;
}

/**
 * Lee el texto del procesador ("NI, izipay", "Niubiz/Culqi") y los
 * códigos. Un código con valor marca su procesador aunque el texto no lo
 * nombre.
 */
export function leerProcesadores(texto: string, codigos: Partial<Codigos> = {}): SeleccionProcesadores {
  const cods: Codigos = { ...CODIGOS_VACIOS };
  for (const p of PROCESADORES) cods[p.campo] = String(codigos[p.campo] || '').trim();

  const marcados: string[] = [];
  const extras: string[] = [];
  for (const trozo of String(texto || '').split(/\s*[,;/+\n]\s*|\s+y\s+/i)) {
    const t = trozo.trim();
    if (!t) continue;
    const conocido = procesadorDe(t);
    if (conocido) marcados.push(conocido);
    else if (!extras.some((e) => normalizar(e) === normalizar(t))) {
      extras.push(t);
      marcados.push(t);
    }
  }
  for (const p of PROCESADORES) if (cods[p.campo]) marcados.push(p.valor);

  return { marcados: sinRepetir(marcados), extras, codigos: cods };
}

/** "Niubiz, Culqi": en el orden de la lista y los extra al final. */
export function procesadoresATexto(sel: Pick<SeleccionProcesadores, 'marcados'>): string {
  const conocidos = PROCESADORES.map((p) => p.valor).filter((v) => sel.marcados.includes(v));
  const otros = sel.marcados.filter((m) => !PROCESADORES.some((p) => p.valor === m));
  return [...conocidos, ...otros].join(', ');
}

/** Marca o desmarca. Al desmarcar, su código se borra. */
export function alternarProcesador(sel: SeleccionProcesadores, valor: string): SeleccionProcesadores {
  if (!sel.marcados.includes(valor)) return { ...sel, marcados: [...sel.marcados, valor] };
  const campo = PROCESADORES.find((p) => p.valor === valor)?.campo;
  return {
    ...sel,
    marcados: sel.marcados.filter((m) => m !== valor),
    codigos: campo ? { ...sel.codigos, [campo]: '' } : sel.codigos,
  };
}

export function hayProcesadores(sel: SeleccionProcesadores): boolean {
  return sel.marcados.length > 0;
}

// ── Beneficios ────────────────────────────────────

export const PLAZOS_PSI = [3, 6, 9, 12, 15, 18, 24, 36];

export const BENEFICIOS: string[] = [
  ...PLAZOS_PSI.map((n) => `PSI ${n}`),
  'PUNTOS BBVA',
  'Promo Cuenta Sueldo',
  'Promo regular',
];

export interface SeleccionBeneficios {
  marcados: string[];
  /** "Otro" marcado: se muestra el campo de texto. */
  otro: boolean;
  textoOtro: string;
}

export const SIN_BENEFICIOS: SeleccionBeneficios = { marcados: [], otro: false, textoOtro: '' };

function beneficioDe(texto: string): string | null {
  const c = compacto(texto);
  // "6 PSI", "psi6", "PSI 6": solo los plazos de la lista.
  const psi = c.match(/^psi(\d+)$/) || c.match(/^(\d+)psi$/);
  if (psi) return PLAZOS_PSI.includes(Number(psi[1])) ? `PSI ${Number(psi[1])}` : null;
  return BENEFICIOS.find((b) => compacto(b) === c) || null;
}

/**
 * Lee "6 PSI, Puntos BBVA, 2x1 jueves". Lo que no es de la lista va a
 * Otro, unido con comas, para no perderlo al volver a guardar.
 */
export function leerBeneficios(texto: string): SeleccionBeneficios {
  const marcados: string[] = [];
  const otros: string[] = [];
  // Solo comas y punto y coma: "2x1 jueves y viernes" es un solo texto.
  for (const trozo of String(texto || '').split(/\s*[,;\n]\s*/)) {
    const t = trozo.trim();
    if (!t) continue;
    const conocido = beneficioDe(t);
    if (conocido) marcados.push(conocido);
    else otros.push(t);
  }
  const textoOtro = sinRepetir(otros).join(', ');
  return { marcados: sinRepetir(marcados), otro: !!textoOtro, textoOtro };
}

/** "PSI 6, PUNTOS BBVA, 2x1 jueves": la lista en orden y Otro al final. */
export function beneficiosATexto(sel: SeleccionBeneficios): string {
  const elegidos = BENEFICIOS.filter((b) => sel.marcados.includes(b));
  const otro = sel.otro ? sel.textoOtro.trim() : '';
  return [...elegidos, ...(otro ? [otro] : [])].join(', ');
}

export function alternarBeneficio(sel: SeleccionBeneficios, valor: string): SeleccionBeneficios {
  return sel.marcados.includes(valor)
    ? { ...sel, marcados: sel.marcados.filter((m) => m !== valor) }
    : { ...sel, marcados: [...sel.marcados, valor] };
}

export function hayBeneficios(sel: SeleccionBeneficios): boolean {
  return beneficiosATexto(sel) !== '';
}

// ── Material POP ──────────────────────────────────

export type MaterialPop = '' | 'Permite' | 'No permite';
export const MATERIAL_POP: Exclude<MaterialPop, ''>[] = ['Permite', 'No permite'];

/** Lo que no sea un sí o un no (el viejo "Afiche, stopper…") queda sin elegir. */
export function leerMaterialPop(texto: string): MaterialPop {
  const n = normalizar(texto);
  if (['permite', 'si', 'si permite'].includes(n)) return 'Permite';
  if (['no permite', 'no'].includes(n)) return 'No permite';
  return '';
}
