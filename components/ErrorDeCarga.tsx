'use client';

// ══════════════════════════════════════════════════
//  Estado de error de carga
//
//  Nunca se deja al CAP sin salida: el titular dice qué
//  pasó, el detalle por qué, y los dos botones dan las
//  dos únicas acciones posibles.
// ══════════════════════════════════════════════════

import { IconAlert, IconRefresh } from '@/components/icons';

export default function ErrorDeCarga({
  detalle,
  onReintentar,
  onVolver,
}: {
  /** La causa concreta: no es lo mismo esperar que no tener señal. */
  detalle?: string;
  onReintentar: () => void;
  onVolver: () => void;
}) {
  return (
    <div className="card mt-6 p-6 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-err-light text-err">
        <IconAlert className="h-7 w-7" />
      </span>
      <p className="mt-4 font-semibold">No pudimos cargar los datos del local</p>
      {detalle && <p className="mt-1 text-[13px] text-ink-2">{detalle}</p>}

      <div className="mt-5 flex gap-2">
        <button
          onClick={onVolver}
          className="min-h-11 flex-1 rounded-xl border border-line text-sm font-semibold text-ink-2 active:scale-[0.98]"
        >
          Volver
        </button>
        <button
          onClick={onReintentar}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white active:scale-[0.98]"
        >
          <IconRefresh className="h-4 w-4" /> Reintentar
        </button>
      </div>
    </div>
  );
}
