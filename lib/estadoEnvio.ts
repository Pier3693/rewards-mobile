// ══════════════════════════════════════════════════
//  Estado de envío de una visita
//
//  Con el guardado "primero en el celular", el CAP ve la
//  confirmación al instante y el envío sigue por detrás.
//  Esto dice en qué punto está cada visita, para que la
//  confirmación, Hoy y el Historial digan lo mismo.
// ══════════════════════════════════════════════════

import type { VisitaEncolada } from './cola.ts';

export type EstadoEnvio = 'enviando' | 'enviada' | 'pendiente' | 'sesion' | 'revisar';

export function estadoDeVisita({
  enCola,
  enVuelo,
  sesionVencida,
}: {
  /** La entrada de la cola, o undefined si ya no está (se envió). */
  enCola: VisitaEncolada | undefined;
  /** Se está mandando ahora mismo. */
  enVuelo: boolean;
  /** La última pasada se cortó porque la sesión venció. */
  sesionVencida: boolean;
}): EstadoEnvio {
  if (enVuelo) return 'enviando';
  // Fuera de la cola solo sale lo que el backend aceptó.
  if (!enCola) return 'enviada';
  if (enCola.revisar) return 'revisar';
  if (sesionVencida) return 'sesion';
  return 'pendiente';
}

export const TEXTO_ESTADO: Record<EstadoEnvio, string> = {
  enviando: 'Enviando…',
  enviada: 'Enviada ✓',
  pendiente: 'Pendiente de envío',
  sesion: 'Inicia sesión para enviarla',
  revisar: 'Revisar',
};
