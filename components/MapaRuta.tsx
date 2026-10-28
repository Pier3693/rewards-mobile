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
  agruparParadas,
  encuadre,
  estiloMarcador,
  infoHoja,
  enlaceComoLlegar,
  textoDistancia,
  textoMetros,
  CENTRO_LIMA,
  type ParadaEnMapa,
  type GrupoEnMapa,
  type DatosLocal,
  type EstiloMarcador,
} from '@/lib/mapa';
import { useCola } from '@/lib/useCola';
import { useConexion } from '@/lib/useConexion';
import { useUbicacion } from '@/lib/useUbicacion';
import { useRutaSugerida } from '@/lib/useRutaSugerida';
import { numerosSugeridos, type Lugar, type RutaSugerida } from '@/lib/rutaSugerida';
import { etiquetaHora } from '@/lib/ruta';
import {
  getRutasProximas,
  rutasProximasEnCopia,
  diasDelSelector,
  tituloDia,
  textoDisponible,
} from '@/lib/rutasProximas';
import { useDiaElegido } from '@/lib/useDiaElegido';
import SelectorDias from '@/components/SelectorDias';
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
    : e.numero
      ? String(e.numero)
      : '';
  return `<span class="${clases}" style="--marcador:${e.color}">${contenido}</span>`;
}

/** Ícono de capas: tres rombos apilados. */
const SVG_CAPAS =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/></svg>';

/**
 * Una píldora con capas y cuántas paradas hay ahí, en el color de marca:
 * así no se confunde con el número de una parada. El nombre accesible lo
 * pone el marcador ("3 paradas").
 */
function htmlGrupo(g: GrupoEnMapa, numeroEnOrden = 0): string {
  // Con la ruta sugerida, un grupo que es un solo lugar del orden (un
  // mall) lleva su número del orden: las capas dicen que son varios locales.
  const texto = numeroEnOrden || g.paradas.length;
  return `<span class="marcador marcador--grupo" aria-hidden="true">${SVG_CAPAS}<span>${texto}</span></span>`;
}

/** Zoom desde el que tocar un grupo ya no acerca más: lista sus paradas. */
const ZOOM_LISTAR_GRUPO = 18;

interface Lista {
  titulo: string;
  subtitulo: string;
  paradas: ParadaEnMapa[];
}

