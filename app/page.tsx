'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/auth';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isLoggedIn() ? '/hoy' : '/login');
  }, [router]);

  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="spinner" />
    </div>
  );
}
