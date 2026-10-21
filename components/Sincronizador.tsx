'use client';

import { useEffect } from 'react';
import { sincronizar } from '@/lib/sincronizador';

/**
 * Envía la cola al abrir la app, al volver la señal y al volver a primer
 * plano. No pinta nada: los avisos los da cada pantalla con useCola.
 */
export default function Sincronizador() {
  useEffect(() => {
    sincronizar();

    const alVolverLaSenal = () => sincronizar();
    const alVolverAPrimerPlano = () => {
      if (document.visibilityState === 'visible') sincronizar();
    };

    window.addEventListener('online', alVolverLaSenal);
    document.addEventListener('visibilitychange', alVolverAPrimerPlano);
    return () => {
      window.removeEventListener('online', alVolverLaSenal);
      document.removeEventListener('visibilitychange', alVolverAPrimerPlano);
    };
  }, []);

  return null;
}
