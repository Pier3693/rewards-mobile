'use client';

import { useRouter } from 'next/navigation';
import { getUsuario, clearSession } from '@/lib/auth';
import { IconLogout, IconUser, IconBell } from '@/components/icons';

export default function PerfilPage() {
  const router = useRouter();
  const user = getUsuario();

  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function salir() {
    clearSession();
    router.replace('/login');
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-6 safe-t">
      <h1 className="mb-6 text-center text-[17px] font-bold">Mi perfil</h1>

      {/* Avatar + datos */}
      <div className="mb-6 text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary text-2xl font-bold text-white">
          {iniciales}
        </span>
        <p className="mt-3 text-lg font-bold">{user?.nombre || '—'}</p>
        <p className="text-sm text-ink-2">Capacitador de campo</p>
        <p className="mt-0.5 text-xs text-ink-2">{user?.correo || ''}</p>
      </div>

      {/* Opciones */}
      <div className="card divide-y divide-line">
        <Fila icono={<IconUser />} texto="Información personal" sub={user?.rol || ''} />
        <Fila icono={<IconBell />} texto="Notificaciones" sub="Próximamente" />
      </div>

      <button
        onClick={salir}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-err-light py-3.5 text-[15px] font-semibold text-err transition active:scale-[0.98]"
      >
        <IconLogout /> Cerrar sesión
      </button>

      <p className="mt-8 text-center text-xs text-ink-2">
        © 2026 Rewards Marketing Relacional
      </p>
    </main>
  );
}

function Fila({
  icono,
  texto,
  sub,
}: {
  icono: React.ReactNode;
  texto: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-light text-primary">
        {icono}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{texto}</p>
        {sub && <p className="text-xs text-ink-2">{sub}</p>}
      </div>
    </div>
  );
}
