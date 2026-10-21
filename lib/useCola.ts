'use client';

import { useEffect, useState } from 'react';
import { colaIndexedDB, delUsuario, EVENTO_COLA, type VisitaEncolada } from './cola.ts';
import {
  correoConectado,
  estadoSincronizacion,
  sincronizar,
  type EstadoSincronizacion,
} from './sincronizador.ts';

export interface EstadoCola extends EstadoSincronizacion {
  /** Las visitas del CAP conectado que esperan envío. */
  visitas: VisitaEncolada[];
  /** Ya se leyó la cola al menos una vez. */
  leida: boolean;
  reintentar: () => void;
}

/** La cola del CAP conectado, al día con cada cambio. */
export function useCola(): EstadoCola {
  const [visitas, setVisitas] = useState<VisitaEncolada[]>([]);
  const [leida, setLeida] = useState(false);
  const [estado, setEstado] = useState<EstadoSincronizacion>(() => estadoSincronizacion());

  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      const mias = delUsuario(await colaIndexedDB.listar(), correoConectado());
      if (!vivo) return;
      setVisitas(mias);
      setLeida(true);
      setEstado(estadoSincronizacion());
    };
    leer();
    window.addEventListener(EVENTO_COLA, leer);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_COLA, leer);
    };
  }, []);

  return { visitas, leida, ...estado, reintentar: () => void sincronizar(true) };
}
