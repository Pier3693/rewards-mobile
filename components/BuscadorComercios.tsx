'use client';

// ══════════════════════════════════════════════════
//  Buscador de comercios reutilizable
//
//  Lo usan la pestaña Buscar y la pantalla Registrar.
//  Quien lo monta decide qué hacer al elegir un local.
// ══════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getRutaDeHoy, paradasDelDia } from '@/lib/cacheDia';
import {
  FILTROS,
  MIN_LETRAS,
  MS_ESPERA,
  TOPE_RESULTADOS,
  crearControlDeCarrera,
  agregarReciente,
  leerRecientes,
  guardarRecientes,
  borrarRecientes,
  type TipoLocal,
} from '@/lib/busqueda';
import {
  avisoUltimaVisita,
  ultimaFueIncidencia,
  type LocalCompleto,
} from '@/lib/locales';
import { partirPorCoincidencia, tituloBonito } from '@/lib/texto';
import {
  IconSearch,
  IconStore,
  IconX,
  IconChevronRight,
  IconClock,
} from '@/components/icons';

export default function BuscadorComercios({
  onElegir,
  autoFocus = true,
}: {
  onElegir: (local: LocalCompleto) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [tipo, setTipo] = useState<TipoLocal>('todos');
  const [resultados, setResultados] = useState<LocalCompleto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [buscado, setBuscado] = useState(false);
  const [recientes, setRecientes] = useState<string[]>([]);
  /** id_local de los comercios asignados hoy, para el chip de la ruta. */
  const [idsDeHoy, setIdsDeHoy] = useState<Set<string>>(new Set());

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Descarta las respuestas que llegan tarde: si la de "par" vuelve
  // después de la de "pardos", se ignora.
  const carrera = useRef(crearControlDeCarrera());

  useEffect(() => {
    setRecientes(leerRecientes());
    getRutaDeHoy().then((r) => {
      if (!r.ok || !r.data) return;
      setIdsDeHoy(
        new Set(
          paradasDelDia(r.data)
            .map((p) => String(p.id_local || '').trim().toUpperCase())
            .filter(Boolean),
        ),
      );
    });
  }, []);

  const lanzar = useCallback(async (texto: string, filtro: TipoLocal) => {
    const q = texto.trim();
    if (q.length < MIN_LETRAS) {
      setResultados([]);
      setBuscado(false);
      return;
    }

    const numero = carrera.current.iniciar();
    setBuscando(true);
    setError('');

    const r = await api<LocalCompleto[]>('buscarComercio', { q, tipo: filtro });

    if (!carrera.current.esVigente(numero)) return; // respuesta vieja

    setBuscando(false);
    setBuscado(true);
    if (!r.ok || !r.data) {
      setError(r.error || 'No se pudo buscar. Intenta de nuevo.');
      setResultados([]);
      return;
    }
    setResultados(r.data);

    const nuevas = agregarReciente(leerRecientes(), q);
    guardarRecientes(nuevas);
    setRecientes(nuevas);
  }, []);

  function escribir(texto: string) {
    setQuery(texto);
    if (temporizador.current) clearTimeout(temporizador.current);
    if (texto.trim().length < MIN_LETRAS) {
      carrera.current.iniciar(); // invalida lo que esté en vuelo
      setResultados([]);
      setBuscado(false);
      setBuscando(false);
      return;
    }
    temporizador.current = setTimeout(() => lanzar(texto, tipo), MS_ESPERA);
  }

  function cambiarFiltro(nuevo: TipoLocal) {
    setTipo(nuevo);
    if (query.trim().length >= MIN_LETRAS) lanzar(query, nuevo);
  }

  function limpiar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    carrera.current.iniciar();
    setQuery('');
    setResultados([]);
    setBuscado(false);
    setError('');
  }

  const topeAlcanzado = resultados.length >= TOPE_RESULTADOS;
  const sinTexto = query.trim().length < MIN_LETRAS;

  return (
    <>
      {/* ── Campo ── */}
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2">
          <IconSearch />
        </span>
        <label htmlFor="buscar" className="sr-only">
          Buscar comercio por nombre, dirección o distrito
        </label>
        <input
          id="buscar"
          value={query}
          onChange={(e) => escribir(e.target.value)}
          placeholder="Nombre, dirección o distrito"
          autoComplete="off"
          autoCapitalize="none"
          className="w-full rounded-2xl border border-line bg-campo py-3.5 pl-11 pr-12 text-[15px] outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
          autoFocus={autoFocus}
        />
        {query && (
          <button
            onClick={limpiar}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-ink-2"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-gris-light">
              <IconX className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
      </div>

      {/* ── Filtros ── */}
      <div className="mt-3 flex gap-1 rounded-2xl bg-gris-light p-1">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            onClick={() => cambiarFiltro(f.valor)}
            className={`min-h-11 flex-1 rounded-xl text-[13px] font-semibold transition ${
              tipo === f.valor
                ? 'bg-surface text-primary shadow-sm'
                : 'text-ink-2'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      {sinTexto ? (
        <SinBuscar
          recientes={recientes}
          onElegir={(t) => {
            setQuery(t);
            lanzar(t, tipo);
          }}
          onBorrar={() => {
            borrarRecientes();
            setRecientes([]);
          }}
        />
      ) : buscando ? (
        <Esqueleto />
      ) : error ? (
        <div className="card mt-5 p-6 text-center">
          <p className="text-sm font-medium text-err">{error}</p>
          <button
            onClick={() => lanzar(query, tipo)}
            className="mx-auto mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white"
          >
            Reintentar
          </button>
        </div>
      ) : buscado && resultados.length === 0 ? (
        <div className="card mt-5 p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gris-light text-ink-2">
            <IconSearch className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Sin resultados</p>
          <p className="mt-1 text-sm text-ink-2">
            No encontramos comercios para &quot;{query.trim()}&quot;
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-2">
            {resultados.length}{' '}
            {resultados.length === 1 ? 'resultado' : 'resultados'}
            {topeAlcanzado && (
              <span className="font-semibold normal-case tracking-normal">
                {' '}
                · afina tu búsqueda para ver otros
              </span>
            )}
          </p>

          <div className="space-y-2.5">
            {resultados.map((l) => (
              <Resultado
                key={l.id_local}
                local={l}
                query={query}
                enRutaHoy={idsDeHoy.has(
                  String(l.id_local || '').trim().toUpperCase(),
                )}
                onTap={() => onElegir(l)}
              />
            ))}
          </div>
        </>
      )}

      <div className="h-6" />
    </>
  );
}

// ══════════════════════════════════════════════════
function Resultado({
  local,
  query,
  enRutaHoy,
  onTap,
}: {
  local: LocalCompleto;
  query: string;
  enRutaHoy: boolean;
  onTap: () => void;
}) {
  const esCC = String(local.tipo || '').toUpperCase() === 'CC';
  const ubicacion = useMemo(
    () =>
      [
        tituloBonito(esCC ? local.mall_puerta : local.direccion),
        tituloBonito(local.distrito),
      ]
        .filter(Boolean)
        .join(' · '),
    [local, esCC],
  );

  const aviso = avisoUltimaVisita(local);
  const incidencia = ultimaFueIncidencia(local);

  return (
    <button
      onClick={onTap}
      className="card flex w-full items-center gap-3 p-3.5 text-left transition active:scale-[0.99]"
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[11px] font-bold ${
          esCC
            ? 'bg-motivo-virtual-light text-motivo-virtual'
            : 'bg-motivo-branding-light text-motivo-branding'
        }`}
      >
        {esCC ? 'CC' : 'PC'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          <Resaltado texto={local.comercio} query={query} />
        </p>
        <p className="truncate text-[12.5px] text-ink-2">
          <Resaltado texto={ubicacion || 'Sin ubicación'} query={query} />
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {enRutaHoy && (
            <span className="rounded-full bg-primary-light px-2.5 py-0.5 text-[11px] font-semibold text-primary">
              En tu ruta hoy
            </span>
          )}
          {aviso.tipo === 'nunca' && (
            <span className="rounded-full bg-gris-light px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
              Nunca visitado
            </span>
          )}
          {aviso.tipo === 'hace-mucho' && (
            <span className="flex items-center gap-1 rounded-full bg-gris-light px-2.5 py-0.5 text-[11px] font-semibold text-ink">
              <IconClock className="h-3 w-3" />
              Sin visita hace {aviso.dias} días
            </span>
          )}
          {incidencia && (
            <span className="rounded-full bg-err-light px-2.5 py-0.5 text-[11px] font-semibold text-err">
              Última visita: Incidencia
            </span>
          )}
        </div>
      </div>

      <span className="shrink-0 text-ink-2">
        <IconChevronRight />
      </span>
    </button>
  );
}

/** Resalta lo que coincide, sin inyectar HTML. */
function Resaltado({ texto, query }: { texto: string; query: string }) {
  const trozos = partirPorCoincidencia(texto, query);
  return (
    <>
      {trozos.map((t, i) =>
        t.coincide ? (
          <mark key={i} className="bg-transparent font-bold text-primary">
            {t.texto}
          </mark>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

function SinBuscar({
  recientes,
  onElegir,
  onBorrar,
}: {
  recientes: string[];
  onElegir: (t: string) => void;
  onBorrar: () => void;
}) {
  if (!recientes.length) {
    return (
      <div className="mt-10 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-light text-primary">
          <IconStore className="h-7 w-7" />
        </span>
        <p className="mt-4 text-[14px] font-semibold">Busca un comercio</p>
        <p className="mt-1 text-[13px] text-ink-2">
          Escribe al menos {MIN_LETRAS} letras del nombre,
          <br />
          la dirección o el distrito
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">
          Búsquedas recientes
        </p>
        <button
          onClick={onBorrar}
          className="min-h-11 px-1 text-[12px] font-semibold text-primary"
        >
          Borrar
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {recientes.map((t) => (
          <button
            key={t}
            onClick={() => onElegir(t)}
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium active:scale-[0.98]"
          >
            <IconClock className="h-3.5 w-3.5 text-ink-2" />
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="mt-5 animate-pulse space-y-2.5">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[78px] rounded-2xl bg-line/60" />
      ))}
    </div>
  );
}
