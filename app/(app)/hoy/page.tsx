'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUsuario, clearSession, marcarSesionExpirada } from '@/lib/auth';
import { useCola } from '@/lib/useCola';
import {
  getRutaDeHoy,
  invalidarRutaDeHoy,
  paradasDelDia,
  aplicarEncoladasAlDia,
  rutaActualizadaEn,
  rutaNecesitaRefresco,
  precargarLocalesDelDia,
  type DiaData,
} from '@/lib/cacheDia';
import { haceCuanto } from '@/lib/texto';
import {
  ordenarRuta,
  minutosHasta,
  textoEspera,
  enlaceMeet,
  tieneMeet,
  meetEsUrgente,
  enlaceMapa,
  esVirtual,
  ubicacionDe,
  indicacionesLimpias,
  estaCompletada,
  estaPendienteDeEnvio,
  estadoTemporal,
  textoEstado,
  siguienteParada,
  saludoPorHora,
  fechaLarga,
  type Parada,
} from '@/lib/ruta';
import {
  IconCalendar,
  IconRefresh,
  IconCheck,
  IconVideo,
  IconPlay,
  IconNavigation,
  IconClock,
} from '@/components/icons';

// ── Paleta de motivos ─────────────────────────────
// Nunca comparte color con un resultado: verde, rojo, ámbar y gris
// están reservados para Todo Ok / Incidencia / Reprogramar / No existe.
const MOTIVO_CLS: Record<string, string> = {
  Visita: 'bg-motivo-visita-light text-motivo-visita',
  Branding: 'bg-motivo-branding-light text-motivo-branding',
  'Capacitación Presencial': 'bg-motivo-presencial-light text-motivo-presencial',
  'Capacitación Virtual': 'bg-motivo-virtual-light text-motivo-virtual',
};
const MOTIVO_PUNTO: Record<string, string> = {
  Visita: 'bg-motivo-visita',
  Branding: 'bg-motivo-branding',
  'Capacitación Presencial': 'bg-motivo-presencial',
  'Capacitación Virtual': 'bg-motivo-virtual',
};

// ── Paleta de resultados ──────────────────────────
const RESULTADO_CLS: Record<string, string> = {
  'Todo Ok': 'bg-ok-light text-ok',
  Incidencia: 'bg-err-light text-err',
  Reprogramar: 'bg-warn-light text-warn',
  'No existe': 'bg-gris-light text-ink-2',
};
const RESULTADO_PUNTO: Record<string, string> = {
  'Todo Ok': 'bg-ok',
  Incidencia: 'bg-err',
  Reprogramar: 'bg-warn',
  'No existe': 'bg-ink-2',
};

/**
 * Resultado de la visita, normalizado al texto canónico.
 *
 * Solo cuenta si la asignación está completada: si un admin la reabre
 * desde el escritorio, la columna conserva el resultado anterior y la
 * parada volvería a pintarse como hecha aunque esté pendiente.
 */
function resultadoDe(p: Parada): string {
  if (!estaCompletada(p)) return '';
  const r = String(p.resultado || '').trim();
  return (
    Object.keys(RESULTADO_CLS).find(
      (k) => k.toLowerCase() === r.toLowerCase(),
    ) || ''
  );
}

