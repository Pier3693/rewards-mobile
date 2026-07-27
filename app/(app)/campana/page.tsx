'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getUsuario } from '@/lib/auth';
import { comprimirImagen } from '@/lib/img';
import BottomSheet from '@/components/BottomSheet';
import Toast from '@/components/Toast';
import {
  IconBell,
  IconStore,
  IconSearch,
  IconMapPin,
  IconCamera,
  IconX,
  IconMegaphone,
} from '@/components/icons';

interface Local {
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  [k: string]: unknown;
}

const MOTIVOS_CAMPANA = [
  'Branding',
  'Material POP',
  'Capacitación Presencial',
  'Capacitación Virtual',
];

export default function CampanaPage() {
  const user = getUsuario();
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

  function buscar(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      const r = await api<Local[]>('buscarComercio', { q: q.trim(), tipo: 'todos' });
      setBuscando(false);
      if (r.ok && r.data) setResultados(r.data);
    }, 400);
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
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

      <h1 className="text-[22px] font-bold">Registrar campaña</h1>
      <p className="mb-5 mt-0.5 text-[13px] text-ink-2">
        Busca el comercio para comenzar
      </p>

      <div className="relative mb-4">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
          <IconSearch />
        </span>
        <input
          value={query}
          onChange={(e) => buscar(e.target.value)}
          placeholder="Buscar comercio..."
          className="w-full rounded-2xl border border-line bg-white py-3.5 pl-11 pr-4 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
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

      {!query && (
        <div className="card mt-2 p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-light text-primary">
            <IconMegaphone className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Registra una campaña</p>
          <p className="mt-1 text-sm text-ink-2">
            Busca el comercio donde ejecutaste
            <br />
            la campaña o material POP
          </p>
        </div>
      )}

      <div className="h-4" />

      {localSel && (
        <FormularioCampana
          local={localSel}
          onClose={() => setLocalSel(null)}
          onGuardado={() => {
            setLocalSel(null);
            setQuery('');
            setResultados([]);
            setToast('¡Campaña registrada!');
            setTimeout(() => setToast(''), 3000);
          }}
        />
      )}

      {toast && <Toast mensaje={toast} />}
    </main>
  );
}

function FormularioCampana({
  local,
  onClose,
  onGuardado,
}: {
  local: Local;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [trades, setTrades] = useState<string[]>([]);
  const [trade, setTrade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [material, setMaterial] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const r = await api<string[]>('getTradeList');
      if (r.ok && r.data) setTrades(r.data);
    })();
  }, []);

  async function agregarFotos(files: FileList | null) {
    if (!files || !files.length) return;
    const espacio = 4 - fotos.length;
    const seleccion = Array.from(files).slice(0, espacio);
    setComprimiendo(true);
    const nuevas: string[] = [];
    let fallidas = 0;
    for (const f of seleccion) {
      try {
        nuevas.push(await comprimirImagen(f));
      } catch {
        fallidas++;
      }
    }
    setComprimiendo(false);
    setFotos((prev) => [...prev, ...nuevas]);
    if (fallidas > 0) {
      setError(
        `${fallidas} foto${fallidas > 1 ? 's' : ''} no se pudo procesar. Intenta de nuevo.`,
      );
    }
  }

  function quitarFoto(i: number) {
    setFotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    if (!trade) return setError('Selecciona el Trade Marketing');
    if (!motivo) return setError('Selecciona el motivo');
    setError('');
    setGuardando(true);

    const r = await api('registrarCampana', {
      trade,
      motivo,
      mall_puerta: local.mall_puerta || '',
      direccion: local.direccion || '',
      comercio: local.comercio,
      tipo_material: material,
      observacion,
      fotosBase64: fotos,
    });

    setGuardando(false);

    if (!r.ok) {
      setError(r.error || 'No se pudo registrar la campaña');
      return;
    }

    onGuardado();
  }

  return (
    <BottomSheet
      titulo={local.comercio}
      subtitulo={local.mall_puerta || local.direccion}
      onClose={onClose}
    >
      <div className="space-y-5">
        {/* Trade Marketing */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
            Trade Marketing
          </label>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          >
            <option value="">Seleccionar persona...</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Motivo */}
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-2">
            Motivo
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {MOTIVOS_CAMPANA.map((m) => (
              <button
                key={m}
                onClick={() => setMotivo(m)}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition ${
                  motivo === m
                    ? 'border-primary bg-primary-light text-primary'
                    : 'border-line text-ink-2'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Material */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
            Tipo de material
          </label>
          <input
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="Ej: Acrílico, Banner, Díptico..."
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>

        {/* Observaciones */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
            Observaciones
          </label>
          <textarea
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            placeholder="Describe la campaña ejecutada..."
            rows={3}
            className="w-full resize-none rounded-xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
          />
        </div>

        {/* Fotos */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
            Evidencia fotográfica
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => agregarFotos(e.target.files)}
          />
          {fotos.length < 4 && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={comprimiendo}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-line py-5 text-ink-2 transition active:bg-bg"
            >
              <IconCamera className="h-6 w-6" />
              <span className="text-[13px] font-medium">
                {comprimiendo ? 'Procesando...' : 'Toca para agregar fotos'}
              </span>
              <span className="text-[11px]">
                Puedes agregar hasta {4 - fotos.length} más
              </span>
            </button>
          )}
          {fotos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {fotos.map((f, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f}
                    alt={`Foto ${i + 1}`}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <button
                    onClick={() => quitarFoto(i)}
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-err text-white"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-err-light px-4 py-3 text-sm font-medium text-err">
            {error}
          </div>
        )}

        <button
          onClick={guardar}
          disabled={guardando}
          className="btn-grad flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98] disabled:opacity-60"
        >
          {guardando ? (
            <>
              <span className="spinner !h-5 !w-5 !border-white/30 !border-t-white" />
              Guardando...
            </>
          ) : (
            'Guardar campaña'
          )}
        </button>
      </div>
    </BottomSheet>
  );
}
