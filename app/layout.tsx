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
    // Con 'default', instalada en el iPhone, iOS no daba una zona segura
    // fiable: el contenido quedaba detrás de la hora. Con
    // 'black-translucent' la app ocupa toda la pantalla, env() vale lo que
    // debe en todos los modelos, y la hora (siempre blanca) va sobre la
    // .franja-estado. iOS lo lee al abrir la app: hay que reinstalarla.
    statusBarStyle: 'black-translucent',
    title: 'Rewards',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin viewport-fit=cover, env(safe-area-inset-*) vale 0 y las clases de
  // zona segura de globals.css (.pt-pantalla, .pb-tabbar…) no hacen nada:
  // el contenido queda bajo la notch y bajo la rayita del iPhone.
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
        {/* Fondo detrás de la hora del iPhone. Mide 0 donde no hay notch. */}
        <div aria-hidden="true" className="franja-estado" />
        {children}
        <InstallPrompt />
        <ActualizacionApp />
        <TemaApp />
      </body>
    </html>
  );
}