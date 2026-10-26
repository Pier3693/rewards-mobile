'use client';

import { useEffect, useState } from 'react';

/**
 * False cuando el celular sabe que no tiene red (modo avión, sin datos).
 *
 * Con señal muy mala puede decir true y aun así fallar: por eso el
 * guardado no se fía de esto y siempre deja la visita en la cola antes
 * de enviarla.
 */
export function useConexion(): boolean {
  const [enLinea, setEnLinea] = useState(true);

  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine !== false);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);

  return enLinea;
}
