'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import TabBar, { hayBarraInferior } from '@/components/TabBar';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login');
    } else {
      setListo(true);
    }
  }, [router]);

  if (!listo) {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${hayBarraInferior(pathname) ? 'pb-24' : ''}`}>
      {children}
      <TabBar />
    </div>
  );
}
