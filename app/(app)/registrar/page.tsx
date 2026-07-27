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
  IconMegaphone,
  IconUsers,
  IconVideo,
  IconSearch,
  IconMapPin,
  IconCamera,
  IconX,
  IconCheck,
  IconAlert,
} from '@/components/icons';

// ══════════════════════════════════════════════════
//  Tipos
// ══════════════════════════════════════════════════
interface Local {
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  distrito: string;
  kam: string;
  ultimo_status?: string;
  [k: string]: unknown;
}

interface Autocompletado {
  id_local: string;
  comercio: string;
  mall_puerta: string;
  direccion: string;
  kam: string;
  procesador_pos: string;
  codigo_openpay: string;
  codigo_niubiz: string;
  codigo_izipay: string;
  beneficios: string;
  material_pop: string;
  contacto_nombre: string;
  contacto_cel: string;
  ultima_visita: string;
  ultimo_status: string;
  ultima_observacion: string;
}

type Motivo = 'Visita' | 'Branding' | 'Capacitación Presencial' | 'Capacitación Virtual';
type Status = 'Todo Ok' | 'Incidencia' | 'Reprogramar' | 'No existe';

const MOTIVOS: { valor: Motivo; label: string; icon: React.ReactNode; tipo: 'pc' | 'cc' | 'todos' }[] = [
  { valor: 'Visita', label: 'Puerta Calle', icon: <IconStore />, tipo: 'pc' },
  { valor: 'Branding', label: 'Branding', icon: <IconMegaphone />, tipo: 'cc' },
  { valor: 'Capacitación Presencial', label: 'Cap. Presencial', icon: <IconUsers />, tipo: 'todos' },
  { valor: 'Capacitación Virtual', label: 'Cap. Virtual', icon: <IconVideo />, tipo: 'todos' },
];

const STATUS_CFG: Record<Status, { bg: string; text: string; icon: React.ReactNode }> = {
  'Todo Ok': { bg: 'bg-ok-light', text: 'text-ok', icon: <IconCheck className="h-4 w-4" /> },
  Incidencia: { bg: 'bg-err-light', text: 'text-err', icon: <IconAlert className="h-4 w-4" /> },
  Reprogramar: { bg: 'bg-warn-light', text: 'text-warn', icon: <IconMapPin className="h-4 w-4" /> },
  'No existe': { bg: 'bg-line', text: 'text-ink-2', icon: <IconX className="h-4 w-4" /> },
};

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

// ══════════════════════════════════════════════════
//  Formulario dentro del Bottom Sheet
// ══════════════════════════════════════════════════
function FormularioVisita({
  local,
  motivo,
  onClose,
  onGuardado,
}: {
  local: Local;
  motivo: Motivo;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [cargandoAuto, setCargandoAuto] = useState(true);
  const [auto, setAuto] = useState<Autocompletado | null>(null);

  const [status, setStatus] = useState<Status | null>(null);
  const [contacto, setContacto] = useState('');
  const [celular, setCelular] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      setCargandoAuto(true);
      const r = await api<Autocompletado>('getAutocompletado', {
        id_local: local.id_local,
      });
      setCargandoAuto(false);
      if (r.ok && r.data) {
        setAuto(r.data);
        setContacto(r.data.contacto_nombre || '');
        setCelular(r.data.contacto_cel || '');
      }
    })();
  }, [local.id_local]);

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
        `${fallidas} foto${fallidas > 1 ? 's' : ''} no se pudo procesar. Intenta tomarla de nuevo con la cámara.`,
      );
    }
  }

  function quitarFoto(i: number) {
    setFotos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    if (!status) {
      setError('Selecciona cómo resultó la visita');
      return;
    }
    setError('');
    setGuardando(true);

    const r = await api('registrarVisita', {
      id_local: local.id_local,
      comercio: local.comercio,
      mall_puerta: local.mall_puerta,
      direccion: local.direccion,
      kam: auto?.kam || local.kam || '',
      procesador: auto?.procesador_pos || '',
      cod_openpay: auto?.codigo_openpay || '',
      cod_niubiz: auto?.codigo_niubiz || '',
      cod_izipay: auto?.codigo_izipay || '',
      beneficios: auto?.beneficios || '',
      material_pop: auto?.material_pop || '',
      motivo,
      contacto,
      celular,
      status,
      observacion,
      fotosBase64: fotos,
    });

    setGuardando(false);

    if (!r.ok) {
      setError(r.error || 'No se pudo guardar la visita');
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
      {cargandoAuto ? (
        <div className="flex justify-center py-10">
          <div className="spinner" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Motivo (fijo, informativo) */}
          <div className="flex items-center gap-2 rounded-xl bg-primary-light px-3.5 py-2.5">
            <span className="text-primary">
              {MOTIVOS.find((m) => m.valor === motivo)?.icon}
            </span>
            <span className="text-[13px] font-semibold text-primary">
              {MOTIVOS.find((m) => m.valor === motivo)?.label}
            </span>
          </div>

          {/* Última visita (contexto) */}
          {auto?.ultima_visita && (
            <div className="rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[12px] text-ink-2">
              Última visita: <strong className="text-ink">{auto.ultima_visita}</strong>
              {auto.ultimo_status && ` · ${auto.ultimo_status}`}
            </div>
          )}

          {/* Status */}
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-2">
              ¿Cómo resultó la visita?
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {(Object.keys(STATUS_CFG) as Status[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-3 text-[13px] font-semibold transition ${
                    status === s
                      ? `${STATUS_CFG[s].bg} ${STATUS_CFG[s].text} border-current`
                      : 'border-line text-ink-2'
                  }`}
                >
                  {STATUS_CFG[s].icon}
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Contacto */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
              Nombre del contacto
            </label>
            <input
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
              placeholder="¿Quién te atendió?"
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2">
              Celular
            </label>
            <input
              value={celular}
              onChange={(e) => setCelular(e.target.value)}
              placeholder="9XXXXXXXX"
              inputMode="numeric"
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
              placeholder="Describe lo que encontraste..."
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
              'Guardar visita'
            )}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
