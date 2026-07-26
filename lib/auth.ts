// ══════════════════════════════════════════════════
//  Sesión local (token + usuario)
// ══════════════════════════════════════════════════

export interface Usuario {
  nombre: string;
  correo: string;
  rol: string;
}

const KEY_TOKEN = 'rw_token';
const KEY_USER = 'rw_user';

export function saveSession(token: string, usuario: Usuario) {
  localStorage.setItem(KEY_TOKEN, token);
  localStorage.setItem(KEY_USER, JSON.stringify(usuario));
}

export function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(KEY_TOKEN) || '';
}

export function getUsuario(): Usuario | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? (JSON.parse(raw) as Usuario) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_USER);
}

export function isLoggedIn(): boolean {
  return getToken() !== '';
}
