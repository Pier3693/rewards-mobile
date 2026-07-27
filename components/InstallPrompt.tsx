'use client';

import { useEffect, useState } from 'react';
import { IconX } from '@/components/icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY_DISMISS = 'rw_install_dismissed';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [mostrarIOS, setMostrarIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Registrar el service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (localStorage.getItem(KEY_DISMISS) === '1') return;

    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (yaInstalada) return;

    // Android/Chrome: capturamos el prompt nativo del navegador
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS Safari no dispara ese evento → mostramos instrucciones manuales
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const esSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (esIOS && esSafari) {
      setMostrarIOS(true);
      setTimeout(() => setVisible(true), 2000);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function instalar() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') cerrar(true);
  }

  function cerrar(instalada = false) {
    setVisible(false);
    if (!instalada) localStorage.setItem(KEY_DISMISS, '1');
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl bg-ink px-4 py-3.5 text-white shadow-xl">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
          📲
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Instalar como app</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-white/75">
            {mostrarIOS
              ? 'Toca el ícono compartir ↑ y luego "Agregar a inicio"'
              : 'Accede más rápido desde tu pantalla de inicio'}
          </p>
        </div>
        <button onClick={() => cerrar()} className="shrink-0 p-1 text-white/60">
          <IconX className="h-4 w-4" />
        </button>
      </div>
      {!mostrarIOS && (
        <button
          onClick={instalar}
          className="mt-3 w-full rounded-xl bg-white py-2 text-[13px] font-semibold text-ink"
        >
          Instalar
        </button>
      )}
    </div>
  );
}
