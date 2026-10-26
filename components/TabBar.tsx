'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconHome, IconSearch, IconPlus, IconUser, IconClock } from '@/components/icons';

/**
 * Pantallas secundarias: tienen su propia salida y no llevan barra.
 * En el registro, además, saltar a otra pestaña a media captura sería
 * escaparse sin pasar por la confirmación de salida.
 */
export const RUTAS_SIN_BARRA = ['/local/', '/visita/'];

/** Lo usa también el layout, para no reservar el hueco de la barra. */
export function hayBarraInferior(pathname: string): boolean {
  return !RUTAS_SIN_BARRA.some((r) => pathname.startsWith(r));
}

export default function TabBar() {
  const pathname = usePathname();
  const is = (p: string) => pathname.startsWith(p);

  if (!hayBarraInferior(pathname)) return null;

  const item = (activo: boolean) =>
    `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition ${
      activo ? 'text-primary' : 'text-ink-2'
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-1 backdrop-blur safe-b">
      <div className="mx-auto flex max-w-md items-end px-2">
        <Link href="/hoy" className={item(is('/hoy'))}>
          <IconHome className="h-[22px] w-[22px]" />
          Hoy
        </Link>

        <Link href="/buscar" className={item(is('/buscar'))}>
          <IconSearch className="h-[22px] w-[22px]" />
          Buscar
        </Link>

        {/* Botón central elevado (mockup 3) */}
        <Link
          href="/registrar"
          className="relative -top-4 mx-1 flex flex-col items-center"
        >
          <span
            className={`grid h-14 w-14 place-items-center rounded-full text-white shadow-lg shadow-primary/30 transition active:scale-95 ${
              is('/registrar') ? 'btn-grad' : 'bg-primary'
            }`}
          >
            <IconPlus />
          </span>
          <span
            className={`mt-1 text-[11px] font-semibold ${
              is('/registrar') ? 'text-primary' : 'text-ink-2'
            }`}
          >
            Registrar
          </span>
        </Link>

        <Link href="/historial" className={item(is('/historial'))}>
          <IconClock className="h-[22px] w-[22px]" />
          Historial
        </Link>

        <Link href="/perfil" className={item(is('/perfil'))}>
          <IconUser className="h-[22px] w-[22px]" />
          Perfil
        </Link>
      </div>
    </nav>
  );
}