export default function HoyPage() {
  const router = useRouter();
  const user = getUsuario();
  const [data, setData] = useState<DiaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  // Se refresca cada minuto para que "en 25 min" no quede congelado.
  const [ahora, setAhora] = useState(() => new Date());

  /** Cuándo se trajo la ruta del backend, para decirlo bajo la lista. */
  const [actualizadaEn, setActualizadaEn] = useState(0);
  /** Se está pidiendo la ruta fresca mientras se enseña la copia. */
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback(async (forzar = false) => {
    setCargando(true);
    setError('');
    const r = await getRutaDeHoy(forzar);
    setCargando(false);
    if (!r.ok || !r.data) {
      setError(r.error || 'No se pudieron cargar tus visitas');
      return;
    }
    setData(r.data);
    setActualizadaEn(rutaActualizadaEn());

    // Lo que se pintó es la copia del celular: se enseña ya y se pide la
    // fresca por detrás. Si no hay señal, se queda la copia.
    if (rutaNecesitaRefresco()) {
      setActualizando(true);
      const fresca = await getRutaDeHoy(true);
      setActualizando(false);
      if (fresca.ok && fresca.data) setData(fresca.data);
      setActualizadaEn(rutaActualizadaEn());
    }
  }, []);

  /** Vuelve a preguntarle al backend, ignorando la caché. */
  const recargar = useCallback(() => {
    invalidarRutaDeHoy();
    cargar(true);
  }, [cargar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const cola = useCola();
  const encoladas = useMemo(() => cola.visitas.map((v) => v.resumen), [cola.visitas]);

  // Toda la ruta en un solo hilo, ordenada por hora. Las visitas en cola
  // cuentan como hechas: para el CAP el trabajo ya está.
  const ruta = useMemo(
    () => ordenarRuta(paradasDelDia(aplicarEncoladasAlDia(data, encoladas))),
    [data, encoladas],
  );

  // Cuando la cola envía algo, la ruta del backend ya lo tiene: se pide
  // de nuevo, o la parada volvería a salir pendiente.
  const enColaAntes = useRef(0);
  useEffect(() => {
    const ahoraEnCola = cola.visitas.length;
    const bajo = ahoraEnCola < enColaAntes.current;
    enColaAntes.current = ahoraEnCola;
    if (!bajo) return;
    getRutaDeHoy(true).then((r) => {
      if (r.ok && r.data) setData(r.data);
      setActualizadaEn(rutaActualizadaEn());
    });
  }, [cola.visitas.length]);

  // Con señal, se guardan en el celular los locales de la ruta para que
  // el detalle y el registro abran sin conexión.
  useEffect(() => {
    if (!data || actualizando || navigator.onLine === false) return;
    precargarLocalesDelDia(ruta.map((p) => p.id_local || ''));

    // Y el service worker guarda sus páginas: /local y /visita son
    // dinámicas, así que solo abren sin señal si ya se visitaron o se
    // guardaron aquí.
    const rutas = [
      ...new Set(
        ruta.flatMap((p) =>
          p.id_local
            ? [
                `/local/${encodeURIComponent(p.id_local)}`,
                `/visita/${encodeURIComponent(p.id_local)}`,
              ]
            : [],
        ),
      ),
    ];
    navigator.serviceWorker?.controller?.postMessage({ tipo: 'precalentar', rutas });
  }, [data, ruta, actualizando]);

  const siguiente = useMemo(() => siguienteParada(ruta, ahora), [ruta, ahora]);

  const avance = useMemo(() => {
    const total = ruta.length;
    const hechas = ruta.filter(estaCompletada).length;
    // Los contadores por resultado dependen de la columna `resultado` de
    // la hoja. Si no está, se muestra solo hechas / total y por hacer.
    const porResultado = new Map<string, number>();
    ruta.forEach((p) => {
      const r = resultadoDe(p);
      if (r) porResultado.set(r, (porResultado.get(r) || 0) + 1);
    });
    return {
      total,
      hechas,
      pendientes: total - hechas,
      pct: total ? Math.round((hechas / total) * 100) : 0,
      porResultado: [...porResultado.entries()],
    };
  }, [ruta]);

  /**
   * El detalle de una parada es el mismo del local, para no tener dos
   * pantallas distintas. Sin id_local no hay a donde navegar: entonces
   * se abre el registro, que es la unica accion util.
   */
  function abrirParada(p: Parada) {
    if (p.id_local) router.push(`/local/${encodeURIComponent(p.id_local)}`);
  }

  /** Entra directo al registro, con la asignación para que quede completada. */
  function registrar(p: Parada) {
    if (!p.id_local) return;
    const asg = p.id_asignacion ? `?asg=${encodeURIComponent(p.id_asignacion)}` : '';
    router.push(`/visita/${encodeURIComponent(p.id_local)}${asg}`);
  }

  const iniciales = (user?.nombre || 'C')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <main className="mx-auto max-w-md px-5 pt-5 safe-t">
      {/* ── Saludo ── */}
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
          {iniciales}
        </span>
        <div className="min-w-0">
          <p className="text-[12.5px] text-ink-2">{fechaLarga(ahora)}</p>
          <h1 className="truncate text-[21px] font-bold leading-tight">
            {saludoPorHora(ahora)}, {user?.nombre?.split(' ')[0] || 'CAP'}
          </h1>
        </div>
      </header>

      {cola.leida && (
        <EstadoEnvio
          pendientes={cola.visitas.length}
          enviando={cola.enCurso}
          sesionVencida={cola.sesionVencida}
          onReintentar={cola.reintentar}
          onIniciarSesion={() => {
            marcarSesionExpirada();
            clearSession();
            router.replace('/login');
          }}
        />
      )}

      {cargando ? (
        <Esqueleto />
      ) : error ? (
        <div className="card p-6 text-center">
          <p className="text-sm font-medium text-err">{error}</p>
          <button
            onClick={recargar}
            className="mx-auto mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
          >
            <IconRefresh className="h-4 w-4" /> Reintentar
          </button>
        </div>
      ) : ruta.length === 0 ? (
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
            onClick={recargar}
            className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white active:scale-[0.98]"
          >
            <IconRefresh className="h-4 w-4" /> Actualizar
          </button>
        </div>
      ) : (
        <>
          <TarjetaAvance {...avance} />

          {siguiente && (
            <SiguienteVisita
              p={siguiente}
              ahora={ahora}
              onIniciar={() => registrar(siguiente)}
            />
          )}

          <div className="mb-3 mt-6 flex items-center justify-between gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-ink-2">
              Ruta del día
            </h2>
            {actualizadaEn > 0 && (
              <button
                onClick={recargar}
                disabled={actualizando}
                className="flex min-h-11 items-center gap-1.5 text-[12px] text-ink-2 disabled:opacity-60"
              >
                <IconRefresh className={`h-3.5 w-3.5 ${actualizando ? 'animate-spin' : ''}`} />
                {actualizando
                  ? 'Actualizando…'
                  : `Actualizado ${haceCuanto(actualizadaEn, ahora.getTime())}`}
              </button>
            )}
          </div>
          <ol className="relative">
            {ruta.map((p, i) => (
              <Fila
                key={p.id_asignacion || `${p.id_local}-${i}`}
                p={p}
                ahora={ahora}
                ultima={i === ruta.length - 1}
                onTap={() => abrirParada(p)}
              />
            ))}
          </ol>
        </>
      )}

      <div className="h-6" />

    </main>
  );
}

// ══════════════════════════════════════════════════
//  Estado del envío: Sincronizado / N pendientes
// ══════════════════════════════════════════════════

/** iPhone en Safari, sin instalar: el navegador puede borrar lo guardado. */
function esSafariSinInstalar(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches;
  return ios && !instalada;
}

function EstadoEnvio({
  pendientes,
  enviando,
  sesionVencida,
  onReintentar,
  onIniciarSesion,
}: {
  pendientes: number;
  enviando: boolean;
  sesionVencida: boolean;
  onReintentar: () => void;
  onIniciarSesion: () => void;
}) {
  if (!pendientes) {
    return (
      <p className="-mt-2 mb-4 flex items-center gap-1.5 text-[12.5px] font-medium text-ok">
        <IconCheck className="h-3.5 w-3.5" /> Sincronizado
      </p>
    );
  }

  const cuantas = `${pendientes} ${pendientes === 1 ? 'visita' : 'visitas'}`;

  return (
    <div className="mb-4 rounded-2xl bg-warn-light px-4 py-3 text-warn">
      <p className="text-[13.5px] font-semibold">
        {sesionVencida
          ? `Tu sesión venció: inicia sesión para enviar ${cuantas}.`
          : `${cuantas} ${pendientes === 1 ? 'pendiente' : 'pendientes'} de envío`}
      </p>
      {!sesionVencida && (
        <p className="mt-0.5 text-[12px]">
          Están guardadas en el celular y se envían solas al haber señal.
        </p>
      )}
      {esSafariSinInstalar() && (
        <p className="mt-1 text-[12px] font-semibold">
          Instala la app en tu pantalla de inicio para no perder visitas guardadas.
        </p>
      )}
      <button
        onClick={sesionVencida ? onIniciarSesion : onReintentar}
        disabled={enviando}
        className="mt-2.5 flex min-h-11 items-center gap-2 rounded-xl bg-warn px-4 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {sesionVencida ? (
          'Iniciar sesión'
        ) : (
          <>
            <IconRefresh className={`h-4 w-4 ${enviando ? 'animate-spin' : ''}`} />
            {enviando ? 'Enviando…' : 'Reintentar ahora'}
          </>
        )}
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  Tarjeta de avance con anillo de porcentaje
// ══════════════════════════════════════════════════
function TarjetaAvance({
  total,
  hechas,
  pendientes,
  pct,
  porResultado,
}: {
  total: number;
  hechas: number;
  pendientes: number;
  pct: number;
  porResultado: [string, number][];
}) {
  const R = 26;
  const circ = 2 * Math.PI * R;

  return (
    <section className="btn-grad rounded-2xl p-4 text-white shadow-lg shadow-primary/25">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] text-white/80">Tu avance de hoy</p>
          <p className="mt-0.5 text-[15px] font-semibold">
            <span className="text-[28px] font-bold leading-none">{hechas}</span>
            <span className="text-white/85"> de {total} visitas</span>
          </p>
        </div>

        <svg
          className="h-[68px] w-[68px] shrink-0 -rotate-90"
          viewBox="0 0 64 64"
          role="img"
          aria-label={`${pct}% completado`}
        >
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,.28)"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={R}
            fill="none"
            stroke="#fff"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct / 100)}
          />
          <text
            x="32"
            y="32"
            transform="rotate(90 32 32)"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            fontSize="15"
            fontWeight="700"
          >
            {pct}%
          </text>
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {porResultado.map(([nombre, n]) => (
          <span
            key={nombre}
            className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold"
          >
            {n} {nombre}
          </span>
        ))}
        {pendientes > 0 && (
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold">
            {pendientes} por hacer
          </span>
        )}
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════
//  Siguiente visita
// ══════════════════════════════════════════════════
function SiguienteVisita({
  p,
  ahora,
  onIniciar,
}: {
  p: Parada;
  ahora: Date;
  onIniciar: () => void;
}) {
  const min = minutosHasta(p.hora, ahora);
  const espera = textoEspera(min);
  const meet = enlaceMeet(p);
  const urgente = tieneMeet(p) && meetEsUrgente(p, ahora);
  const estado = estadoTemporal(p, ahora);
  const virtual = esVirtual(p);

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">
        Siguiente visita
      </h2>

      <div className="card border border-primary/25 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
              estado === 'atrasada'
                ? 'bg-gris-light text-ink'
                : 'bg-primary-light text-primary'
            }`}
          >
            <IconClock className="h-3.5 w-3.5" />
            {textoEstado(p, ahora)}
            {estado === 'programada' && espera && (
              <span className="font-medium">· {espera}</span>
            )}
          </span>
        </div>

        <p className="text-[17px] font-bold leading-tight">{p.comercio}</p>
        <p className="mt-0.5 text-[13px] text-ink-2">{ubicacionDe(p)}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <ChipMotivo motivo={p.motivo} />
          {p.id_local && (
            <span className="rounded-full bg-gris-light px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
              {p.id_local}
            </span>
          )}
        </div>

        {indicacionesLimpias(p) && (
          <p className="mt-2.5 rounded-xl bg-gris-light px-3 py-2 text-[12.5px] text-ink">
            {indicacionesLimpias(p)}
          </p>
        )}

        <div className="mt-3.5 flex gap-2">
          {/* En una capacitación virtual no hay a dónde ir: su lugar lo
              ocupa el botón de la reunión. */}
          {virtual ? (
            meet && (
              <a
                href={meet}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] ${
                  urgente
                    ? 'bg-motivo-virtual text-white'
                    : 'bg-motivo-virtual-light text-motivo-virtual'
                }`}
              >
                <IconVideo className="h-[18px] w-[18px]" />
                {urgente ? 'Unirse ahora' : 'Unirse'}
              </a>
            )
          ) : (
            <a
              href={enlaceMapa(p)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-light text-[14px] font-semibold text-primary active:scale-[0.98]"
            >
              <IconNavigation className="h-[18px] w-[18px]" />
              Cómo llegar
            </a>
          )}
          <button
            onClick={onIniciar}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-semibold text-white active:scale-[0.98]"
          >
            <IconPlay className="h-[18px] w-[18px]" />
            Iniciar visita
          </button>
        </div>
      </div>
    </section>
  );
}

