'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getUsuario } from '@/lib/auth';
import {
  IconBell,
  IconCalendar,
  IconClock,
  IconStore,
  IconRefresh,
  IconCheck,
} from '@/components/icons';

interface Asignacion {
  id_asignacion: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  motivo: string;
  status: string;
  indicaciones: string;
  [k: string]: string;
}

interface DiaData {
  fecha: string;
  pendientes: Asignacion[];
  completadas: Asignacion[];
  total: number;
}

const MOTIVO_COLOR: Record<string, string> = {
  Branding: 'bg-primary-light text-primary',
  Visita: 'bg-teal/10 text-teal',
  'Capacitación Presencial': 'bg-warn-light text-warn',
  'Capacitación Virtual': 'bg-err-light text-err',
};

export default function HoyPage() {
  const user = getUsuario();
  const [data, setData] = useState<DiaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verCompletadas, setVerCompletadas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    const r = await api<DiaData>('getAsignacionesDia');
    setCargando(false);
    if (!r.ok || !r.data) {
      setError(r.error || 'No se pudieron cargar tus visitas');
      return;
    }
    setData(r.data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hoy = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      {/* ── Header ── */}
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-sm font-bold text-white">
            {iniciales}
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-tight">
              Hola, {user?.nombre?.split(' ')[0] || 'CAP'}
            </p>
            <p className="text-xs text-ink-2">Capacitador de campo</p>
          </div>
        </div>
        <span className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-ink-2 shadow-sm">
          <IconBell />
        </span>
      </header>

      {/* ── Título ── */}
      <h1 className="text-[22px] font-bold">Mis visitas</h1>
      <p className="mb-4 mt-0.5 flex items-center gap-1.5 text-[13px] capitalize text-ink-2">
        {hoy}
      </p>

      {/* ── Stats ── */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="card flex items-center justify-between bg-primary-light p-4 !shadow-none">
          <div>
            <p className="text-sm font-semibold text-primary">Hoy</p>
            <p className="text-2xl font-bold text-primary">
              {data ? data.total : '—'}
            </p>
            <p className="text-xs text-primary/70">visitas</p>
          </div>
          <IconCalendar className="h-7 w-7 text-primary/60" />
        </div>
        <div className="card flex items-center justify-between bg-warn-light p-4 !shadow-none">
          <div>
            <p className="text-sm font-semibold text-warn">Pendientes</p>
            <p className="text-2xl font-bold text-warn">
              {data ? data.pendientes.length : '—'}
            </p>
            <p className="text-xs text-warn/70">visitas</p>
          </div>
          <IconClock className="h-7 w-7 text-warn/60" />
        </div>
      </div>

      {/* ── Lista ── */}
      {cargando ? (
        <div className="card grid place-items-center p-10">
          <div className="spinner" />
          <p className="mt-3 text-sm text-ink-2">Cargando...</p>
        </div>
      ) : error ? (
        <div className="card p-6 text-center">
          <p className="text-sm font-medium text-err">{error}</p>
          <button
            onClick={cargar}
            className="mx-auto mt-4 flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
          >
            <IconRefresh className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : !data || data.total === 0 ? (
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-light text-primary">
            <IconCalendar className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Sin visitas programadas</p>
          <p className="mt-1 text-sm text-ink-2">
            No tienes visitas asignadas
            <br />
            para este día
          </p>
          <button
            onClick={cargar}
            className="mx-auto mt-5 flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.98]"
          >
            <IconRefresh className="h-4 w-4" /> Actualizar
          </button>
        </div>
      ) : (
        <>
          {/* Pendientes */}
          {data.pendientes.length > 0 && (
            <>
              <p className="mb-2.5 text-[15px] font-semibold">
                Próximas visitas
              </p>
              <div className="space-y-3">
                {data.pendientes.map((a) => (
                  <TarjetaAsignacion key={a.id_asignacion} a={a} pendiente />
                ))}
              </div>
            </>
          )}

          {/* Completadas (depuradas a sección colapsable) */}
          {data.completadas.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setVerCompletadas(!verCompletadas)}
                className="flex w-full items-center justify-between rounded-xl bg-ok-light px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-ok">
                  <IconCheck className="h-4 w-4" />
                  Completadas ({data.completadas.length})
                </span>
                <span className="text-xs font-medium text-ok">
                  {verCompletadas ? 'Ocultar' : 'Ver'}
                </span>
              </button>
              {verCompletadas && (
                <div className="mt-3 space-y-3 opacity-70">
                  {data.completadas.map((a) => (
                    <TarjetaAsignacion key={a.id_asignacion} a={a} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <div className="h-6" />
    </main>
  );
}

function TarjetaAsignacion({
  a,
  pendiente = false,
}: {
  a: Asignacion;
  pendiente?: boolean;
}) {
  const motivoCls = MOTIVO_COLOR[a.motivo] || 'bg-line text-ink-2';

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
          <IconStore />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{a.comercio}</p>
          <p className="truncate text-[13px] text-ink-2">
            {a.mall_puerta || a.direccion || a.distrito || '—'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {pendiente ? (
              <span className="rounded-full bg-warn-light px-2.5 py-0.5 text-[11px] font-semibold text-warn">
                Pendiente
              </span>
            ) : (
              <span className="rounded-full bg-ok-light px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                Completada
              </span>
            )}
            {a.motivo && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${motivoCls}`}
              >
                {a.motivo === 'Visita' ? 'Puerta Calle' : a.motivo}
              </span>
            )}
          </div>
          {a.indicaciones && (
            <p className="mt-2 line-clamp-2 text-xs text-ink-2">
              {a.indicaciones}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
