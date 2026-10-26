import type { Metadata, Viewport } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';
import ActualizacionApp from '@/components/ActualizacionApp';
import TemaApp from '@/components/TemaApp';
import { SCRIPT_TEMA } from '@/lib/tema';

export const metadata: Metadata = {
  title: 'Rewards · Trade Marketing',
  description: 'Registro de visitas y campañas en campo',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rewards',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin viewport-fit=cover, env(safe-area-inset-*) vale 0 y las clases
  // .safe-t / .safe-b no hacen nada: el contenido queda bajo el notch
  // y bajo la rayita del iPhone.
  viewportFit: 'cover',
  themeColor: '#3d35c8',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: el script del <head> pone data-theme en
    // <html> antes de que React lo vea, y eso no es un error.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes de pintar: sin esto, en oscuro se vería un destello blanco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-dvh antialiased">
        {children}
        <InstallPrompt />
        <ActualizacionApp />
        <TemaApp />
      </body>
    </html>
  );
}