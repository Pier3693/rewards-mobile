'use client';

import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getUsuario } from '@/lib/auth';
import Toast from '@/components/Toast';
import {
  FormularioVisita,
  MOTIVOS,
  type Local,
  type Motivo,
} from '@/components/FormularioVisita';
import {
  IconBell,
  IconStore,
  IconSearch,
  IconMapPin,
} from '@/components/icons';

export default function RegistrarPage() {
  const user = getUsuario();
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [query, setQuery] = useState('');
  const [resultados, setResultados] = useState<Local[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [localSel, setLocalSel] = useState<Local | null>(null);
  const [toast, setToast] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  function seleccionarMotivo(m: Motivo) {
    setMotivo(m);
    setQuery('');
    setResultados([]);
  }

  function buscar(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      const tipo = MOTIVOS.find((m) => m.valor === motivo)?.tipo || 'todos';
      const r = await api<Local[]>('buscarComercio', { q: q.trim(), tipo });
      setBuscando(false);
      if (r.ok && r.data) setResultados(r.data);
    }, 400);
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      {/* Header */}
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
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink-2 shadow-sm">
          <IconBell />
        </span>
      </header>

      <h1 className="text-[22px] font-bold">Registrar visita</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-ink-2">
        {motivo ? 'Busca el comercio para continuar' : 'Selecciona el motivo de la visita'}
      </p>

      {/* Paso 1: Motivo */}
      <div className="mb-5 grid grid-cols-2 gap-2.5">
        {MOTIVOS.map((m) => (
          <button
            key={m.valor}
            onClick={() => seleccionarMotivo(m.valor)}
            className={`card flex flex-col items-center gap-2 p-4 !shadow-none transition ${
              motivo === m.valor
                ? 'border-2 border-primary bg-primary-light'
                : 'border border-line'
            }`}
          >
            <span className={motivo === m.valor ? 'text-primary' : 'text-ink-2'}>
              {m.icon}
            </span>
            <span
              className={`text-[13px] font-semibold ${
                motivo === m.valor ? 'text-primary' : 'text-ink'
              }`}
            >
              {m.label}
            </span>
          </button>
        ))}
      </div>

      {/* Paso 2: Buscador (solo si ya eligió motivo) */}
      {motivo && (
        <>
          <div className="relative mb-4">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
              <IconSearch />
            </span>
            <input
              value={query}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar comercio..."
              className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              autoFocus
            />
          </div>

          {buscando && (
            <div className="flex justify-center py-6">
              <div className="spinner" />
            </div>
          )}

          {!buscando && query.trim().length >= 2 && resultados.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-2">
              Sin resultados para &quot;{query}&quot;
            </p>
          )}

          <div className="space-y-2.5">
            {resultados.map((l) => (
              <button
                key={l.id_local}
                onClick={() => setLocalSel(l)}
                className="card flex w-full items-center gap-3 p-3.5 text-left !shadow-none active:scale-[0.99]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
                  <IconStore />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.comercio}</p>
                  <p className="flex items-center gap-1 truncate text-[13px] text-ink-2">
                    <IconMapPin className="h-3.5 w-3.5 shrink-0" />
                    {l.mall_puerta || l.direccion || l.distrito || 'Sin ubicación'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="h-4" />

      {/* Sheet del formulario */}
      {localSel && motivo && (
        <FormularioVisita
          local={localSel}
          motivo={motivo}
          onClose={() => setLocalSel(null)}
          onGuardado={() => {
            setLocalSel(null);
            setMotivo(null);
            setQuery('');
            setResultados([]);
            setToast('¡Visita guardada!');
            setTimeout(() => setToast(''), 3000);
          }}
        />
      )}

      {toast && <Toast mensaje={toast} />}
    </main>
  );
}
