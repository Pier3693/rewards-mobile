'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { precalentarBase, olvidarPrecalentado, esperarActivado } from '@/lib/precalentar';
import { EVENTO_VERSION_NUEVA } from '@/lib/version';

/**
 * Si la activación no termina, se recarga igual pasado este tiempo. La
 * activación ya no descarga nada (solo copia lo guardado en el celular),
 * así que normalmente llega en milisegundos.
 */
const MS_MAXIMO_ACTUALIZAR = 15_000;

/**
 * Registra el service worker y avisa cuando hay una versión nueva.
 *
 * La versión nueva espera (sin skipWaiting a ciegas) hasta que el CAP
 * toca "Actualizar". Se recarga cuando termina de ACTIVARSE, no al
 * cambiar de controlador: mientras se activa está copiando lo guardado
 * para trabajar sin señal, y recargar antes la pillaría a medias. Las
 * descargas de la versión nueva siguen después, sin hacer esperar.
 * El aviso no sale en el registro de visita, porque recargar ahí haría
 * perder las fotos que todavía no están guardadas.
 */
export default function ActualizacionApp() {
  const pathname = usePathname();
  const [esperando, setEsperando] = useState<ServiceWorker | null>(null);
  const [actualizando, setActualizando] = useState(false);
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

    // El service worker ya guarda todo al activarse. Esto es un respaldo
    // por si algo quedó fuera: una vez por sesión, con él ya activado.
    precalentarBase();

    // Al volver a la app se pregunta si hay versión nueva.
    const alVolver = () => {
      if (document.visibilityState === 'visible') registro?.update().catch(() => {});
    };

    // "Buscar actualización" de Perfil encontró una: se enseña el aviso.
    const alHaberNueva = () => {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (reg?.waiting && navigator.serviceWorker.controller) setEsperando(reg.waiting);
        })
        .catch(() => {});
    };

    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener(EVENTO_VERSION_NUEVA, alHaberNueva);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener(EVENTO_VERSION_NUEVA, alHaberNueva);
    };
  }, []);

  function recargar() {
    if (recargando.current) return;
    recargando.current = true;
    // Para que la página vuelva a mandar la base y las paradas a la
    // versión nueva (el service worker ya las tiene, es un respaldo).
    olvidarPrecalentado();
    window.location.reload();
  }

  function actualizar() {
    if (!esperando || actualizando) return;
    setActualizando(true);
    const tope = setTimeout(recargar, MS_MAXIMO_ACTUALIZAR);
    esperarActivado(esperando).then(() => {
      clearTimeout(tope);
      recargar();
    });
    esperando.postMessage({ tipo: 'SALTAR_ESPERA' });
  }

  if (!esperando || pathname?.startsWith('/visita/')) return null;

  return (
    <div className="fixed inset-x-4 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-surface shadow-xl safe-t">
      <p className="min-w-0 flex-1 text-[13px] font-semibold">Hay una nueva versión</p>
      <button
        onClick={actualizar}
        disabled={actualizando}
        className="min-h-11 shrink-0 rounded-xl bg-surface px-4 text-[13px] font-semibold text-ink disabled:opacity-70"
      >
        {actualizando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  );
}
