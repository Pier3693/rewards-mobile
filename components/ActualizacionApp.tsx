'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Registra el service worker y avisa cuando hay una versión nueva.
 *
 * La versión nueva espera (sin skipWaiting a ciegas) hasta que el CAP
 * toca "Actualizar": entonces se activa y la página se recarga una vez.
 * El aviso no sale en el registro de visita, porque recargar ahí haría
 * perder las fotos que todavía no están guardadas.
 */
export default function ActualizacionApp() {
  const pathname = usePathname();
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);
  const recargando = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let registro: ServiceWorkerRegistration | null = null;

    const vigilar = (reg: ServiceWorkerRegistration) => {
      // Ya había una esperando de antes.
      if (reg.waiting && navigator.serviceWorker.controller) setEsperando(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const nueva = reg.installing;
        nueva?.addEventListener('statechange', () => {
          // Sin controller es la primera instalación: no hay nada que actualizar.
          if (nueva.state === 'installed' && navigator.serviceWorker.controller) {
            setEsperando(nueva);
          }
        });
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        registro = reg;
        vigilar(reg);
      })
      .catch(() => {});

    const alCambiarControlador = () => {
      if (recargando.current) return;
      recargando.current = true;
      window.location.reload();
    };

    // Al volver a la app se pregunta si hay versión nueva.
    const alVolver = () => {
      if (document.visibilityState === 'visible') registro?.update().catch(() => {});
    };

    navigator.serviceWorker.addEventListener('controllerchange', alCambiarControlador);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiarControlador);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  if (!esperando || pathname?.startsWith('/visita/')) return null;

  return (
    <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-xl safe-t">
      <p className="min-w-0 flex-1 text-[13px] font-semibold">Hay una nueva versión</p>
      <button
        onClick={() => esperando.postMessage({ tipo: 'SALTAR_ESPERA' })}
        className="min-h-11 shrink-0 rounded-xl bg-white px-4 text-[13px] font-semibold text-ink"
      >
        Actualizar
      </button>
    </div>
  );
}
