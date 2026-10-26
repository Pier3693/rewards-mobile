'use client';

import PantallaError from '@/components/PantallaError';

/** Frontera de error de las pantallas de la app (Hoy, Detalle, Registro…). */
export default function ErrorDeApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <PantallaError error={error} reset={reset} />;
}
