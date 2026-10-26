'use client';

// ══════════════════════════════════════════════════
//  La ubicación del CAP, en tiempo real
//
//  Solo se usa en el celular, para el mapa: no hay ninguna
//  llamada que la envíe a un servidor, y no se guarda.
//
//  Antes de que el sistema pida el permiso se explica para
//  qué es (estado 'explicar'). Si ya está concedido, se
//  empieza directo; si está negado, se dice cómo activarlo.
// ══════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordenadas } from './mapa.ts';

export type EstadoUbicacion =
  /** Mirando si ya hay permiso. */
  | 'comprobando'
  /** Falta pedirlo: se enseña la explicación antes del aviso del sistema. */
  | 'explicar'
  /** El CAP dijo "Ahora no": no se insiste hasta que toque "Centrar en mí". */
  | 'descartada'
  | 'buscando'
  | 'activa'
  | 'denegada'
  /** El GPS no responde o falló. */
  | 'error'
  | 'no-disponible';

export interface Ubicacion extends Coordenadas {
  /** Radio de precisión, en metros. */
  precision: number;
}

export function useUbicacion() {
  const [estado, setEstado] = useState<EstadoUbicacion>('comprobando');
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null);
  const vigilancia = useRef<number | null>(null);

  const parar = useCallback(() => {
    if (vigilancia.current !== null) navigator.geolocation.clearWatch(vigilancia.current);
    vigilancia.current = null;
  }, []);

  /** Empieza a seguir la ubicación. La primera vez, el sistema pide el permiso. */
  const empezar = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setEstado('no-disponible');
      return;
    }
    if (vigilancia.current !== null) return;
    setEstado('buscando');
    vigilancia.current = navigator.geolocation.watchPosition(
      (pos) => {
        setUbicacion({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          precision: pos.coords.accuracy,
        });
        setEstado('activa');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          parar();
          setEstado('denegada');
          return;
        }
        // Un corte del GPS con ubicación ya conocida: se queda la última.
        setEstado((antes) => (antes === 'activa' ? 'activa' : 'error'));
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
  }, [parar]);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setEstado('no-disponible');
      return;
    }
    let vivo = true;
    // Si ya dio permiso no hace falta explicar nada; si no se puede
    // preguntar (navegadores viejos), se explica antes de pedirlo.
    const consulta = navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (!consulta) {
      setEstado('explicar');
    } else {
      consulta
        .then((p) => {
          if (!vivo) return;
          if (p.state === 'granted') empezar();
          else if (p.state === 'denied') setEstado('denegada');
          else setEstado('explicar');
        })
        .catch(() => vivo && setEstado('explicar'));
    }
    return () => {
      vivo = false;
      parar();
    };
  }, [empezar, parar]);

  return {
    estado,
    ubicacion,
    empezar,
    descartar: () => setEstado('descartada'),
  };
}
