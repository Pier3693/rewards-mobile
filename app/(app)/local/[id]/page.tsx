'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getRutaDeHoy,
  getLocalDelDia,
  asignacionesDeLocal,
  asignacionesPendientesDeLocal,
  aplicarEncoladasAlDia,
  type DiaData,
} from '@/lib/cacheDia';
import { useCola } from '@/lib/useCola';
import {
  avisoUltimaVisita,
  diasDesde,
  textoAntiguedad,
  textoParaCopiar,
  type LocalCompleto,
} from '@/lib/locales';
import { tituloBonito, telefonoWhatsApp, telefonoLlamada, telefonoLegible, horaDe } from '@/lib/texto';
import { separarObservacion } from '@/lib/visita';
import {
  estadoTemporal,
  textoEstado,
  estaCompletada,
  estaPendienteDeEnvio,
  enlaceMeet,
  tieneMeet,
  meetEsUrgente,
  enlaceMapa,
  ubicacionDe,
  indicacionesLimpias,
  type Parada,
} from '@/lib/ruta';
import Toast from '@/components/Toast';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import {
  IconStore,
  IconPhone,
  IconWhatsApp,
  IconCopy,
  IconNavigation,
  IconPlay,
  IconVideo,
  IconClock,
  IconChevronLeft,
} from '@/components/icons';

const MOTIVO_CLS: Record<string, string> = {
  Visita: 'bg-motivo-visita-light text-motivo-visita',
  Branding: 'bg-motivo-branding-light text-motivo-branding',
  'Capacitación Presencial': 'bg-motivo-presencial-light text-motivo-presencial',
  'Capacitación Virtual': 'bg-motivo-virtual-light text-motivo-virtual',
};

const RESULTADO_CLS: Record<string, string> = {
  'Todo Ok': 'bg-ok-light text-ok',
  Incidencia: 'bg-err-light text-err',
  Reprogramar: 'bg-warn-light text-warn',
  'No existe': 'bg-gris-suave text-gris',
};

