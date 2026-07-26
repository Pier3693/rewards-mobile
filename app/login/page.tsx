'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { saveSession, type Usuario } from '@/lib/auth';
import { LogoBadge, IconUser } from '@/components/icons';

interface LoginData {
  token: string;
  usuario: Usuario;
}

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario.trim() || !password) {
      setError('Ingresa tu usuario y contraseña');
      return;
    }
    setError('');
    setCargando(true);

    const r = await api<LoginData>('login', {
      usuario: usuario.trim(),
      password,
    });

    setCargando(false);

    if (!r.ok || !r.data) {
      setError(r.error || 'Credenciales incorrectas');
      return;
    }

    saveSession(r.data.token, r.data.usuario);
    router.replace('/hoy');
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-white px-7 safe-t safe-b">
      {/* Marca */}
      <div className="mb-9 text-center">
        <div className="mx-auto mb-5 w-fit">
          <LogoBadge size={140} />
        </div>
        <h1 className="text-[26px] font-bold tracking-tight">¡Bienvenido!</h1>
        <p className="mt-1 text-[15px] text-ink-2">
          Ingresa tus credenciales
          <br />
          para continuar
        </p>
      </div>

      {/* Formulario */}
      <form onSubmit={entrar} className="mx-auto w-full max-w-sm space-y-3.5">
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
            <IconUser className="h-[18px] w-[18px]" />
          </span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Usuario"
          />
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
            </svg>
          </span>
          <input
            type={verPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-12 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Contraseña"
          />
          <button
            type="button"
            onClick={() => setVerPass(!verPass)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-ink-2"
            aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {verPass ? (
                <>
                  <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="2.8" />
                  <path d="M4 4l16 16" />
                </>
              ) : (
                <>
                  <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="2.8" />
                </>
              )}
            </svg>
          </button>
        </div>

        {error && (
          <div className="rounded-2xl bg-err-light px-4 py-3 text-sm font-medium text-err">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="btn-grad flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-60"
        >
          {cargando ? (
            <>
              <span className="spinner !h-5 !w-5 !border-white/30 !border-t-white" />
              Verificando...
            </>
          ) : (
            <>
              <IconLogin />
              Ingresar
            </>
          )}
        </button>
      </form>

      <p className="mt-12 text-center text-xs text-ink-2">
        © 2026 Rewards Marketing Relacional
      </p>
    </main>
  );
}

function IconLogin() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <path d="m10 17 5-5-5-5M15 12H3" />
    </svg>
  );
}
