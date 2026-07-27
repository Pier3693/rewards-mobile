'use client';

import { IconCheck } from '@/components/icons';

export default function Toast({ mensaje }: { mensaje: string }) {
  return (
    <div className="fixed left-1/2 top-6 z-[60] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-xl">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ok text-white">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
      <span className="text-[13px] font-medium">{mensaje}</span>
    </div>
  );
}