export default function LocalPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id || '')).toUpperCase();

  const [local, setLocal] = useState<LocalCompleto | null>(null);
  const [dia, setDia] = useState<DiaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  /** Cuándo se guardó la copia del celular en uso. 0 si los datos son frescos. */
  const [copiaDeLas, setCopiaDeLas] = useState(0);
  const [ahora, setAhora] = useState(() => new Date());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      // Las dos en paralelo: el detalle del local y la ruta del día, que
      // viene de la caché si otra pantalla ya la pidió.
      // Sin señal, la copia del celular de los locales de la ruta de hoy.
      const [rLocal, rDia] = await Promise.all([
        getLocalDelDia<LocalCompleto>(id),
        getRutaDeHoy(),
      ]);

      if (!rLocal.ok || !rLocal.data) {
        setError(rLocal.error || 'No se encontró este local');
        return;
      }
      setLocal(rLocal.data);
      setCopiaDeLas(rLocal.deCache ? rLocal.guardadoEn || 0 : 0);
      if (rDia.ok && rDia.data) setDia(rDia.data);
    } catch {
      setError('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      // Pase lo que pase: sin esto el esqueleto se queda puesto.
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Lo que está esperando envío cuenta como hecho: no se ofrece
  // registrarlo otra vez.
  const cola = useCola();
  const diaConCola = useMemo(
    () => aplicarEncoladasAlDia(dia, cola.visitas.map((v) => v.resumen)),
    [dia, cola.visitas],
  );

  /** Todas las paradas de hoy de este local: puede tener más de una. */
  const asignaciones = useMemo(
    () => asignacionesDeLocal(diaConCola, id),
    [diaConCola, id],
  );
  const pendientes = useMemo(
    () => asignacionesPendientesDeLocal(diaConCola, id),
    [diaConCola, id],
  );

  /**
   * El motivo ya no se pregunta aquí: lo elige el paso 1 del registro.
   * Si el local está en la ruta, se manda la asignación para que quede
   * completada con su resultado.
   */
  /**
   * Con una sola pendiente se manda su id. Con varias no se manda
   * ninguno: el registro preguntará cuál, porque elegir a ciegas
   * escribiría el resultado en la fila equivocada.
   */
  function iniciarRegistro(idAsignacion?: string) {
    const elegida =
      idAsignacion || (pendientes.length === 1 ? pendientes[0].id_asignacion : '');
    const asg = elegida ? `?asg=${encodeURIComponent(elegida)}` : '';
    router.push(`/visita/${encodeURIComponent(id)}${asg}`);
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setToast('Dirección copiada');
    } catch {
      setToast('No se pudo copiar');
    }
    setTimeout(() => setToast(''), 2500);
  }

  if (cargando) return <Esqueleto />;

  if (error || !local) {
    return (
      <main className="mx-auto max-w-md px-5 pt-pantalla">
        <Cabecera onVolver={() => router.back()} />
        <ErrorDeCarga detalle={error} onReintentar={cargar} onVolver={() => router.back()} />
      </main>
    );
  }

  const ubicacion = ubicacionDe(local);

  const whatsapp = telefonoWhatsApp(local.contacto_cel);
  // Un fijo se puede llamar, pero no tiene WhatsApp.
  const llamada = telefonoLlamada(local.contacto_cel);
  const aviso = avisoUltimaVisita(local, ahora);
  const dias = diasDesde(local.ultima_visita, ahora);

  const datos: { label: string; valor: string }[] = [
    { label: 'Procesador POS', valor: local.procesador_pos },
    { label: 'Código OPENPAY', valor: local.codigo_openpay },
    { label: 'Código NIUBIZ', valor: local.codigo_niubiz },
    { label: 'Código IZIPAY', valor: local.codigo_izipay },
    { label: 'Código CULQI', valor: local.codigo_culqi || '' },
    { label: 'Beneficios', valor: local.beneficios },
    { label: 'Material POP', valor: local.material_pop },
    {
      label: 'Contacto',
      valor: [local.contacto_nombre, telefonoLegible(local.contacto_cel)]
        .filter(Boolean)
        .join(' · '),
    },
  ].filter((f) => String(f.valor || '').trim());

  return (
    <main className="mx-auto max-w-md px-5 pb-barra pt-seguro">
      <Cabecera onVolver={() => router.back()} />

      {copiaDeLas > 0 && (
        <p className="mt-3 rounded-xl bg-warn-light px-3.5 py-2.5 text-center text-[12.5px] font-medium text-warn">
          Sin conexión: datos guardados a las {horaDe(copiaDeLas)}.
        </p>
      )}

      {/* ── Identidad ── */}
      <div className="mt-4 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary-light text-primary">
          <IconStore className="h-8 w-8" />
        </span>
        <h1 className="mt-3 text-[22px] font-bold leading-tight">
          {local.comercio}
        </h1>
        {ubicacion && <p className="mt-1 text-[13px] text-ink-2">{ubicacion}</p>}

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <Chip>{local.id_local}</Chip>
          {local.kam && <Chip>KAM · {tituloBonito(local.kam)}</Chip>}
          {local.psi && <Chip>PSI · {tituloBonito(local.psi)}</Chip>}
        </div>
      </div>

      {/* ── Acciones ── */}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {llamada && (
          <Accion
            href={`tel:${llamada}`}
            icono={<IconPhone />}
            texto="Llamar"
            clase="bg-ok-light text-ok"
          />
        )}
        {whatsapp && (
          <Accion
            href={`https://wa.me/${whatsapp}`}
            externo
            icono={<IconWhatsApp />}
            texto="WhatsApp"
            clase="bg-ok-light text-ok"
          />
        )}
        <Accion
          href={enlaceMapa(local)}
          externo
          icono={<IconNavigation />}
          texto="Cómo llegar"
          clase="bg-primary-light text-primary"
        />
        <button
          onClick={() => copiar(textoParaCopiar(local))}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gris-light text-[14px] font-semibold text-ink-2 active:scale-[0.98]"
        >
          <IconCopy />
          Copiar
        </button>
      </div>

      {/* ── Asignaciones de hoy ── */}
      {asignaciones.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">
            En tu ruta de hoy
            {asignaciones.length > 1 && ` (${asignaciones.length})`}
          </h2>
          <div className="space-y-2.5">
            {asignaciones.map((p) => (
              <BloqueAsignacion
                key={p.id_asignacion}
                p={p}
                ahora={ahora}
                /* Con una sola, el botón fijo de abajo ya la registra. */
                onRegistrar={
                  asignaciones.length > 1 && !estaCompletada(p)
                    ? () => iniciarRegistro(p.id_asignacion)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Última visita ── */}
      <h2 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-ink-2">
        Última visita
      </h2>
      {aviso.tipo === 'nunca' ? (
        <div className="card p-4 text-center">
          <p className="text-[14px] font-semibold">Nunca visitado</p>
          <p className="mt-0.5 text-[12.5px] text-ink-2">
            Este local todavía no tiene visitas registradas
          </p>
        </div>
      ) : (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold">
              {local.ultima_visita.split(' ')[0]}
              {dias !== null && (
                <span className="font-medium text-ink-2">
                  {' '}
                  · {textoAntiguedad(dias)}
                </span>
              )}
            </p>
            {local.ultimo_status && (
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  RESULTADO_CLS[local.ultimo_status] || 'bg-gris-light text-ink-2'
                }`}
              >
                {local.ultimo_status}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {[local.ultimo_motivo, local.ultimo_cap && `por ${local.ultimo_cap}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {local.ultima_observacion && (
            <ObservacionAnterior texto={local.ultima_observacion} />
          )}
          {aviso.tipo === 'hace-mucho' && (
            <p className="mt-2 text-[12px] font-semibold text-ink-2">
              Sin visita hace {aviso.dias} días
            </p>
          )}
        </div>
      )}

      {/* ── Datos del local ── */}
      {datos.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-wider text-ink-2">
            Datos del local
          </h2>
          <div className="card divide-y divide-line">
            {datos.map((f) => (
              <div
                key={f.label}
                className="flex items-start justify-between gap-3 px-4 py-2.5"
              >
                <span className="text-[12px] text-ink-2">{f.label}</span>
                <span className="min-w-0 max-w-[60%] text-right text-[13px] font-medium wrap-anywhere">
                  {f.valor}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Botón fijo ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 barra-ios px-5 pt-3 pb-barra-fija">
        <button
          onClick={() => iniciarRegistro()}
          className="btn-grad mx-auto flex min-h-[52px] w-full max-w-md items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 transition active:scale-[0.98]"
        >
          <IconPlay className="h-[18px] w-[18px]" />
          Iniciar registro de visita
        </button>
      </div>

      {toast && <Toast mensaje={toast} />}
    </main>
  );
}

// ══════════════════════════════════════════════════
function Cabecera({ onVolver }: { onVolver: () => void }) {
  return (
    // Fijo arriba, bajo la hora: al hacer scroll el contenido pasa por debajo.
    <header className="encabezado-fijo -mx-5 flex items-center gap-2 px-5 py-1.5">
      <button
        onClick={onVolver}
        aria-label="Volver"
        className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-ink"
      >
        <IconChevronLeft />
      </button>
      <p className="text-[15px] font-semibold">Detalle del local</p>
    </header>
  );
}

/**
 * La observación puede traer el tipo de incidencia como prefijo
 * ("[Local cerrado] texto"), porque la hoja no tiene columna para él.
 * Se muestra como etiqueta en vez de dejar los corchetes crudos.
 */
function ObservacionAnterior({ texto }: { texto: string }) {
  const { tipo, texto: limpio } = separarObservacion(texto);
  return (
    <div className="mt-2 rounded-xl bg-gris-light px-3 py-2">
      {tipo && (
        <span className="mb-1 inline-block rounded-full bg-err-light px-2 py-0.5 text-[11px] font-semibold text-err">
          {tipo}
        </span>
      )}
      {limpio && <p className="text-[12.5px] text-ink wrap-anywhere">{limpio}</p>}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gris-light px-2.5 py-0.5 text-[11px] font-semibold text-ink-2">
      {children}
    </span>
  );
}

function Accion({
  href,
  externo,
  icono,
  texto,
  clase,
}: {
  href: string;
  externo?: boolean;
  icono: React.ReactNode;
  texto: string;
  clase: string;
}) {
  return (
    <a
      href={href}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`flex min-h-[52px] items-center justify-center gap-2 rounded-2xl text-[14px] font-semibold active:scale-[0.98] ${clase}`}
    >
      {icono}
      {texto}
    </a>
  );
}

/** Una parada de hoy de este local. Puede haber varias. */
function BloqueAsignacion({
  p,
  ahora,
  onRegistrar,
}: {
  p: Parada;
  ahora: Date;
  onRegistrar?: () => void;
}) {
  const estado = estadoTemporal(p, ahora);
  const meet = enlaceMeet(p);
  const urgente = tieneMeet(p) && meetEsUrgente(p, ahora);
  const hecha = estaCompletada(p);
  const resultado = String(p.resultado || '').trim();

  return (
    <div
      className={`card border p-4 ${
        hecha ? 'border-line opacity-60' : 'border-primary/25'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {estado !== 'flexible' && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
              estado === 'atrasada'
                ? 'bg-gris-light text-ink'
                : 'bg-primary-light text-primary'
            }`}
          >
            <IconClock className="h-3.5 w-3.5" />
            {textoEstado(p, ahora)}
          </span>
        )}
        {p.motivo && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              MOTIVO_CLS[p.motivo] || 'bg-gris-light text-ink-2'
            }`}
          >
            {p.motivo}
          </span>
        )}
        {hecha && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              RESULTADO_CLS[resultado] || 'bg-ok-light text-ok'
            }`}
          >
            {resultado || 'Hecha'}
          </span>
        )}
        {estaPendienteDeEnvio(p) && (
          <span className="rounded-full bg-warn-light px-2.5 py-0.5 text-[11px] font-semibold text-warn">
            Pendiente de envío
          </span>
        )}
      </div>

      {indicacionesLimpias(p) && (
        <p className="mt-2.5 rounded-xl bg-gris-light px-3 py-2 text-[12.5px] text-ink">
          {indicacionesLimpias(p)}
        </p>
      )}

      {meet && !hecha && (
        <a
          href={meet}
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-2.5 flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] ${
            urgente
              ? 'bg-motivo-virtual text-white'
              : 'bg-motivo-virtual-light text-motivo-virtual'
          }`}
        >
          <IconVideo className="h-[18px] w-[18px]" />
          {urgente ? 'Unirse ahora' : 'Unirse'}
        </a>
      )}

      {/* Con varias pendientes, cada una se registra por separado. */}
      {onRegistrar && (
        <button
          onClick={onRegistrar}
          className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-[14px] font-semibold text-white active:scale-[0.98]"
        >
          <IconPlay className="h-[18px] w-[18px]" />
          Registrar esta
        </button>
      )}
    </div>
  );
}

function Esqueleto() {
  return (
    <main className="mx-auto max-w-md animate-pulse px-5 pt-pantalla">
      <div className="h-11 w-11 rounded-full bg-line" />
      <div className="mx-auto mt-4 h-16 w-16 rounded-2xl bg-line" />
      <div className="mx-auto mt-3 h-6 w-48 rounded bg-line" />
      <div className="mx-auto mt-2 h-4 w-32 rounded bg-line/70" />
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[52px] rounded-2xl bg-line/60" />
        ))}
      </div>
      <div className="mt-6 h-24 rounded-2xl bg-line/50" />
      <div className="mt-4 h-40 rounded-2xl bg-line/40" />
    </main>
  );
}
