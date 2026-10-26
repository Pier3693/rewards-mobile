'use client';

import './globals.css';
import PantallaError from '@/components/PantallaError';

/**
 * Si falla el layout raíz, Next reemplaza toda la página: por eso lleva
 * su propio <html> y los estilos. Así tampoco aquí se ve "Application error".
 */
export default function ErrorGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body className="min-h-dvh antialiased">
        <PantallaError error={error} reset={reset} />
      </body>
    </html>
  );
}
