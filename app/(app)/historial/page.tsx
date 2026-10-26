'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMisVisitas,
  historialEnCopia,
  unirConCola,
  agruparPorDia,
  filtrarPorStatus,
  contarPorStatus,
  parsearFecha,
  tituloDeDia,
  fotosDe,
  diaDeHoy,
  type VisitaApi,
  type VisitaHistorial,
  type FiltroStatus,
} from '@/lib/historial';
import { useCola } from '@/lib/useCola';
import {
  STATUS_LISTA,
  STATUS_CLS,
  MOTIVO_CLS,
  normalizarStatus,
  separarObservacion,
  type Motivo,
} from '@/lib/visita';
import { ubicacionDe } from '@/lib/ruta';
import { horaDe } from '@/lib/texto';
import BottomSheet from '@/components/BottomSheet';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import { IconRefresh, IconImage, IconStore, IconCalendar } from '@/components/icons';

const FILTROS: { valor: FiltroStatus; label: string }[] = [
  { valor: 'todas', label: 'Todas' },
  ...STATUS_LISTA.map((s) => ({ valor: s as FiltroStatus, label: s })),
];

export default function HistorialPage() {
  const router = useRouter();
  const cola = useCola();
  const [datos, setDatos] = useState<VisitaApi[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  /** Cuándo se guardó la copia en uso. 0 si los datos son frescos. */
  const [copiaDeLas, setCopiaDeLas] = useState(0);
  const [filtro, setFiltro] = useState<FiltroStatus>('todas');
  const [abierta, setAbierta] = useState<VisitaHistorial | null>(null);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    setError('');
    const r = await getMisVisitas(forzar);
    setCargando(false);
    if (!r.ok || !r.data) {
      setError(r.error || 'No se pudo cargar tu historial');
      return;
    }
    setDatos(r.data);
    setCopiaDeLas(r.deCache ? r.guardadoEn || 0 : 0);
  }, []);

  useEffect(() => {
    // Lo guardado en el celular se pinta ya; la versión fresca llega detrás.
    const copia = historialEnCopia();
    if (copia) setDatos(copia.data);
    cargar();
  }, [cargar]);

  // Cuando la cola envía algo, el backend ya lo tiene: se vuelve a pedir
  // y la visita pasa de "pendiente" a la lista, sin duplicarse.
  const enColaAntes = useRef(0);
  useEffect(() => {
    const ahora = cola.visitas.length;
    const bajo = ahora < enColaAntes.current;
    enColaAntes.current = ahora;
    if (bajo) cargar(true);
  }, [cola.visitas.length, cargar]);

  const hoy = useMemo(() => diaDeHoy(), []);
  const { pendientes, enviadas } = useMemo(
    () => unirConCola(datos || [], cola.visitas),
    [datos, cola.visitas],
  );
  const conteos = useMemo(() => contarPorStatus([...pendientes, ...enviadas]), [pendientes, enviadas]);
  const pendientesFiltradas = useMemo(() => filtrarPorStatus(pendientes, filtro), [pendientes, filtro]);
  const grupos = useMemo(
    () => agruparPorDia(filtrarPorStatus(enviadas, filtro), hoy),
    [enviadas, filtro, hoy],
  );

  const sinNada = !!datos && pendientes.length + enviadas.length === 0;
  const filtroVacio = !sinNada && pendientesFiltradas.length === 0 && grupos.length === 0;

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold">Historial</h1>
        <button
          onClick={() => cargar(true)}
          disabled={cargando}
          aria-label="Actualizar"
          className="grid h-11 w-11 place-items-center rounded-full text-ink-2 disabled:opacity-60"
        >
          <IconRefresh className={`h-5 w-5 ${cargando ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {copiaDeLas > 0 && (
        <p className="mb-3 rounded-xl bg-warn-light px-3.5 py-2.5 text-center text-[12.5px] font-medium text-warn">
          Sin conexión: datos guardados a las {horaDe(copiaDeLas)}.
        </p>
      )}

      {/* ── Filtro ── */}
      {datos && !sinNada && (
        <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1">
          {FILTROS.map((f) => {
            const activo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                onClick={() => setFiltro(f.valor)}
                className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition ${
                  activo ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink-2'
                }`}
              >
                {f.label}
                <span className={activo ? 'text-white/80' : 'text-ink-2/70'}>{conteos[f.valor]}</span>
              </button>
            );
          })}
        </div>
      )}

      {!datos && cargando ? (
        <Esqueleto />
      ) : !datos && error ? (
        <ErrorDeCarga detalle={error} onReintentar={() => cargar(true)} onVolver={() => router.back()} />
      ) : sinNada ? (
        <div className="card p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-light text-primary">
            <IconCalendar className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Todavía no registras visitas</p>
          <p className="mt-1 text-sm text-ink-2">Aquí verás cada visita que guardes.</p>
          <button
            onClick={() => router.push('/registrar')}
            className="btn-grad mx-auto mt-5 min-h-11 rounded-xl px-5 text-sm font-semibold text-white"
          >
            Registrar visita
          </button>
        </div>
      ) : filtroVacio ? (
        <div className="card p-6 text-center">
          <p className="font-semibold">No hay visitas con «{filtro}»</p>
          <button onClick={() => setFiltro('todas')} className="mt-3 min-h-11 px-4 text-sm font-semibold text-primary">
            Ver todas
          </button>
        </div>
      ) : (
        <>
          {pendientesFiltradas.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-warn">
                Pendiente de envío
              </h2>
              <div className="space-y-2.5">
                {pendientesFiltradas.map((v) => (
                  <Tarjeta key={v.id_visita} v={v} onTap={() => setAbierta(v)} />
                ))}
              </div>
            </section>
          )}

          {grupos.map((g) => (
            <section key={g.clave} className="mb-5">
              <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">
                {g.titulo}
              </h2>
              <div className="space-y-2.5">
                {g.visitas.map((v, i) => (
                  <Tarjeta key={v.id_visita || `${g.clave}-${i}`} v={v} onTap={() => setAbierta(v)} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      <div className="h-6" />

      {abierta && (
        <Detalle
          v={abierta}
          titulo={tituloDetalle(abierta, hoy)}
          onClose={() => setAbierta(null)}
          onVerLocal={(id) => router.push(`/local/${encodeURIComponent(id)}`)}
        />
      )}
    </main>
  );
}

function tituloDetalle(v: VisitaHistorial, hoy: ReturnType<typeof diaDeHoy>): string {
  const m = parsearFecha(v.fecha);
  if (!m) return '';
  return [tituloDeDia(m, hoy), m.hora].filter(Boolean).join(' · ');
}

// ── Chips ─────────────────────────────────────────

function ChipMotivo({ motivo }: { motivo: string }) {
  if (!motivo) return null;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        MOTIVO_CLS[motivo as Motivo] || 'bg-gris-light text-ink-2'
      }`}
    >
      {motivo}
    </span>
  );
}

function ChipStatus({ status }: { status: string }) {
  const s = normalizarStatus(status);
  if (!s) return null;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_CLS[s].suave}`}>{s}</span>
  );
}

function ChipPendiente() {
  return (
    <span className="rounded-full bg-warn-light px-2.5 py-0.5 text-[11px] font-semibold text-warn">
      Pendiente de envío
    </span>
  );
}

// ── Tarjeta ───────────────────────────────────────

function Tarjeta({ v, onTap }: { v: VisitaHistorial; onTap: () => void }) {
  const hora = parsearFecha(v.fecha)?.hora || '';
  return (
    <button onClick={onTap} className="card block w-full p-3.5 text-left transition active:scale-[0.99]">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold">{v.comercio || 'Sin comercio'}</p>
        {hora && <span className="shrink-0 text-[12.5px] text-ink-2">{hora}</span>}
      </div>
      <p className="truncate text-[12.5px] text-ink-2">{ubicacionDe(v)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <ChipMotivo motivo={v.motivo} />
        <ChipStatus status={v.status} />
        {v.pendiente && <ChipPendiente />}
      </div>
    </button>
  );
}

// ── Detalle ───────────────────────────────────────

function Detalle({
  v,
  titulo,
  onClose,
  onVerLocal,
}: {
  v: VisitaHistorial;
  titulo: string;
  onClose: () => void;
  onVerLocal: (id: string) => void;
}) {
  const { tipo, texto } = separarObservacion(v.observacion);
  const { fotos, nota } = fotosDe(v.fotos);
  const base64 = v.fotosBase64 || [];

  return (
    <BottomSheet titulo={v.comercio || 'Visita'} subtitulo={titulo} onClose={onClose}>
      <p className="text-[13px] text-ink-2">{ubicacionDe(v)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <ChipMotivo motivo={v.motivo} />
        <ChipStatus status={v.status} />
        {v.pendiente && <ChipPendiente />}
      </div>
      {v.pendiente && (
        <p className="mt-3 rounded-xl bg-warn-light px-3.5 py-2.5 text-[12.5px] text-warn">
          Guardada en el celular. Se enviará sola al recuperar señal.
        </p>
      )}

      <h3 className="mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-2">Observación</h3>
      {tipo && (
        <span className="mb-1.5 inline-block rounded-full bg-err-light px-2.5 py-0.5 text-[11px] font-semibold text-err">
          {tipo}
        </span>
      )}
      <p className="whitespace-pre-line text-[14px]">{texto || 'Sin observaciones.'}</p>

      <h3 className="mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-2">Fotos</h3>
      {base64.length + fotos.length === 0 ? (
        <p className="text-[14px] text-ink-2">{nota || 'Sin fotos.'}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {base64.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- base64 local, sin optimizar
              <img key={i} src={src} alt={`Foto ${i + 1}`} className="aspect-square w-full rounded-xl object-cover" />
            ))}
            {fotos.map((f, i) => (
              <Miniatura key={f.url} url={f.url} miniatura={f.miniatura} n={i + 1} />
            ))}
          </div>
          {nota && <p className="mt-2 text-[12.5px] text-ink-2">{nota}</p>}
        </>
      )}

      {v.id_local && (
        <button
          onClick={() => onVerLocal(v.id_local)}
          className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-line bg-white text-[14px] font-semibold text-ink active:scale-[0.98]"
        >
          <IconStore className="h-[18px] w-[18px]" /> Ver local
        </button>
      )}
    </BottomSheet>
  );
}

/** Abre la foto en Drive. Si la miniatura no carga (sin permiso, sin señal), un ícono. */
function Miniatura({ url, miniatura, n }: { url: string; miniatura: string; n: number }) {
  const [fallo, setFallo] = useState(!miniatura);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir foto ${n} en Drive`}
      className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-gris-light text-ink-2"
    >
      {fallo ? (
        <IconImage className="h-6 w-6" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura de Drive, sin next/image
        <img
          src={miniatura}
          alt={`Foto ${n}`}
          onError={() => setFallo(true)}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </a>
  );
}

function Esqueleto() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-20 rounded bg-line" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[86px] rounded-2xl bg-line/50" />
      ))}
    </div>
  );
}
