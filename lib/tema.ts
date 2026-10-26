// ══════════════════════════════════════════════════
//  Tema claro / oscuro
//
//  Por defecto sigue al sistema. La elección de Perfil se
//  guarda en el celular (localStorage) y manda sobre él.
//
//  Para que no haya un destello blanco al abrir, el tema se
//  pone ANTES de pintar: SCRIPT_TEMA va en un <script> del
//  <head> (app/layout.tsx) y deja `data-theme` en <html>.
//  Los colores están en app/globals.css como variables, y
//  [data-theme='dark'] las redefine.
// ══════════════════════════════════════════════════

export type Preferencia = 'sistema' | 'claro' | 'oscuro';
export type Tema = 'light' | 'dark';

export const PREFERENCIAS: Preferencia[] = ['sistema', 'claro', 'oscuro'];
export const CLAVE_TEMA = 'rw_tema';

/** Avisa a la app de que el CAP cambió la apariencia. */
export const EVENTO_TEMA = 'rw-tema';

/**
 * Color de la barra del navegador y del sistema. En claro, el morado de
 * marca; en oscuro, el fondo, para que la barra no corte la pantalla.
 */
export const COLOR_BARRA: Record<Tema, string> = {
  light: '#3D35C8',
  dark: '#000000',
};

export function esPreferencia(v: unknown): v is Preferencia {
  return typeof v === 'string' && (PREFERENCIAS as string[]).includes(v);
}

export function resolverTema(pref: Preferencia, sistemaOscuro: boolean): Tema {
  if (pref === 'oscuro') return 'dark';
  if (pref === 'claro') return 'light';
  return sistemaOscuro ? 'dark' : 'light';
}

/**
 * Corre en el <head>, antes de que exista React. Es una copia mínima de
 * resolverTema y aplicarTema: si cambias una, cambia la otra (las
 * pruebas lo comprueban). Nada de lo que haga puede romper la carga.
 */
export const SCRIPT_TEMA = `(function(){try{
var p='sistema';try{p=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)})||'sistema';}catch(e){}
var o=p==='oscuro'||(p!=='claro'&&!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches));
var t=o?'dark':'light',d=document.documentElement;
d.setAttribute('data-theme',t);d.style.colorScheme=t;
var m=document.querySelector('meta[name="theme-color"]');
if(m)m.setAttribute('content',o?${JSON.stringify(COLOR_BARRA.dark)}:${JSON.stringify(COLOR_BARRA.light)});
}catch(e){}})();`;

// ── Navegador ─────────────────────────────────────

export function leerPreferencia(): Preferencia {
  try {
    const v = window.localStorage.getItem(CLAVE_TEMA);
    return esPreferencia(v) ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

function sistemaOscuro(): boolean {
  try {
    return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Pone el tema en <html> y en la barra del celular. */
export function aplicarTema(pref: Preferencia = leerPreferencia()): Tema {
  const tema = resolverTema(pref, sistemaOscuro());
  const raiz = document.documentElement;
  raiz.setAttribute('data-theme', tema);
  raiz.style.colorScheme = tema;
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute('content', COLOR_BARRA[tema]));
  return tema;
}

/** La elección de Perfil: se guarda, se aplica y se avisa. */
export function cambiarPreferencia(pref: Preferencia) {
  try {
    if (pref === 'sistema') window.localStorage.removeItem(CLAVE_TEMA);
    else window.localStorage.setItem(CLAVE_TEMA, pref);
  } catch {
    /* sin almacenamiento: se aplica igual hasta cerrar */
  }
  aplicarTema(pref);
  window.dispatchEvent(new Event(EVENTO_TEMA));
}
