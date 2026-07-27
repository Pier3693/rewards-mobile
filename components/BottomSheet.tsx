'use client';

import { useEffect } from 'react';
import { IconX } from '@/components/icons';

export default function BottomSheet({
  titulo,
  subtitulo,
  onClose,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Bloquear scroll del fondo mientras el sheet está abierto
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="animate-sheet-up flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white">
        {/* Handle */}
        <div className="flex justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pb-3 pt-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{titulo}</p>
            {subtitulo && (
              <p className="truncate text-[13px] text-ink-2">{subtitulo}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg text-ink-2"
            aria-label="Cerrar"
          >
            <IconX />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}
