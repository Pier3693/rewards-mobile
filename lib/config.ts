// ══════════════════════════════════════════════════
//  Configuración de la app
//  Datos de contacto del administrador, usados por el
//  panel de "¿Olvidaste tu clave?".
//
//  No son secretos: se muestran en pantalla y el usuario
//  los abre en WhatsApp o en su correo. Por eso van como
//  NEXT_PUBLIC_, con un valor por defecto para que la app
//  funcione aunque no se configure el entorno.
// ══════════════════════════════════════════════════

/** Número del admin en formato internacional sin "+" ni espacios (ej: 51987654321). */
export const ADMIN_WHATSAPP =
  process.env.NEXT_PUBLIC_ADMIN_WHATSAPP || '51XXXXXXXXX';

/** Correo del admin que restablece las contraseñas. */
export const ADMIN_EMAIL =
  process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'gcollazos@entremarcas.com';
