// ══════════════════════════════════════════════════
//  Instalar la app en la pantalla de inicio
//
//  El aviso sale SOLO en el login y una sola vez por
//  celular: la marca va en localStorage (sessionStorage se
//  borra al cerrar la pestaña y el aviso volvería a salir).
//  Para quien lo cerró y luego quiere instalar, Perfil tiene
//  "Instalar app".
//
//  Chrome da el evento beforeinstallprompt una vez por carga,
//  en la pantalla en que esté el CAP: se guarda aquí desde
//  que arranca la app para poder usarlo después en Perfil.
//  iPhone no tiene ese evento: ahí solo hay instrucciones.
// ══════════════════════════════════════════════════

export type Plataforma = 'ios' | 'android' | 'otro';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const CLAVE_AVISO = 'rw_aviso_instalar';

/** Avisa a las pantallas de que cambió lo que se puede hacer. */
export const EVENTO_INSTALACION = 'rw-instalacion';

/** Solo pantalla donde sale el aviso solo. */
export const RUTA_AVISO = '/login';

/**
 * En iPhone todos los navegadores (Safari, Chrome, Firefox) usan el mismo
 * motor y se instalan igual: desde Compartir.
 */
export function plataformaDe(userAgent: string): Plataforma {
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  return 'otro';
}

export function instruccionesDe(p: Plataforma): string {
  if (p === 'ios') return 'Toca Compartir (el cuadro con la flecha ↑) y luego "Agregar a inicio".';
  if (p === 'android') {
    return 'Toca el menú ⋮ del navegador y luego "Instalar app" o "Agregar a pantalla de inicio".';
  }
  return 'Busca "Instalar" en el menú del navegador o junto a la barra de direcciones.';
}

interface Ventana {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { standalone?: boolean };
}

/** Abierta desde el ícono de la pantalla de inicio. */
export function estaInstalada(
  w: Ventana | undefined = typeof window !== 'undefined' ? (window as unknown as Ventana) : undefined,
): boolean {
  if (!w) return false;
  try {
    if (w.matchMedia?.('(display-mode: standalone)').matches) return true;
  } catch {
    /* navegador sin matchMedia */
  }
  return w.navigator?.standalone === true;
}

export function debeMostrarAviso({
  ruta,
  yaSalio,
  instalada,
  plataforma,
  hayEvento,
}: {
  ruta: string | null;
  yaSalio: boolean;
  instalada: boolean;
  plataforma: Plataforma;
  hayEvento: boolean;
}): boolean {
  if (ruta !== RUTA_AVISO || yaSalio || instalada) return false;
  // Sin el evento solo vale la pena en iPhone, donde hay instrucciones
  // claras. En Android el evento suele llegar; si no, se espera al
  // siguiente login en vez de gastar la única vez en un texto genérico.
  return plataforma === 'ios' || hayEvento;
}

type Almacen = Pick<Storage, 'getItem' | 'setItem'>;

function local(): Almacen | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function avisoYaSalio(almacen: Almacen | null = local()): boolean {
  try {
    return almacen?.getItem(CLAVE_AVISO) === '1';
  } catch {
    return false;
  }
}

/** Para siempre: no se vuelve a mostrar solo. */
export function marcarAvisoVisto(almacen: Almacen | null = local()) {
  try {
    almacen?.setItem(CLAVE_AVISO, '1');
  } catch {
    /* sin almacenamiento: como mucho saldrá otra vez en el próximo login */
  }
}

// ── Eventos del navegador ─────────────────────────

let evento: BeforeInstallPromptEvent | null = null;
let escuchando = false;

function avisar() {
  window.dispatchEvent(new Event(EVENTO_INSTALACION));
}

/** Se llama una vez al arrancar la app, en cualquier pantalla. */
export function escucharInstalacion() {
  if (escuchando || typeof window === 'undefined') return;
  escuchando = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin esto Chrome enseña su propia barrita; el aviso es el nuestro.
    e.preventDefault();
    evento = e as BeforeInstallPromptEvent;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    evento = null;
    marcarAvisoVisto();
    avisar();
  });
}

export function hayEventoInstalar(): boolean {
  return !!evento;
}

/**
 * Abre el diálogo de instalar del navegador si se puede. Si no (iPhone,
 * o Chrome todavía no lo ofreció), toca enseñar las instrucciones.
 */
export async function instalar(): Promise<'instalada' | 'cancelada' | 'instrucciones'> {
  if (!evento) return 'instrucciones';
  const e = evento;
  // El evento solo se puede usar una vez.
  evento = null;
  avisar();
  await e.prompt();
  const { outcome } = await e.userChoice;
  marcarAvisoVisto();
  return outcome === 'accepted' ? 'instalada' : 'cancelada';
}
