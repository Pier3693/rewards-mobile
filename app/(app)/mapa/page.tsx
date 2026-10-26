'use client';

import dynamic from 'next/dynamic';

/**
 * Leaflet necesita `window` y pesa: se carga solo aquí, en el navegador,
 * así no entra en el resto de la app.
 */
const MapaRuta = dynamic(() => import('@/components/MapaRuta'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 grid place-items-center">
      <div className="spinner" />
    </div>
  ),
});

export default function MapaPage() {
  return <MapaRuta />;
}
