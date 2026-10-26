'use client';

// ══════════════════════════════════════════════════
//  Mapa de la ruta del día
//
//  Se carga solo en /mapa (next/dynamic, sin SSR): Leaflet
//  y su CSS no pesan en las demás pantallas.
//
//  Mosaicos de OpenStreetMap, pedidos con CORS para que el
//  service worker pueda guardar los ya vistos. En oscuro,
//  un filtro sobre la capa de mosaicos (globals.css).
//
//  La ubicación del CAP solo se usa aquí, en el celular.
// ══════════════════════════════════════════════════

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRutaDeHoy, getLocalDelDia, aplicarEncoladasAlDia, paradasDelDia, type DiaData } from '@/lib/cacheDia';
import {
  separarParadas,
  encuadre,
  estiloMarcador,
  infoHoja,
  enlaceComoLlegar,
  CENTRO_LIMA,
  type ParadaEnMapa,
  type DatosLocal,
  type EstiloMarcador,
} from '@/lib/mapa';
import { useCola } from '@/lib/useCola';
import { useConexion } from '@/lib/useConexion';
import { useUbicacion } from '@/lib/useUbicacion';
import { plataformaDe } from '@/lib/instalacion';
import { MOTIVO_CLS, type Motivo } from '@/lib/visita';
import BottomSheet from '@/components/BottomSheet';
import { IconUbicacion, IconNavigation, IconPlay, IconStore, IconX, IconCheck } from '@/components/icons';

const MOSAICOS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

/** El círculo con su número, o un check si ya está hecha. */
function htmlMarcador(e: EstiloMarcador): string {
  const clases = ['marcador', e.hecha && 'marcador--hecha', e.pendienteEnvio && 'marcador--pendiente']
    .filter(Boolean)
    .join(' ');
  const contenido = e.hecha
    ? '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
    : String(e.numero);
  return `<span class="${clases}" style="--marcador:${e.color}">${contenido}</span>`;
}

function instruccionesUbicacion(): string {
  const p = typeof navigator !== 'undefined' ? plataformaDe(navigator.userAgent) : 'otro';
  if (p === 'ios') return 'En el iPhone: Ajustes > Privacidad y seguridad > Localización > Sitios web de Safari (o Rewards) > Mientras se usa.';
  if (p === 'android') return 'En Android: toca el candado junto a la dirección > Permisos > Ubicación > Permitir.';
  return 'Permite la ubicación en la configuración del navegador para este sitio.';
}

