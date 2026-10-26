'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUsuario } from '@/lib/auth';
import BuscadorComercios from '@/components/BuscadorComercios';
import { FormularioCampana } from '@/components/FormularioCampana';
import Toast from '@/components/Toast';
import type { Local } from '@/lib/visita';
import { IconStore, IconMegaphone } from '@/components/icons';

type Que = 'visita' | 'campana';

export default function RegistrarPage() {
  const router = useRouter();
  const user = getUsuario();
  const [que, setQue] = useState<Que>('visita');
  const [localCampana, setLocalCampana] = useState<Local | null>(null);
  const [toast, setToast] = useState('');

  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const opciones: { valor: Que; label: string; icono: React.ReactNode }[] = [
    { valor: 'visita', label: 'Visita', icono: <IconStore /> },
    { valor: 'campana', label: 'Campaña', icono: <IconMegaphone /> },
  ];

  return (
    <main className="mx-auto max-w-md px-5 pt-pantalla">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-sm font-bold text-white">
          {iniciales}
        </span>
        <div>
          <h1 className="text-[21px] font-bold leading-tight">Registrar</h1>
          <p className="text-[12.5px] text-ink-2">¿Qué vas a registrar?</p>
        </div>
      </header>

      {/* Visita entra al flujo de 3 pasos; Campaña usa su propio formulario. */}
      <div className="mb-5 grid grid-cols-2 gap-2.5">
        {opciones.map((o) => (
          <button
            key={o.valor}
            onClick={() => setQue(o.valor)}
            className={`flex min-h-[60px] items-center justify-center gap-2 rounded-2xl border transition ${
              que === o.valor
                ? 'border-2 border-primary bg-primary-light text-primary'
                : 'border-line bg-surface text-ink-2'
            }`}
          >
            {o.icono}
            <span className="text-[14px] font-semibold">{o.label}</span>
          </button>
        ))}
      </div>

      <BuscadorComercios
        onElegir={(l) => {
          if (que === 'visita') {
            router.push(`/visita/${encodeURIComponent(l.id_local)}`);
          } else {
            setLocalCampana(l as unknown as Local);
          }
        }}
      />

      {localCampana && (
        <FormularioCampana
          local={localCampana}
          onClose={() => setLocalCampana(null)}
          onGuardado={() => {
            setLocalCampana(null);
            setToast('¡Campaña registrada!');
            setTimeout(() => setToast(''), 3000);
          }}
        />
      )}

      {toast && <Toast mensaje={toast} />}
    </main>
  );
}
