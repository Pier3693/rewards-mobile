'use client';

import { useCallback, useEffect, useState } from 'react';

const CLAVE = 'rw_dia_elegido';

/**
 * El día que el CAP eligió mirar ("dd/MM/yyyy", o '' para hoy). Vive en
 * sessionStorage para que Hoy y el Mapa sigan el mismo día, y se olvida
 * al cerrar la app. Quien lo usa comprueba que el día siga en el
 * selector: si ya pasó o se quedó sin paradas, es hoy.
 */
export function useDiaElegido(): [string, (fecha: string) => void] {
  const [dia, setDia] = useState('');
  useEffect(() => {
    try {
      setDia(window.sessionStorage.getItem(CLAVE) || '');
    } catch {
      /* sin almacenamiento: siempre empieza en hoy */
    }
  }, []);
  const elegir = useCallback((fecha: string) => {
    setDia(fecha);
    try {
      if (fecha) window.sessionStorage.setItem(CLAVE, fecha);
      else window.sessionStorage.removeItem(CLAVE);
    } catch {
      /* ignorar */
    }
  }, []);
  return [dia, elegir];
}
