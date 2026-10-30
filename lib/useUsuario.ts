'use client';

import { useEffect, useState } from 'react';
import { EVENTO_USUARIO, getUsuario, type Usuario } from './auth.ts';

/**
 * El usuario guardado en el celular, al día: cambia cuando getPerfil trae
 * la foto (o un nombre o rol nuevos) sin tener que recargar la pantalla.
 */
export function useUsuario(): Usuario | null {
  const [usuario, setUsuario] = useState<Usuario | null>(() => getUsuario());
  useEffect(() => {
    const leer = () => setUsuario(getUsuario());
    leer();
    window.addEventListener(EVENTO_USUARIO, leer);
    return () => window.removeEventListener(EVENTO_USUARIO, leer);
  }, []);
  return usuario;
}
