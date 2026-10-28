'use client';

import { useRef } from 'react';
import type { OpcionDia } from '@/lib/rutasProximas';

/**
 * Pestañas de días: "Hoy 5 · Mañana 3 · Lun 2 nov 8". Las usan Hoy y el
 * Mapa. Es un tablist de verdad: el lector de pantalla dice cuál está
 * elegida, y las flechas pasan de una a otra. A lo ancho se desplaza si
 * no entran (360 px), sin desbordar la pantalla.
 */
export default function SelectorDias({
  opciones,
  elegido,
  onElegir,
  className = '',
}: {
  opciones: OpcionDia[];
  /** La fecha elegida ("dd/MM/yyyy"). */
  elegido: string;
  onElegir: (o: OpcionDia) => void;
  className?: string;
}) {
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function teclas(e: React.KeyboardEvent, i: number) {
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    const destino = e.key === 'Home' ? 0 : e.key === 'End' ? opciones.length - 1 : i + paso;
    if (destino === i || destino < 0 || destino >= opciones.length) return;
    e.preventDefault();
    onElegir(opciones[destino]);
    botones.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Día de la ruta"
      className={`sin-barra-scroll flex gap-2 overflow-x-auto ${className}`}
    >
      {opciones.map((o, i) => {
        const activo = o.fecha === elegido;
        return (
          <button
            key={o.fecha}
            ref={(b) => {
              botones.current[i] = b;
            }}
            role="tab"
            aria-selected={activo}
            aria-label={`${o.etiqueta}, ${o.total} ${o.total === 1 ? 'parada' : 'paradas'}`}
            tabIndex={activo ? 0 : -1}
            onClick={() => onElegir(o)}
            onKeyDown={(e) => teclas(e, i)}
            className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
              activo ? 'bg-primary text-white' : 'border border-line bg-surface text-ink-2'
            }`}
          >
            {o.etiqueta}
            <span
              aria-hidden="true"
              className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                activo ? 'bg-white/25 text-white' : 'bg-gris-light text-ink-2'
              }`}
            >
              {o.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