export default function MapaRuta() {
  const router = useRouter();
  const cola = useCola();
  const enLinea = useConexion();
  const { estado: estadoUbicacion, ubicacion, empezar, descartar } = useUbicacion();

  const [dia, setDia] = useState<DiaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState<ParadaEnMapa | null>(null);
  const [local, setLocal] = useState<DatosLocal | null>(null);
  const [lista, setLista] = useState<'sin-ubicacion' | 'todas' | null>(null);
  const [mosaicosFallan, setMosaicosFallan] = useState(false);
  const [avisoUbicacionCerrado, setAvisoUbicacionCerrado] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaPuntos = useRef<L.LayerGroup | null>(null);
  const capaCap = useRef<{ punto: L.Marker; precision: L.Circle } | null>(null);
  /** Si el CAP ya movió el mapa, no se le vuelve a encuadrar solo. */
  const movido = useRef(false);
  const encuadradoConUbicacion = useRef(false);

  // ── Datos: la ruta de hoy, de la copia del celular y con la cola ──
  useEffect(() => {
    getRutaDeHoy().then((r) => {
      if (r.ok && r.data) setDia(r.data);
      setCargando(false);
    });
  }, []);

  const paradas = useMemo(
    () => separarParadas(paradasDelDia(aplicarEncoladasAlDia(dia, cola.visitas.map((v) => v.resumen)))),
    [dia, cola.visitas],
  );
  const todas = useMemo(
    () => [...paradas.conUbicacion, ...paradas.sinUbicacion].sort((a, b) => a.numero - b.numero),
    [paradas],
  );

  // ── El mapa ──
  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const m = L.map(contenedor.current, {
      zoomControl: false,
      center: [CENTRO_LIMA.lat, CENTRO_LIMA.lng],
      zoom: 12,
    });
    m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    L.tileLayer(MOSAICOS, { maxZoom: 19, crossOrigin: true, attribution: ATRIBUCION })
      .on('tileerror', () => setMosaicosFallan(true))
      .on('tileload', () => setMosaicosFallan(false))
      .addTo(m);
    m.on('dragstart', () => {
      movido.current = true;
    });
    capaPuntos.current = L.layerGroup().addTo(m);
    mapa.current = m;
    return () => {
      m.remove();
      mapa.current = null;
    };
  }, []);

  const encuadrar = useCallback(
    (conUbicacion: boolean) => {
      const m = mapa.current;
      if (!m) return;
      const e = encuadre(
        paradas.conUbicacion.map((p) => p.coordenadas!),
        conUbicacion ? ubicacion : null,
      );
      if (!e) return;
      if (e.tipo === 'centro') m.setView([e.centro.lat, e.centro.lng], e.zoom);
      // Más margen arriba: ahí van el título y los avisos.
      else m.fitBounds(e.limites, { paddingTopLeft: [48, 230], paddingBottomRight: [48, 72], maxZoom: 16 });
    },
    [paradas, ubicacion],
  );

  // Los marcadores de las paradas.
  useEffect(() => {
    const capa = capaPuntos.current;
    if (!capa) return;
    capa.clearLayers();
    for (const p of paradas.conUbicacion) {
      const estilo = estiloMarcador(p);
      L.marker([p.coordenadas!.lat, p.coordenadas!.lng], {
        icon: L.divIcon({ className: 'marcador-mapa', html: htmlMarcador(estilo), iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: `${p.numero}. ${p.parada.comercio}`,
        alt: `${p.numero}. ${p.parada.comercio}`,
        keyboard: true,
        // Las pendientes por encima de las hechas.
        zIndexOffset: estilo.hecha ? 0 : 500,
      })
        .on('click', () => setAbierta(p))
        .addTo(capa);
    }
  }, [paradas]);

  // Al abrir: encuadrar las paradas en cuanto están.
  const encuadradoInicial = useRef(false);
  useEffect(() => {
    if (encuadradoInicial.current || cargando) return;
    encuadradoInicial.current = true;
    encuadrar(true);
  }, [cargando, encuadrar]);

  // El punto azul y su círculo de precisión, que se mueven al caminar.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !ubicacion) return;
    const pos: L.LatLngExpression = [ubicacion.lat, ubicacion.lng];
    if (!capaCap.current) {
      capaCap.current = {
        precision: L.circle(pos, { radius: ubicacion.precision, className: 'precision-cap', interactive: false }).addTo(m),
        punto: L.marker(pos, {
          icon: L.divIcon({ className: 'marcador-mapa', html: '<span class="punto-cap"></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 1000,
        }).addTo(m),
      };
    } else {
      capaCap.current.punto.setLatLng(pos);
      capaCap.current.precision.setLatLng(pos).setRadius(ubicacion.precision);
    }
    // La primera ubicación entra en el encuadre, salvo que el CAP ya
    // haya movido el mapa a mano.
    if (!encuadradoConUbicacion.current && !movido.current) {
      encuadradoConUbicacion.current = true;
      encuadrar(true);
    }
  }, [ubicacion, encuadrar]);

  function centrarEnMi() {
    if (!ubicacion) {
      empezar();
      return;
    }
    movido.current = true;
    mapa.current?.setView([ubicacion.lat, ubicacion.lng], Math.max(mapa.current.getZoom(), 16));
  }

  // ── La hoja de una parada: KAM y beneficios de la copia del local ──
  useEffect(() => {
    setLocal(null);
    const id = abierta?.parada.id_local;
    if (!id) return;
    let vivo = true;
    getLocalDelDia<DatosLocal>(id).then((r) => {
      if (vivo && r.ok && r.data) setLocal(r.data);
    });
    return () => {
      vivo = false;
    };
  }, [abierta]);

  const hoja = abierta ? infoHoja(abierta.parada, local, ubicacion) : null;
  const sinConexion = !enLinea || mosaicosFallan;
  const sinParadas = !cargando && todas.length === 0;

  return (
    <div className="mapa-ruta">
      {/* El mapa, entre la franja de arriba y la barra de abajo. z-0 lo
          aísla: las capas de Leaflet (hasta z-index 1000) no tapan la barra
          ni las hojas. */}
      <div ref={contenedor} className="mapa-lienzo fixed inset-x-0 top-0 z-0" role="region" aria-label="Mapa de tu ruta de hoy" />

      {/* ── Arriba: título, avisos y "Centrar en mí" ── */}
      <div className="mapa-arriba fixed inset-x-0 z-10 px-4">
        <div className="mx-auto flex max-w-md items-start gap-2">
          <div className="card min-w-0 flex-1 px-3.5 py-2.5 shadow-lg">
            <p className="text-[15px] font-bold leading-tight">Mapa de hoy</p>
            <p className="truncate text-[12px] text-ink-2">
              {cargando
                ? 'Cargando tu ruta…'
                : `${todas.length} ${todas.length === 1 ? 'parada' : 'paradas'}${
                    paradas.sinUbicacion.length ? ` · ${paradas.sinUbicacion.length} sin ubicación` : ''
                  }`}
            </p>
          </div>
          <button
            onClick={centrarEnMi}
            aria-label="Centrar en mí"
            className={`card grid h-11 w-11 shrink-0 place-items-center shadow-lg ${ubicacion ? 'text-[#0A84FF]' : 'text-ink-2'}`}
          >
            <IconUbicacion />
          </button>
        </div>

        <div className="mx-auto mt-2 max-w-md space-y-2">
          {sinConexion && (
            <div className="flex items-center gap-2 rounded-2xl bg-warn-light px-3.5 py-2 text-[12.5px] font-medium text-warn shadow-lg backdrop-blur">
              <span className="min-w-0 flex-1">Sin conexión: el mapa puede verse incompleto.</span>
              <button onClick={() => setLista('todas')} className="min-h-11 shrink-0 font-semibold underline">
                Ver lista
              </button>
            </div>
          )}

          {estadoUbicacion === 'explicar' && (
            <div className="card p-3.5 shadow-lg">
              <p className="text-[13.5px] font-semibold">Para mostrarte tus visitas cercanas</p>
              <p className="mt-0.5 text-[12.5px] text-ink-2">
                Necesitamos tu ubicación. Solo se usa en tu celular, no se envía a ningún lado.
              </p>
              <div className="mt-2.5 flex gap-2">
                <button onClick={empezar} className="btn-grad min-h-11 flex-1 rounded-xl text-[13.5px] font-semibold text-white">
                  Permitir
                </button>
                <button onClick={descartar} className="min-h-11 flex-1 rounded-xl bg-gris-light text-[13.5px] font-semibold text-ink-2">
                  Ahora no
                </button>
              </div>
            </div>
          )}

          {(estadoUbicacion === 'denegada' || estadoUbicacion === 'error' || estadoUbicacion === 'no-disponible') &&
            !avisoUbicacionCerrado && (
              <div className="card flex items-start gap-2 p-3.5 shadow-lg">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold">
                    {estadoUbicacion === 'denegada' ? 'No tenemos permiso para tu ubicación' : 'No pudimos encontrar tu ubicación'}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-ink-2">
                    El mapa funciona igual con tus paradas.{' '}
                    {estadoUbicacion === 'denegada' ? instruccionesUbicacion() : 'Revisa que el GPS esté encendido.'}
                  </p>
                </div>
                <button
                  onClick={() => setAvisoUbicacionCerrado(true)}
                  aria-label="Cerrar aviso"
                  className="toque-44 relative -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center text-ink-2"
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
            )}

          {sinParadas && (
            <div className="card p-3.5 text-center shadow-lg">
              <p className="text-[13.5px] font-semibold">No tienes visitas hoy</p>
              <p className="text-[12.5px] text-ink-2">Cuando tengas una ruta, sus paradas saldrán aquí.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Abajo, sobre la barra: las que no tienen ubicación ── */}
      {paradas.sinUbicacion.length > 0 && (
        <div className="mapa-abajo fixed left-4 z-10">
          <button
            onClick={() => setLista('sin-ubicacion')}
            className="card min-h-11 px-3.5 text-left text-[12.5px] font-semibold shadow-lg"
          >
            {paradas.sinUbicacion.length} {paradas.sinUbicacion.length === 1 ? 'visita' : 'visitas'} sin ubicación en el mapa
          </button>
        </div>
      )}

      {/* ── Lista de paradas (sin ubicación, o todas como respaldo) ── */}
      {lista && (
        <BottomSheet
          titulo={lista === 'todas' ? 'Paradas de hoy' : 'Sin ubicación en el mapa'}
          subtitulo={lista === 'todas' ? 'Por si el mapa no se ve bien' : 'Estas paradas no tienen coordenadas todavía'}
          onClose={() => setLista(null)}
        >
          <ul className="divide-y divide-line">
            {(lista === 'todas' ? todas : paradas.sinUbicacion).map((p) => (
              <li key={p.parada.id_asignacion || p.numero}>
                <button
                  onClick={() => {
                    setLista(null);
                    setAbierta(p);
                  }}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                >
                  <span
                    className="marcador marcador--lista shrink-0"
                    style={{ ['--marcador' as string]: estiloMarcador(p).color }}
                  >
                    {estiloMarcador(p).hecha ? <IconCheck className="h-3.5 w-3.5" /> : p.numero}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{p.parada.comercio}</span>
                    <span className="block truncate text-[12px] text-ink-2">
                      {[infoHoja(p.parada).hora, p.parada.motivo].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
      )}

      {/* ── Hoja de una parada ── */}
      {abierta && hoja && (
        <BottomSheet
          titulo={hoja.titulo}
          subtitulo={[`Parada ${abierta.numero}`, hoja.hora, hoja.distancia].filter(Boolean).join(' · ')}
          onClose={() => setAbierta(null)}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            {hoja.motivo && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  MOTIVO_CLS[hoja.motivo as Motivo] || 'bg-gris-light text-ink-2'
                }`}
              >
                {hoja.motivo}
              </span>
            )}
            {hoja.hecha && (
              <span className="rounded-full bg-ok-light px-2.5 py-0.5 text-[11px] font-semibold text-ok">Hecha</span>
            )}
            {hoja.aproximado && (
              <span className="rounded-full bg-warn-light px-2.5 py-0.5 text-[11px] font-semibold text-warn">
                Ubicación aproximada
              </span>
            )}
          </div>

          <dl className="mt-3 space-y-2.5 text-[14px]">
            {hoja.mall && <Dato etiqueta="Centro comercial" valor={hoja.mall} />}
            <Dato etiqueta="Dirección" valor={hoja.direccion || '—'} />
            <Dato etiqueta="KAM" valor={hoja.kam || (local ? '—' : '…')} />
            <Dato etiqueta="Beneficios activos" valor={hoja.beneficios || (local ? '—' : '…')} />
          </dl>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <a
              href={enlaceComoLlegar(abierta.parada)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary-light text-[14px] font-semibold text-primary"
            >
              <IconNavigation className="h-[18px] w-[18px]" /> Cómo llegar
            </a>
            <button
              onClick={() => router.push(`/local/${encodeURIComponent(hoja.idLocal)}`)}
              disabled={!hoja.idLocal}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink disabled:opacity-50"
            >
              <IconStore className="h-[18px] w-[18px]" /> Ver local
            </button>
            {!hoja.hecha && hoja.idLocal && (
              <button
                onClick={() =>
                  router.push(
                    `/visita/${encodeURIComponent(hoja.idLocal)}${
                      hoja.idAsignacion ? `?asg=${encodeURIComponent(hoja.idAsignacion)}` : ''
                    }`,
                  )
                }
                className="btn-grad col-span-2 flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25"
              >
                <IconPlay className="h-[18px] w-[18px]" /> Iniciar visita
              </button>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-ink-2">{etiqueta}</dt>
      <dd className="wrap-anywhere">{valor}</dd>
    </div>
  );
}
