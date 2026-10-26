// ══════════════════════════════════════════════════
//  Perfil: textos y decisiones, sin React
// ══════════════════════════════════════════════════

/** Los roles del backend (Seguridad.gs), como los lee el CAP. */
const ROLES: Record<string, string> = {
  CAP: 'Capacitador de campo',
  KAM: 'Key Account Manager',
  ADMIN: 'Administrador',
};

export function rolLegible(rol: string | undefined): string {
  const r = String(rol || '').trim();
  return ROLES[r.toUpperCase()] || r;
}

/**
 * Lo que se le dice al CAP antes de cerrar sesión con visitas en la
 * cola, o null si no hay ninguna y puede salir sin preguntar.
 *
 * Así funciona la cola: cada visita queda a nombre de su CAP y solo se
 * envía cuando ESE CAP vuelve a entrar en este celular. No se pierde,
 * pero tampoco sale sola mientras no vuelva.
 */
export function textoCierreSesion(pendientes: number): { titulo: string; detalle: string } | null {
  if (pendientes <= 0) return null;
  const visitas = pendientes === 1 ? '1 visita' : `${pendientes} visitas`;
  return {
    titulo: `Tienes ${visitas} sin enviar`,
    detalle:
      `${pendientes === 1 ? 'Queda guardada' : 'Quedan guardadas'} en este celular y se ` +
      `${pendientes === 1 ? 'enviará' : 'enviarán'} cuando vuelvas a entrar con tu usuario. ` +
      'Si entra otra persona, no se enviarán hasta que vuelvas tú.',
  };
}

export type ResultadoActualizacion = 'nueva' | 'ultima' | 'sin-senal' | 'sin-sw';

export function textoActualizacion(r: ResultadoActualizacion): string {
  switch (r) {
    case 'nueva':
      return 'Hay una versión nueva: tócala en el aviso de arriba para actualizar.';
    case 'ultima':
      return 'Ya tienes la última versión.';
    case 'sin-senal':
      return 'Necesitas conexión para buscar actualizaciones.';
    case 'sin-sw':
      return 'Este navegador no permite actualizar la app desde aquí.';
  }
}

/** El mensaje con el que se abre WhatsApp al contactar al administrador. */
export function mensajeContacto(nombre: string | undefined): string {
  const quien = String(nombre || '').trim();
  return quien
    ? `Hola, soy ${quien}, uso la app Rewards Mobile y necesito ayuda.`
    : 'Hola, uso la app Rewards Mobile y necesito ayuda.';
}
