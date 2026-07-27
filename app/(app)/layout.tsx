'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';
import TabBar from '@/components/TabBar';

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
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
    <div className="min-h-dvh pb-24">
      {children}
      <TabBar />
    </div>
  );
}
