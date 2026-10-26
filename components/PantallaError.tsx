'use client';

import { esFalloDeCarga, textoDeError } from '@/lib/errores';

/**
 * Lo que se ve cuando una pantalla falla, en vez del "Application error"
 * de Next. Siempre con una salida: Volver.
 */
export default function PantallaError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { titulo, detalle } = textoDeError(error);

  function volver() {
    // Una navegación completa: la de Next podría volver a pedir el mismo
    // código que no se pudo cargar.
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/hoy';
  }

  function reintentar() {
    // Si faltaba el código, reset() no basta: hay que volver a pedirlo.
    if (esFalloDeCarga(error)) window.location.reload();
    else reset();
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-white px-8 text-center safe-t safe-b">
      <div className="max-w-sm">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-warn-light text-warn">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1.5 9a16 16 0 0 1 21 0M5 13a10.5 10.5 0 0 1 14 0M8.5 17a5.5 5.5 0 0 1 7 0" />
            <path d="M12 20.5v.01M3 3l18 18" />
          </svg>
        </span>
        <h1 className="text-lg font-bold">{titulo}</h1>
        <p className="mt-1.5 text-sm text-ink-2">{detalle}</p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={volver}
            className="btn-grad min-h-[52px] rounded-2xl px-6 text-sm font-semibold text-white shadow-lg shadow-primary/25"
          >
            Volver
          </button>
          <button
            onClick={reintentar}
            className="min-h-11 rounded-2xl px-6 text-sm font-semibold text-primary"
          >
            Reintentar
          </button>
        </div>
      </div>
    </main>
  );
}
