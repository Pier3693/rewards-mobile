'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IconX } from '@/components/icons';
import {
  escucharInstalacion,
  hayEventoInstalar,
  instalar,
  debeMostrarAviso,
  avisoYaSalio,
  marcarAvisoVisto,
  estaInstalada,
  plataformaDe,
  instruccionesDe,
  EVENTO_INSTALACION,
  type Plataforma,
} from '@/lib/instalacion';

/**
 * Va montado en toda la app para no perder el evento de instalar de
 * Chrome (lo usa luego Perfil), pero el aviso solo se ENSEÑA en el
 * login, una sola vez por celular.
 */
export default function InstallPrompt() {
  const pathname = usePathname();
  const [plataforma, setPlataforma] = useState<Plataforma>('otro');
  const [hayEvento, setHayEvento] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    escucharInstalacion();
    setPlataforma(plataformaDe(navigator.userAgent));
    const actualizar = () => setHayEvento(hayEventoInstalar());
    actualizar();
    window.addEventListener(EVENTO_INSTALACION, actualizar);
    return () => window.removeEventListener(EVENTO_INSTALACION, actualizar);
  }, []);

  useEffect(() => {
    if (visible) return;
    const toca = debeMostrarAviso({
      ruta: pathname,
      yaSalio: avisoYaSalio(),
      instalada: estaInstalada(),
      plataforma,
      hayEvento,
    });
    if (!toca) return;
    // Un respiro para que primero se vea el login. En cuanto se enseña,
    // queda marcado: no vuelve a salir solo nunca más.
    const t = setTimeout(() => {
      setVisible(true);
      marcarAvisoVisto();
    }, 1500);
    return () => clearTimeout(t);
  }, [pathname, plataforma, hayEvento, visible]);

  // Al entrar a la app desaparece, aunque no se haya cerrado.
  if (!visible || pathname !== '/login') return null;

  const conBoton = hayEvento;
  const texto = conBoton
    ? 'Ábrela desde tu pantalla de inicio, como cualquier app, y trabaja sin señal.'
    : instruccionesDe(plataforma);

  async function aceptar() {
    await instalar();
    setVisible(false);
  }

  return (
    <div className="card fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md p-4 shadow-xl safe-b">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-xl">
          📲
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Instala Rewards en tu celular</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{texto}</p>
        </div>
        <button
          onClick={() => setVisible(false)}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
      {conBoton && (
        <button
          onClick={aceptar}
          className="btn-grad mt-3 min-h-11 w-full rounded-xl text-[14px] font-semibold text-white"
        >
          Instalar
        </button>
      )}
    </div>
  );
}
