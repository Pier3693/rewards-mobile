'use client';

import { useEffect, useRef, useState } from 'react';
import type { Coordenadas, ParadaEnMapa } from './mapa.ts';
import type { Ubicacion } from './useUbicacion.ts';
import {
  clavePendientes,
  debeRecalcular,
  sugerirRuta,
  type Calculo,
  type RutaSugerida,
} from './rutaSugerida.ts';

export interface Sugerencia {
  ruta: RutaSugerida;
  /** Desde dónde se calculó: el inicio de la línea del mapa. */
  origen: Coordenadas;
}

/**
 * La ruta sugerida desde la ubicación del CAP, recalculada solo cuando
 * `debeRecalcular` lo dice. La usan el Mapa y Hoy, así los dos sugieren
 * lo mismo. Sin ubicación, null: cada pantalla se queda como antes.
 */
export function useRutaSugerida(paradas: ParadaEnMapa[], ubicacion: Ubicacion | null): Sugerencia | null {
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const calculo = useRef<Calculo | null>(null);
  // Un latido por minuto: las anclas dependen de la hora, aunque el CAP
  // no se mueva (debeRecalcular deja pasar uno cada 10 min).
  const [latido, setLatido] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setLatido((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ubicacion) {
      calculo.current = null;
      setSugerencia(null);
      return;
    }
    const clave = clavePendientes(paradas);
    const en = Date.now();
    if (!debeRecalcular(calculo.current, { clave, ubicacion, en })) return;
    const origen = { lat: ubicacion.lat, lng: ubicacion.lng };
    calculo.current = { clave, origen, en };
    setSugerencia({ ruta: sugerirRuta(paradas, origen), origen });
  }, [paradas, ubicacion, latido]);

  return sugerencia;
}
