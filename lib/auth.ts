// ══════════════════════════════════════════════════
//  Sesión local (token + usuario)
//
//  Dos modos, según la casilla "Mantener sesión iniciada":
//   - marcada   → localStorage   (sobrevive al cerrar la app)
//   - desmarcada → sessionStorage (muere al cerrar la pestaña)
//
//  Las lecturas miran sessionStorage primero: si hay una
//  sesión temporal abierta, esa manda sobre una persistente
//  anterior.
//
//  Todo acceso va dentro de try/catch porque en modo privado
//  el navegador lanza excepción al tocar storage.
// ══════════════════════════════════════════════════

export interface Usuario {
  nombre: string;
  correo: string;
  rol: string;
}

const KEY_TOKEN = 'rw_token';
const KEY_USER = 'rw_user';
const KEY_EXP = 'rw_exp';
/** Último usuario escrito, para precargar el login. Nunca la contraseña. */
const KEY_ULTIMO_USUARIO = 'rw_ultimo_usuario';
/** Marca de que la sesión venció, para avisarlo en el login una sola vez. */
const KEY_EXPIRADA = 'rw_sesion_expirada';

const CLAVES_SESION = [KEY_TOKEN, KEY_USER, KEY_EXP];

// ── Acceso seguro a storage ───────────────────────

function almacenes(): Storage[] {
  if (typeof window === 'undefined') return [];
  const lista: Storage[] = [];
  // sessionStorage primero: una sesión temporal gana sobre una persistente.
  try {
    lista.push(window.sessionStorage);
  } catch {
    /* bloqueado por el navegador */
  }
  try {
    lista.push(window.localStorage);
  } catch {
    /* bloqueado por el navegador */
  }
  return lista;
}

function leer(clave: string): string {
  for (const almacen of almacenes()) {
    try {
      const valor = almacen.getItem(clave);
      if (valor) return valor;
    } catch {
      /* seguimos con el siguiente */
    }
  }
  return '';
}

function escribir(almacen: Storage | null, clave: string, valor: string) {
  if (!almacen) return;
  try {
    almacen.setItem(clave, valor);
  } catch {
    /* sin espacio o bloqueado: la app sigue funcionando en memoria */
  }
}

function borrarEnTodos(clave: string) {
  for (const almacen of almacenes()) {
    try {
      almacen.removeItem(clave);
    } catch {
      /* ignorar */
    }
  }
}

function almacenPara(persistente: boolean): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return persistente ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

// ── Vencimiento del token ─────────────────────────

/**
 * Lee el `exp` del token sin verificar la firma.
 *
 * El token es `base64(payload).hmac`. Decodificarlo en el cliente sirve
 * solo para mandar al login antes de gastar una llamada que el backend
 * va a rechazar igual: la autoridad sigue siendo _auth_ en Apps Script,
 * que además revalida al usuario contra la hoja en cada petición.
 *
 * @return milisegundos epoch, o 0 si no se pudo leer.
 */
function expDelToken(token: string): number {
  try {
    const payloadB64 = token.split('.')[0];
    if (!payloadB64) return 0;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: number }).exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    return 0;
  }
}

// ── API pública ───────────────────────────────────

export function saveSession(
  token: string,
  usuario: Usuario,
  persistente = true,
) {
  // Limpiamos el almacén contrario para no dejar una sesión huérfana.
  CLAVES_SESION.forEach(borrarEnTodos);

  const almacen = almacenPara(persistente);
  escribir(almacen, KEY_TOKEN, token);
  escribir(almacen, KEY_USER, JSON.stringify(usuario));

  const exp = expDelToken(token);
  if (exp) escribir(almacen, KEY_EXP, String(exp));

  limpiarAvisoExpiracion();
}

export function getToken(): string {
  return leer(KEY_TOKEN);
}

export function getUsuario(): Usuario | null {
  const raw = leer(KEY_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Usuario;
  } catch {
    return null;
  }
}

export function clearSession() {
  CLAVES_SESION.forEach(borrarEnTodos);
}

/** Milisegundos que faltan para que venza el token, o null si no se sabe. */
export function msParaExpirar(): number | null {
  const exp = Number(leer(KEY_EXP));
  if (!exp) return null;
  return exp - Date.now();
}

export function isLoggedIn(): boolean {
  if (!getToken()) return false;

  // Si sabemos que ya venció, no hacemos esperar al usuario una llamada
  // que el backend va a rechazar.
  const restante = msParaExpirar();
  if (restante !== null && restante <= 0) {
    marcarSesionExpirada();
    clearSession();
    return false;
  }
  return true;
}

// ── Último usuario escrito ────────────────────────

export function recordarUsuario(usuario: string) {
  escribir(almacenPara(true), KEY_ULTIMO_USUARIO, usuario);
}

export function getUltimoUsuario(): string {
  return leer(KEY_ULTIMO_USUARIO);
}

// ── Aviso de sesión expirada ──────────────────────

export function marcarSesionExpirada() {
  escribir(almacenPara(true), KEY_EXPIRADA, '1');
}

/** Devuelve true una sola vez: al consultarlo, se borra la marca. */
export function consumirAvisoExpiracion(): boolean {
  const habia = leer(KEY_EXPIRADA) === '1';
  if (habia) limpiarAvisoExpiracion();
  return habia;
}

function limpiarAvisoExpiracion() {
  borrarEnTodos(KEY_EXPIRADA);
}