// ══════════════════════════════════════════════════
//  Una parada de la línea de tiempo
// ══════════════════════════════════════════════════
function Fila({
  p,
  ahora,
  ultima,
  onTap,
}: {
  p: Parada;
  ahora: Date;
  ultima: boolean;
  onTap: () => void;
}) {
  const hecha = estaCompletada(p);
  const resultado = resultadoDe(p);
  const meet = enlaceMeet(p);
  const urgente = !hecha && tieneMeet(p) && meetEsUrgente(p, ahora);
  const estado = estadoTemporal(p, ahora);

  const punto = hecha
    ? RESULTADO_PUNTO[resultado] || 'bg-ink-2'
    : MOTIVO_PUNTO[p.motivo] || 'bg-ink-2';

  return (
    <li className="relative flex gap-3 pb-3">
      {/* Riel de la línea de tiempo */}
      <div className="flex w-6 shrink-0 flex-col items-center">
        <span
          className={`mt-4 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white ${punto}`}
        >
          {hecha ? <IconCheck className="h-3.5 w-3.5" /> : null}
        </span>
        {!ultima && <span className="mt-1 w-px flex-1 bg-line" />}
      </div>

      {/* La tarjeta es un div y no un button: el enlace de Meet va dentro,
          y un <a> dentro de un <button> es HTML invalido. */}
      <div className={`card min-w-0 flex-1 p-3.5 ${hecha ? 'opacity-60' : ''}`}>
        <button
          onClick={onTap}
          className="w-full text-left transition active:scale-[0.99]"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 truncate font-semibold">{p.comercio}</p>
            {/* Sin hora no se escribe nada: "Hora flexible" en cada fila
                era ruido. En la tarjeta de siguiente visita si se muestra. */}
            {estado !== 'flexible' && (
              <span
                className={`shrink-0 text-[12px] font-semibold ${
                  estado === 'atrasada'
                    ? 'rounded-full bg-gris-light px-2 py-0.5 text-ink'
                    : estado === 'en-curso'
                    ? 'rounded-full bg-primary-light px-2 py-0.5 text-primary'
                    : 'text-ink-2'
                }`}
              >
                {textoEstado(p, ahora)}
              </span>
            )}
          </div>

          <p className="mt-0.5 truncate text-[12.5px] text-ink-2">
            {ubicacionDe(p)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ChipMotivo motivo={p.motivo} />
            {hecha && resultado && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${RESULTADO_CLS[resultado]}`}
              >
                {resultado}
              </span>
            )}
            {hecha && !resultado && (
              <span className="rounded-full bg-ok-light px-2.5 py-0.5 text-[11px] font-semibold text-ok">
                Hecha
              </span>
            )}
            {estaPendienteDeEnvio(p) && (
              <span className="rounded-full bg-warn-light px-2.5 py-0.5 text-[11px] font-semibold text-warn">
                Pendiente de envío
              </span>
            )}
          </div>
        </button>

        {!hecha && meet && (
          <a
            href={meet}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-2.5 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold active:scale-[0.98] ${
              urgente
                ? 'bg-motivo-virtual text-white'
                : 'bg-motivo-virtual-light text-motivo-virtual'
            }`}
          >
            <IconVideo className="h-4 w-4" />
            {urgente ? 'Unirse ahora' : 'Unirse'}
          </a>
        )}
      </div>
    </li>
  );
}

function ChipMotivo({ motivo }: { motivo: string }) {
  if (!motivo) return null;
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        MOTIVO_CLS[motivo] || 'bg-gris-light text-ink-2'
      }`}
    >
      {motivo}
    </span>
  );
}

// ── Esqueleto de carga ────────────────────────────
function Esqueleto() {
  return (
    <div className="animate-pulse">
      <div className="h-[104px] rounded-2xl bg-line" />
      <div className="mt-5 h-[190px] rounded-2xl bg-line/70" />
      <div className="mt-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[86px] rounded-2xl bg-line/50" />
        ))}
      </div>
    </div>
  );
}
