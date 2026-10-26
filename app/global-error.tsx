'use client';

import './globals.css';
import PantallaError from '@/components/PantallaError';
import TemaApp from '@/components/TemaApp';
import { SCRIPT_TEMA } from '@/lib/tema';

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
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-dvh antialiased">
        <PantallaError error={error} reset={reset} />
        <TemaApp />
      </body>
    </html>
  );
}
