'use client';

import { useRouter } from 'next/navigation';
import BuscadorComercios from '@/components/BuscadorComercios';

export default function BuscarPage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      <h1 className="mb-4 text-[22px] font-bold">Buscar comercio</h1>

      <BuscadorComercios
        onElegir={(l) => router.push(`/local/${encodeURIComponent(l.id_local)}`)}
      />
    </main>
  );
}
