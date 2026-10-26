// ══════════════════════════════════════════════════
//  Utilidades de texto
//
//  La hoja guarda los nombres en mayúsculas y con formatos
//  heredados. Acá se arregla solo la presentación: la hoja
//  nunca se modifica.
// ══════════════════════════════════════════════════

/** Partículas que van en minúscula salvo al inicio. */
const PARTICULAS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al',
]);

/**
 * Siglas con puntos: C.C., P.C., S.A.C.
 * Exige al menos una letra DESPUÉS de un punto, para no confundirlas con
 * abreviaturas de una sola palabra como "AV.", que sí se capitaliza.
 */
const SIGLA_CON_PUNTOS = /^[A-ZÁÉÍÓÚÑ]+\.(?:[A-ZÁÉÍÓÚÑ]+\.?)+$/i;

/** Números romanos: II, IV, XII. */
const ROMANO = /^(?=[IVXLC])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;

function capitalizar(palabra: string): string {
  return palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase();
}

function arreglarToken(token: string, esPrimero: boolean): string {
  if (!token) return token;
  // Siglas, romanos y cualquier cosa con dígitos se dejan como vinieron.
  if (SIGLA_CON_PUNTOS.test(token) || ROMANO.test(token) || /\d/.test(token)) {
    return token;
  }
  const minuscula = token.toLowerCase();
  if (!esPrimero && PARTICULAS.has(minuscula)) return minuscula;
  return capitalizar(token);
}

/**
 * Pasa un texto en mayúsculas a mayúscula inicial por palabra:
 * "C.C. PLAZA SAN MIGUEL" → "C.C. Plaza San Miguel".
 *
 * Si el texto NO viene todo en mayúsculas se devuelve intacto, para no
 * estropear lo que alguien ya escribió bien ("Jockey Plaza").
 */
export function tituloBonito(texto: string | undefined): string {
  const original = String(texto || '').trim();
  if (!original) return '';
  if (original !== original.toUpperCase()) return original;

  let primero = true;
  return original.replace(/[^\s/-]+/g, (token) => {
    const resultado = arreglarToken(token, primero);
    // Las partículas no cuentan como inicio del siguiente tramo.
    primero = false;
    return resultado;
  });
}

// ══════════════════════════════════════════════════
//  Resaltado de coincidencias
// ══════════════════════════════════════════════════

export interface Trozo {
  texto: string;
  coincide: boolean;
}

/** Minúsculas y sin tildes, para comparar como lo hace el backend. */
function plano(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Parte un texto en trozos marcando los que coinciden con la consulta.
 *
 * Compara sin tildes ni mayúsculas, pero recorta del texto original para
 * no deformar lo que se muestra. Cada palabra de la consulta se busca por
 * separado, igual que hace la búsqueda del backend con "gmo surco".
 *
 * Se pinta con <mark>, nunca inyectando HTML.
 */
export function partirPorCoincidencia(
  texto: string | undefined,
  consulta: string | undefined,
): Trozo[] {
  const original = String(texto || '');
  if (!original) return [];

  const palabras = plano(String(consulta || ''))
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  if (!palabras.length) return [{ texto: original, coincide: false }];

  // `plano` no cambia la longitud: conserva una letra por letra.
  const base = plano(original);
  const marcado = new Array<boolean>(original.length).fill(false);

  for (const palabra of palabras) {
    let desde = 0;
    for (;;) {
      const i = base.indexOf(palabra, desde);
      if (i === -1) break;
      for (let j = i; j < i + palabra.length && j < marcado.length; j++) {
        marcado[j] = true;
      }
      desde = i + palabra.length;
    }
  }

  const trozos: Trozo[] = [];
  let inicio = 0;
  for (let i = 1; i <= original.length; i++) {
    if (i === original.length || marcado[i] !== marcado[inicio]) {
      trozos.push({
        texto: original.slice(inicio, i),
        coincide: marcado[inicio],
      });
      inicio = i;
    }
  }
  return trozos;
}

// ══════════════════════════════════════════════════
//  Teléfonos
// ══════════════════════════════════════════════════

/**
 * Celular listo para wa.me: solo dígitos y con el 51 de Perú delante.
 * Devuelve cadena vacía si no hay un celular válido de 9 dígitos que
 * empiece por 9, para poder ocultar el botón en vez de abrir un chat roto.
 */
export function telefonoWhatsApp(celular: string | undefined): string {
  const digitos = String(celular || '').replace(/\D/g, '');
  if (!digitos) return '';

  const sinPais = digitos.startsWith('51') ? digitos.slice(2) : digitos;
  if (!/^9\d{8}$/.test(sinPais)) return '';
  return '51' + sinPais;
}

/** El mismo número, en formato legible: "987 654 321". */
export function telefonoLegible(celular: string | undefined): string {
  const normalizado = telefonoWhatsApp(celular);
  if (!normalizado) return String(celular || '').trim();
  const n = normalizado.slice(2);
  return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

// ══════════════════════════════════════════════════
//  Horas de actualización
// ══════════════════════════════════════════════════

/** "08:12" a partir de milisegundos epoch, en la hora del celular. */
export function horaDe(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * "hace un momento", "hace 5 min", "hace 2 h" — para decir cuándo se
 * actualizó la ruta. Vacío si nunca.
 */
export function haceCuanto(ms: number, ahora = Date.now()): string {
  if (!ms) return '';
  const minutos = Math.floor(Math.max(0, ahora - ms) / 60_000);
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}
