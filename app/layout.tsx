import type { Metadata, Viewport } from 'next';
import './globals.css';
import InstallPrompt from '@/components/InstallPrompt';
import ActualizacionApp from '@/components/ActualizacionApp';

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
    <html lang="es">
      <body className="min-h-dvh antialiased">
        {children}
        <InstallPrompt />
        <ActualizacionApp />
      </body>
    </html>
  );
}