/** El nombre de un lugar del orden: el comercio, o el mall si son varios. */
function nombreLugar(l: Lugar): string {
  const primera = l.paradas[0].parada;
  if (l.paradas.length === 1) return primera.comercio;
  return infoHoja(primera).mall || `${l.paradas.length} locales`;
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
  /** Ya no hay más que esperar del local: "…" pasa a "-". */
  const [localListo, setLocalListo] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  /** Las paradas se agrupan según el zoom. */
  const [zoom, setZoom] = useState(12);
  const [mosaicosFallan, setMosaicosFallan] = useState(false);
  const [avisoUbicacionCerrado, setAvisoUbicacionCerrado] = useState(false);
  /** La hoja con el orden sugerido completo. */
  const [verOrden, setVerOrden] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const capaPuntos = useRef<L.LayerGroup | null>(null);
  const capaCap = useRef<{ punto: L.Marker; precision: L.Circle } | null>(null);
  const capaLinea = useRef<L.Polyline | null>(null);
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

  // ── Los próximos días: el mismo día elegido que en Hoy ──
  const [proximas, setProximas] = useState<DiaData[]>([]);
  const [diaElegido, elegirDia] = useDiaElegido();
  useEffect(() => {
    setProximas(rutasProximasEnCopia());
    getRutasProximas().then((r) => setProximas(r.dias));
  }, []);
  const totalHoy = useMemo(() => paradasDelDia(dia).length, [dia]);
  const opcionesDias = useMemo(() => diasDelSelector(totalHoy, proximas), [totalHoy, proximas]);
  const diaFuturo = useMemo(
    () => (diaElegido ? proximas.find((d) => d.fecha === diaElegido && opcionesDias.some((o) => o.fecha === d.fecha)) || null : null),
    [diaElegido, proximas, opcionesDias],
  );

  const paradas = useMemo(
    () =>
      separarParadas(
        diaFuturo
          ? paradasDelDia(diaFuturo)
          : paradasDelDia(aplicarEncoladasAlDia(dia, cola.visitas.map((v) => v.resumen))),
      ),
    [dia, diaFuturo, cola.visitas],
  );
  const todas = useMemo(
    () => [...paradas.conUbicacion, ...paradas.sinUbicacion].sort((a, b) => a.numero - b.numero),
    [paradas],
  );

  // ── Ruta sugerida: con la ubicación, por cercanía; si no, null ──
  const sugerencia = useRutaSugerida(todas, diaFuturo ? null : ubicacion);
  const ruta = sugerencia?.ruta || null;
  const numeros = useMemo(() => (ruta ? numerosSugeridos(ruta) : null), [ruta]);
  /** El número que se ve: el del orden sugerido, o el de la ruta sin ubicación. */
  const numeroDe = useCallback(
    (p: ParadaEnMapa) => (numeros ? numeros.get(p.numero) || 0 : p.numero),
    [numeros],
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
    m.on('zoomend', () => setZoom(m.getZoom()));
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
      else m.fitBounds(e.limites, { paddingTopLeft: [48, 230], paddingBottomRight: [48, 170], maxZoom: 16 });
    },
    [paradas, ubicacion],
  );

  // Tocar un grupo: acercar hasta separarlas, o si están en el mismo
  // sitio (o ya no se puede acercar más), la lista de esas paradas.
  const tocarGrupo = useCallback((g: GrupoEnMapa) => {
    const m = mapa.current;
    if (!m) return;
    if (g.mismoLugar || m.getZoom() >= ZOOM_LISTAR_GRUPO) {
      const mall = infoHoja(g.paradas[0].parada).mall;
      setLista({
        titulo: g.mismoLugar && mall ? mall : `${g.paradas.length} paradas aquí`,
        subtitulo: 'Elige una para ver su detalle',
        paradas: g.paradas,
      });
      return;
    }
    movido.current = true;
    m.fitBounds(L.latLngBounds(g.paradas.map((p) => [p.coordenadas!.lat, p.coordenadas!.lng])), {
      paddingTopLeft: [48, 230],
      paddingBottomRight: [48, 72],
      maxZoom: 19,
    });
  }, []);

  // Los marcadores: una parada sola, o un grupo de las que se enciman.
  useEffect(() => {
    const capa = capaPuntos.current;
    if (!capa) return;
    capa.clearLayers();
    for (const g of agruparParadas(paradas.conUbicacion, zoom)) {
      if (g.paradas.length > 1) {
        // ¿Es un solo lugar del orden sugerido? Entonces todas llevan el mismo número.
        const enOrden = numeros ? new Set(g.paradas.map(numeroDe)) : null;
        const numeroEnOrden = enOrden && enOrden.size === 1 ? [...enOrden][0] : 0;
        const nombre = numeroEnOrden
          ? `Parada ${numeroEnOrden} · ${g.paradas.length} locales`
          : `${g.paradas.length} paradas`;
        const grupo = L.marker([g.centro.lat, g.centro.lng], {
          // Zona tocable de 64×44 alrededor de la píldora.
          icon: L.divIcon({
            className: 'marcador-mapa',
            html: htmlGrupo(g, numeroEnOrden),
            iconSize: [64, 44],
            iconAnchor: [32, 22],
          }),
          title: nombre,
          keyboard: true,
          zIndexOffset: 800,
        })
          .on('click', () => tocarGrupo(g))
          .addTo(capa);
        grupo.getElement()?.setAttribute('aria-label', nombre);
        continue;
      }
      const p = g.paradas[0];
      const estilo = { ...estiloMarcador(p), numero: numeroDe(p) };
      const nombre = estilo.numero ? `${estilo.numero}. ${p.parada.comercio}` : p.parada.comercio;
      L.marker([p.coordenadas!.lat, p.coordenadas!.lng], {
        icon: L.divIcon({ className: 'marcador-mapa', html: htmlMarcador(estilo), iconSize: [44, 44], iconAnchor: [22, 22] }),
        title: nombre,
        alt: nombre,
        keyboard: true,
        // Las pendientes por encima de las hechas.
        zIndexOffset: estilo.hecha ? 0 : 500,
      })
        .on('click', () => setAbierta(p))
        .addTo(capa);
    }
  }, [paradas, zoom, tocarGrupo, numeroDe, numeros]);

  // La línea punteada del recorrido sugerido, desde donde se calculó.
  useEffect(() => {
    const m = mapa.current;
    capaLinea.current?.remove();
    capaLinea.current = null;
    if (!m || !sugerencia || !sugerencia.ruta.pasos.length) return;
    const puntos: L.LatLngExpression[] = [
      [sugerencia.origen.lat, sugerencia.origen.lng],
      ...sugerencia.ruta.pasos.map((p): L.LatLngExpression => [p.lugar.centro.lat, p.lugar.centro.lng]),
    ];
    capaLinea.current = L.polyline(puntos, {
      className: 'linea-ruta',
      interactive: false,
      dashArray: '4 8',
      weight: 3,
    }).addTo(m);
    // Debajo de los marcadores, que van en su propio panel.
    capaLinea.current.bringToBack();
  }, [sugerencia]);

  // Al abrir: encuadrar las paradas en cuanto están.
  const encuadradoInicial = useRef(false);
  useEffect(() => {
    if (encuadradoInicial.current || cargando) return;
    encuadradoInicial.current = true;
    encuadrar(true);
  }, [cargando, encuadrar]);

  // Al cambiar de día, sus paradas (sin la ubicación: no es para hoy).
  const diaEncuadrado = useRef('');
  useEffect(() => {
    const clave = diaFuturo?.fecha || 'hoy';
    if (cargando || diaEncuadrado.current === clave) return;
    const primera = !diaEncuadrado.current;
    diaEncuadrado.current = clave;
    if (!primera) encuadrar(!diaFuturo);
  }, [cargando, diaFuturo, encuadrar]);

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

  // ── La hoja de una parada: KAM y beneficios de la asignación, y si
  //    falta alguno, de la copia del local ──
  useEffect(() => {
    setLocal(null);
    setLocalListo(false);
    const p = abierta?.parada;
    const id = p?.id_local;
    if (!p || !id || (p.kam && p.beneficios)) {
      setLocalListo(true);
      return;
    }
    let vivo = true;
    getLocalDelDia<DatosLocal>(id)
      .then((r) => {
        if (vivo && r.ok && r.data) setLocal(r.data);
      })
      .finally(() => vivo && setLocalListo(true));
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
            <p className="truncate text-[15px] font-bold leading-tight">
              {diaFuturo ? tituloDia(diaFuturo.fecha) : 'Mapa de hoy'}
            </p>
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
          {!cargando && opcionesDias.length > 0 && (
            <SelectorDias
              opciones={opcionesDias}
              elegido={diaFuturo ? diaFuturo.fecha : opcionesDias[0].fecha}
              onElegir={(o) => {
                setAbierta(null);
                elegirDia(o.esHoy ? '' : o.fecha);
              }}
              className="-mx-4 px-4"
            />
          )}

          {sinConexion && (
            <div className="flex items-center gap-2 rounded-2xl bg-warn-light px-3.5 py-2 text-[12.5px] font-medium text-warn shadow-lg backdrop-blur">
              <span className="min-w-0 flex-1">Sin conexión: el mapa puede verse incompleto.</span>
              <button
                onClick={() => setLista({ titulo: 'Paradas de hoy', subtitulo: 'Por si el mapa no se ve bien', paradas: todas })}
                className="min-h-11 shrink-0 font-semibold underline">
                Ver lista
              </button>
            </div>
          )}

          {/* En un día que viene la ubicación no se usa: no se pide. */}
          {estadoUbicacion === 'explicar' && !diaFuturo && (
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

      {/* ── Abajo, sobre la barra: la ruta sugerida, o la invitación a activarla ── */}
      {!cargando && diaFuturo && (
        <section aria-label="Ruta de otro día" className="mapa-abajo fixed inset-x-4 z-10 mx-auto max-w-md">
          <div className="card flex items-center gap-3 p-3.5 shadow-lg">
            <div className="min-w-0 flex-1">
              {/* La fecha ya está arriba, en el título del mapa. */}
              <p className="truncate text-[14px] font-bold">
                {todas.length} {todas.length === 1 ? 'parada' : 'paradas'}
              </p>
              <p className="text-[12px] text-ink-2">Solo para consultar · {textoDisponible(diaFuturo.fecha)}</p>
            </div>
            <button
              onClick={() => setLista({ titulo: tituloDia(diaFuturo.fecha), subtitulo: 'Elige una para ver su detalle', paradas: todas })}
              className="min-h-11 shrink-0 rounded-xl border border-line bg-surface px-3.5 text-[13.5px] font-semibold text-ink"
            >
              Ver lista
            </button>
          </div>
        </section>
      )}

      {!cargando && !diaFuturo && (
        <TarjetaRuta
          ruta={ruta}
          estadoUbicacion={estadoUbicacion}
          hayPendientes={paradas.conUbicacion.some((p) => !estiloMarcador(p).hecha)}
          sinUbicacion={paradas.sinUbicacion.length}
          onActivar={empezar}
          onVerOrden={() => setVerOrden(true)}
          onSinUbicacion={() =>
            setLista({
              titulo: 'Sin ubicación en el mapa',
              subtitulo: 'Estas paradas no tienen coordenadas todavía',
              paradas: paradas.sinUbicacion,
            })
          }
        />
      )}

      {/* ── Lista de paradas: sin ubicación, las de un grupo, o todas como respaldo ── */}
      {lista && (
        <BottomSheet titulo={lista.titulo} subtitulo={lista.subtitulo} onClose={() => setLista(null)}>
          <ul className="divide-y divide-line">
            {lista.paradas.map((p) => (
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
                    {estiloMarcador(p).hecha ? <IconCheck className="h-3.5 w-3.5" /> : numeroDe(p) || '·'}
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

      {/* ── El orden sugerido completo ── */}
      {verOrden && ruta && (
        <BottomSheet
          titulo="Orden sugerido"
          subtitulo={`Por cercanía · total aprox. ${textoMetros(ruta.totalMetros)}`}
          onClose={() => setVerOrden(false)}
        >
          {ruta.aviso && (
            <p className="mb-2 rounded-xl bg-warn-light px-3.5 py-2 text-[13px] font-semibold text-warn-boton">{ruta.aviso}</p>
          )}
          <ol className="divide-y divide-line">
            {ruta.pasos.map((paso, i) => {
              const primera = paso.lugar.paradas[0];
              const varios = paso.lugar.paradas.length > 1;
              return (
                <li key={primera.parada.id_asignacion || primera.numero}>
                  <button
                    onClick={() => {
                      setVerOrden(false);
                      if (varios) {
                        setLista({
                          titulo: nombreLugar(paso.lugar),
                          subtitulo: 'Elige una para ver su detalle',
                          paradas: paso.lugar.paradas,
                        });
                      } else setAbierta(primera);
                    }}
                    className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                  >
                    <span
                      className="marcador marcador--lista shrink-0"
                      style={{ ['--marcador' as string]: estiloMarcador(primera).color }}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{nombreLugar(paso.lugar)}</span>
                      <span className="block truncate text-[12px] text-ink-2">
                        {[
                          varios ? paso.lugar.paradas.map((p) => p.parada.comercio).join(', ') : '',
                          paso.lugar.ancla ? `Capacitación ${etiquetaHora(primera.parada)}` : etiquetaHora(primera.parada),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[12px] text-ink-2">
                      {i === 0 ? 'desde ti' : 'luego'}
                      <span className="block font-semibold text-ink">{textoMetros(paso.metrosDesdeAnterior)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {ruta.sinUbicacion.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-2">Sin ubicación</h3>
              <ul className="divide-y divide-line">
                {ruta.sinUbicacion.map((p) => (
                  <li key={p.parada.id_asignacion || p.numero}>
                    <button
                      onClick={() => {
                        setVerOrden(false);
                        setAbierta(p);
                      }}
                      className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{p.parada.comercio}</span>
                      <span className="shrink-0 text-[12px] text-ink-2">Sin ubicación</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-[12px] text-ink-2">
            Distancias en línea recta, como referencia: el recorrido por calles es algo mayor.
          </p>
        </BottomSheet>
      )}

      {/* ── Hoja de una parada ── */}
      {abierta && hoja && (
        <BottomSheet
          titulo={hoja.titulo}
          subtitulo={[numeroDe(abierta) ? `Parada ${numeroDe(abierta)}` : '', hoja.hora, hoja.distancia]
            .filter(Boolean)
            .join(' · ')}
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
            {/* Del catálogo: llegan con el local, como el KAM. */}
            {[hoja.psi, hoja.puntos].filter(Boolean).map((t) => (
              <span key={t} className="rounded-full bg-gris-light px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
                {t}
              </span>
            ))}
          </div>

          <dl className="mt-3 space-y-2.5 text-[14px]">
            {hoja.mall && <Dato etiqueta="Centro comercial" valor={hoja.mall} />}
            <Dato etiqueta="Dirección" valor={hoja.direccion || '-'} />
            <Dato etiqueta="KAM" valor={hoja.kam || (localListo ? '-' : '…')} />
            <Dato etiqueta="Beneficios activos" valor={hoja.beneficios || (localListo ? '-' : '…')} />
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
            {diaFuturo && (
              <p className="col-span-2 flex min-h-[52px] items-center justify-center rounded-2xl bg-gris-light text-[14px] font-semibold text-ink-2">
                {textoDisponible(diaFuturo.fecha)}
              </p>
            )}
            {!diaFuturo && !hoja.hecha && hoja.idLocal && (
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

/**
 * La tarjeta de abajo. Con la ruta sugerida: por dónde empezar, a qué
 * distancia, y el aviso de la próxima capacitación. Sin ubicación: la
 * invitación a activarla. aria-live: el lector de pantalla anuncia
 * cuando cambia la primera parada.
 */
function TarjetaRuta({
  ruta,
  estadoUbicacion,
  hayPendientes,
  sinUbicacion,
  onActivar,
  onVerOrden,
  onSinUbicacion,
}: {
  ruta: RutaSugerida | null;
  estadoUbicacion: ReturnType<typeof useUbicacion>['estado'];
  hayPendientes: boolean;
  /** Sin la ruta sugerida, las que no tienen coordenadas se listan desde aquí. */
  sinUbicacion: number;
  onActivar: () => void;
  onVerOrden: () => void;
  onSinUbicacion: () => void;
}) {
  const primero = ruta?.pasos[0];
  if (!hayPendientes && !primero && !sinUbicacion) return null;

  return (
    <section
      aria-label="Ruta sugerida"
      aria-live="polite"
      className="mapa-abajo fixed inset-x-4 z-10 mx-auto max-w-md"
    >
      <div className="card p-3.5 shadow-lg">
        {primero ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">Empieza por</p>
            <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-[15px] font-bold">{nombreLugar(primero.lugar)}</span>
              <span className="shrink-0 text-[13px] text-ink-2">· {textoDistancia(primero.metrosDesdeAnterior)}</span>
            </p>
            {ruta!.aviso && <p className="mt-1 text-[12.5px] font-semibold text-warn-boton">{ruta!.aviso}</p>}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <a
                href={enlaceComoLlegar(primero.lugar.paradas[0].parada)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-light text-[13.5px] font-semibold text-primary"
              >
                <IconNavigation className="h-4 w-4" /> Cómo llegar
              </a>
              <button
                onClick={onVerOrden}
                className="min-h-11 rounded-xl border border-line bg-surface text-[13.5px] font-semibold text-ink"
              >
                Ver orden
              </button>
            </div>
          </>
        ) : estadoUbicacion === 'buscando' || estadoUbicacion === 'comprobando' ? (
          <p className="text-[13px] text-ink-2">Buscando tu ubicación para sugerirte un orden…</p>
        ) : estadoUbicacion === 'activa' || !hayPendientes ? (
          <p className="text-[13px] text-ink-2">Las paradas pendientes no tienen ubicación en el mapa.</p>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-[13px] font-semibold">Activa tu ubicación para ver el orden sugerido</p>
            {estadoUbicacion !== 'denegada' && estadoUbicacion !== 'no-disponible' && (
              <button
                onClick={onActivar}
                className="btn-grad min-h-11 shrink-0 rounded-xl px-4 text-[13.5px] font-semibold text-white"
              >
                Activar
              </button>
            )}
          </div>
        )}
        {!primero && sinUbicacion > 0 && (
          <button onClick={onSinUbicacion} className="mt-1.5 min-h-11 text-left text-[12.5px] font-semibold text-primary-texto underline">
            {sinUbicacion} {sinUbicacion === 1 ? 'visita' : 'visitas'} sin ubicación en el mapa
          </button>
        )}
      </div>
    </section>
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
