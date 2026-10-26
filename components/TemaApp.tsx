'use client';

import { useEffect } from 'react';
import { aplicarTema, leerPreferencia, EVENTO_TEMA } from '@/lib/tema';

/**
 * El primer tema ya lo puso el script del <head>. Esto lo mantiene al
 * día: si la preferencia es "sistema" y el celular cambia a oscuro (por
 * la hora, por ejemplo), la app cambia con él.
 */
export default function TemaApp() {
  useEffect(() => {
    // Next añade el meta theme-color después del script: se ajusta aquí.
    aplicarTema();

    const sistema = window.matchMedia?.('(prefers-color-scheme: dark)');
    const alCambiarSistema = () => {
      if (leerPreferencia() === 'sistema') aplicarTema('sistema');
    };
    const alCambiarPreferencia = () => aplicarTema();

    sistema?.addEventListener?.('change', alCambiarSistema);
    window.addEventListener(EVENTO_TEMA, alCambiarPreferencia);
    return () => {
      sistema?.removeEventListener?.('change', alCambiarSistema);
      window.removeEventListener(EVENTO_TEMA, alCambiarPreferencia);
    };
  }, []);

  return null;
}
