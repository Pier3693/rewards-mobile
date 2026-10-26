'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import {
  saveSession,
  recordarUsuario,
  getUltimoUsuario,
  consumirAvisoExpiracion,
  type Usuario,
} from '@/lib/auth';
import { ADMIN_WHATSAPP, ADMIN_EMAIL } from '@/lib/config';
import BottomSheet from '@/components/BottomSheet';
import { IconUser } from '@/components/icons';

interface LoginData {
  token: string;
  usuario: Usuario;
}

export default function LoginPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass] = useState(false);
  const [mantener, setMantener] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [verAyuda, setVerAyuda] = useState(false);

  // Si la sesión venció, volvemos con el usuario ya escrito y lo decimos.
  useEffect(() => {
    if (consumirAvisoExpiracion()) {
      setError('Tu sesión expiró, ingresa de nuevo');
    }
    const ultimo = getUltimoUsuario();
    if (ultimo) setUsuario(ultimo);
  }, []);

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
      // El backend emite 30 días para la PWA y 12 h para el desktop.
      app: 'mobile',
    });

    setCargando(false);

    if (!r.ok || !r.data) {
      setError(r.error || 'Credenciales incorrectas');
      return;
    }

    recordarUsuario(usuario.trim());
    saveSession(r.data.token, r.data.usuario, mantener);
    router.replace('/hoy');
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center bg-surface px-7 py-seguro">
      {/* Marca */}
      <div className="mb-9 text-center">
        {/* logo-marca: en oscuro lleva un círculo blanco detrás, o el
            morado del logo apenas se vería sobre el fondo oscuro. */}
        <div className="logo-marca mx-auto mb-5 w-fit">
          <Image
            src="/logo-login.png"
            alt="Rewards Marketing Relacional"
            width={140}
            height={140}
            priority
          />
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
        {/* El error va ARRIBA de los campos y no borra lo escrito */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl bg-err-light px-4 py-3 text-sm font-medium text-err"
          >
            <IconAlertCircle />
            <span>{error}</span>
          </div>
        )}

        <div className="relative">
          <label htmlFor="usuario" className="sr-only">
            Usuario
          </label>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
            <IconUser className="h-[18px] w-[18px]" />
          </span>
          <input
            id="usuario"
            name="usuario"
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            className="w-full rounded-2xl border border-line bg-campo py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Usuario"
          />
        </div>

        <div className="relative">
          <label htmlFor="password" className="sr-only">
            Contraseña
          </label>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
              <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
            </svg>
          </span>
          <input
            id="password"
            name="password"
            type={verPass ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-2xl border border-line bg-campo py-3.5 pl-11 pr-12 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
            placeholder="Contraseña"
          />
          <button
            type="button"
            onClick={() => setVerPass(!verPass)}
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-ink-2"
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

        {/* Mantener sesión · ¿Olvidaste tu clave? */}
        <div className="flex items-center justify-between gap-3">
          <label className="-ml-1 flex min-h-11 cursor-pointer select-none items-center gap-2.5 px-1">
            <input
              type="checkbox"
              checked={mantener}
              onChange={(e) => setMantener(e.target.checked)}
              className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-line accent-primary"
            />
            <span className="text-[13px] text-ink">Mantener sesión iniciada</span>
          </label>

          <button
            type="button"
            onClick={() => setVerAyuda(true)}
            className="-mr-1 flex min-h-11 items-center px-1 text-[13px] font-semibold text-primary"
          >
            ¿Olvidaste tu clave?
          </button>
        </div>

        <button
          type="submit"
          disabled={cargando}
          className="btn-grad flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-60"
        >
          {cargando ? (
            <>
              <span className="spinner !h-5 !w-5 !border-white/30 !border-t-white" />
              Ingresando…
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

      {verAyuda && (
        <SheetOlvideClave
          usuario={usuario.trim()}
          onClose={() => setVerAyuda(false)}
        />
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════
//  Panel de ayuda: el admin restablece la clave.
//  No hay recuperación automática a propósito.
// ══════════════════════════════════════════════════
function SheetOlvideClave({
  usuario,
  onClose,
}: {
  usuario: string;
  onClose: () => void;
}) {
  const quien = usuario ? `Mi usuario es "${usuario}". ` : '';
  const mensaje =
    `Hola, necesito restablecer mi clave de Rewards Visitas. ${quien}Gracias.`;

  const urlWhatsApp = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
  const urlCorreo =
    `mailto:${ADMIN_EMAIL}` +
    `?subject=${encodeURIComponent('Restablecer clave - Rewards Visitas')}` +
    `&body=${encodeURIComponent(mensaje)}`;

  return (
    <BottomSheet titulo="¿Olvidaste tu clave?" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary-light text-primary">
            <IconKey />
          </span>
          <p className="text-[14px] leading-snug text-ink-2">
            Por seguridad, la contraseña la restablece el administrador.
            Escríbele y te enviará una clave temporal.
          </p>
        </div>

        <a
          href={urlWhatsApp}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#16A34A] text-[15px] font-semibold text-white transition active:scale-[0.98]"
        >
          <IconWhatsApp />
          Escribir por WhatsApp
        </a>

        <a
          href={urlCorreo}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary-light text-[15px] font-semibold text-primary transition active:scale-[0.98]"
        >
          <IconMail />
          Enviar correo
        </a>

        <button
          onClick={onClose}
          className="min-h-11 w-full text-[14px] font-semibold text-ink-2"
        >
          Cancelar
        </button>
      </div>
    </BottomSheet>
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

function IconAlertCircle() {
  return (
    <svg className="mt-px h-[18px] w-[18px] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg className="h-[22px] w-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="15.5" cy="8.5" r="4.5" />
      <path d="M12.3 11.7 3 21v0M7 17l2.5 2.5" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.47 1.33 4.98L2 22l5.2-1.36a9.9 9.9 0 0 0 4.84 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.9 9.9 0 0 0 12.04 2Zm0 1.82c2.18 0 4.23.85 5.77 2.39a8.1 8.1 0 0 1 2.39 5.76c0 4.5-3.66 8.15-8.16 8.15a8.2 8.2 0 0 1-4.15-1.14l-.3-.18-3.08.81.82-3.01-.19-.31a8.1 8.1 0 0 1-1.25-4.33c0-4.5 3.66-8.14 8.15-8.14Zm-2.4 4.1c-.17 0-.45.07-.69.33-.24.26-.9.88-.9 2.15 0 1.27.92 2.49 1.05 2.66.13.17 1.8 2.86 4.46 3.9 2.21.87 2.66.7 3.14.65.48-.04 1.55-.63 1.77-1.25.22-.61.22-1.14.15-1.25-.06-.11-.24-.17-.5-.3-.26-.13-1.55-.77-1.79-.85-.24-.09-.41-.13-.59.13-.17.26-.67.85-.82 1.02-.15.18-.3.2-.56.07-.26-.13-1.1-.41-2.1-1.3-.78-.69-1.3-1.55-1.45-1.81-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.15.17-.26.26-.44.09-.17.04-.33-.02-.46-.07-.13-.58-1.4-.8-1.92-.21-.5-.42-.44-.58-.44h-.5Z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg className="h-[19px] w-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7.5 8.5 5.5 8.5-5.5" />
    </svg>
  );
}
