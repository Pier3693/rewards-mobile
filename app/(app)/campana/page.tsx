'use client';

import { getUsuario } from '@/lib/auth';
import { IconBell, IconMegaphone } from '@/components/icons';

export default function CampanaPage() {
  const user = getUsuario();
  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {iniciales}
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-tight">
              Hola, {user?.nombre?.split(' ')[0] || 'CAP'}
            </p>
            <p className="text-xs text-ink-2">Capacitador de campo</p>
          </div>
        </div>
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-ink-2 shadow-sm">
          <IconBell />
        </span>
      </header>

      <h1 className="text-[22px] font-bold">Registrar campaña</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-ink-2">
        Material y activaciones en punto de venta
      </p>

      <div className="card p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-light text-primary">
          <IconMegaphone className="h-7 w-7" />
        </span>
        <p className="mt-4 font-semibold">Formulario de campaña</p>
        <p className="mt-1 text-sm text-ink-2">Se construye en el Día 5</p>
      </div>
    </main>
  );
}
