'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearSession } from '@/lib/auth';
import { useUsuario } from '@/lib/useUsuario';
import Avatar from '@/components/Avatar';
import {
  borrarCacheDelDia,
  getRutaDeHoy,
  aplicarEncoladasAlDia,
  paradasDelDia,
  type DiaData,
} from '@/lib/cacheDia';
import {
  getMisVisitas,
  historialEnCopia,
  borrarCopiaHistorial,
  unirConCola,
  resumen,
  diaDeHoy,
  type VisitaApi,
} from '@/lib/historial';
import { estaCompletada } from '@/lib/ruta';
import { useCola } from '@/lib/useCola';
import { useConexion } from '@/lib/useConexion';
import { sincronizar } from '@/lib/sincronizador';
import {
  PREFERENCIAS,
  leerPreferencia,
  cambiarPreferencia,
  type Preferencia,
} from '@/lib/tema';
import {
  rolLegible,
  textoCierreSesion,
  textoActualizacion,
  mensajeContacto,
} from '@/lib/perfil';
import { pedirVersion, buscarActualizacion } from '@/lib/version';
import {
  estaInstalada,
  instalar,
  instruccionesDe,
  plataformaDe,
  EVENTO_INSTALACION,
} from '@/lib/instalacion';
import { ADMIN_WHATSAPP, ADMIN_EMAIL } from '@/lib/config';
import BottomSheet from '@/components/BottomSheet';
import {
  IconLogout,
  IconClock,
  IconWhatsApp,
  IconRefresh,
  IconChevronRight,
} from '@/components/icons';

const ETIQUETA_TEMA: Record<Preferencia, string> = {
  sistema: 'Sistema',
  claro: 'Claro',
  oscuro: 'Oscuro',
};

export default function PerfilPage() {
  const router = useRouter();
  const user = useUsuario();
  const cola = useCola();
  const enLinea = useConexion();

  const [historial, setHistorial] = useState<VisitaApi[] | null>(null);
  const [dia, setDia] = useState<DiaData | null>(null);
  const [tema, setTema] = useState<Preferencia>('sistema');
  const [version, setVersion] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [avisoVersion, setAvisoVersion] = useState('');
  const [confirmaSalida, setConfirmaSalida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  /** null hasta saberlo en el navegador: así no parpadea la fila. */
  const [instalada, setInstalada] = useState<boolean | null>(null);
  const [instrucciones, setInstrucciones] = useState('');

  useEffect(() => {
    setTema(leerPreferencia());
    pedirVersion().then(setVersion);
    setInstalada(estaInstalada());
    const alCambiarInstalacion = () => setInstalada(estaInstalada());
    window.addEventListener(EVENTO_INSTALACION, alCambiarInstalacion);

    // Lo guardado primero, para que el resumen salga ya; luego lo fresco.
    const copia = historialEnCopia();
    if (copia) setHistorial(copia.data);
    getMisVisitas().then((r) => {
      if (r.ok && r.data) setHistorial(r.data);
    });
    getRutaDeHoy().then((r) => {
      if (r.ok && r.data) setDia(r.data);
    });
    return () => window.removeEventListener(EVENTO_INSTALACION, alCambiarInstalacion);
  }, []);

  const hoy = useMemo(() => diaDeHoy(), []);

  // La cola cuenta: el trabajo está hecho aunque no haya llegado.
  const cuentas = useMemo(() => {
    if (!historial) return null;
    const { pendientes, enviadas } = unirConCola(historial, cola.visitas);
    return resumen([...pendientes, ...enviadas], hoy);
  }, [historial, cola.visitas, hoy]);

  const ruta = useMemo(() => {
    const paradas = paradasDelDia(
      aplicarEncoladasAlDia(dia, cola.visitas.map((v) => v.resumen)),
    );
    return paradas.length
      ? { hechas: paradas.filter(estaCompletada).length, total: paradas.length }
      : null;
  }, [dia, cola.visitas]);

  function elegirTema(p: Preferencia) {
    setTema(p);
    cambiarPreferencia(p);
  }

  /** Para quien cerró el aviso del login y ahora sí quiere instalar. */
  async function pedirInstalar() {
    const r = await instalar();
    if (r === 'instrucciones') setInstrucciones(instruccionesDe(plataformaDe(navigator.userAgent)));
    else setInstalada(estaInstalada());
  }

  async function buscar() {
    setBuscando(true);
    setAvisoVersion('');
    const r = await buscarActualizacion();
    setBuscando(false);
    setAvisoVersion(textoActualizacion(r));
  }

  function pedirSalir() {
    if (cola.visitas.length > 0) setConfirmaSalida(true);
    else salir();
  }

  function salir() {
    // La ruta, los locales y el historial guardados son de quien se va.
    // La cola de visitas NO se toca: se envía cuando ese CAP vuelva a entrar.
    borrarCacheDelDia();
    borrarCopiaHistorial();
    clearSession();
    router.replace('/login');
  }

  async function enviarYSalir() {
    setEnviando(true);
    const r = await sincronizar(true);
    setEnviando(false);
    // Si quedó algo (la red falló a medias), el aviso sigue abierto con
    // el número al día y el CAP decide.
    if (r && r.pendientes === 0 && !r.sesionVencida) salir();
  }

  const cierre = textoCierreSesion(cola.visitas.length);
  const urlWhatsApp = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(mensajeContacto(user?.nombre))}`;
  const urlCorreo = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent('Ayuda con Rewards Mobile')}`;

  return (
    <main className="mx-auto max-w-md px-5 pt-pantalla">
      <h1 className="mb-6 text-center text-[17px] font-bold">Mi perfil</h1>

      {/* ── Quién ── */}
      <div className="mb-5 text-center">
        <Avatar nombre={user?.nombre} foto={user?.foto} className="mx-auto h-20 w-20 text-2xl" />
        <p className="mt-3 text-lg font-bold">{user?.nombre || '-'}</p>
        <p className="text-sm text-ink-2 wrap-anywhere">{user?.correo || ''}</p>
        {user?.rol && (
          <span className="mt-2 inline-block rounded-full bg-primary-light px-3 py-1 text-[12px] font-semibold text-primary">
            {rolLegible(user.rol)}
          </span>
        )}
      </div>

      {/* ── Resumen ── */}
      <div className="card grid grid-cols-2 divide-x divide-line">
        <Cifra titulo="Hoy" valor={cuentas?.hoy} extra={ruta ? `de tu ruta: ${ruta.hechas} de ${ruta.total}` : ''} />
        <Cifra titulo="Esta semana" valor={cuentas?.semana} extra="de lunes a hoy" />
      </div>

      <button
        onClick={() => router.push('/historial')}
        className="card mt-3 flex w-full items-center gap-3 px-4 py-3.5 text-left active:scale-[0.99]"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-light text-primary">
          <IconClock />
        </span>
        <span className="flex-1 text-sm font-semibold">Historial</span>
        <IconChevronRight className="h-4 w-4 text-ink-2" />
      </button>

      {/* ── Apariencia ── */}
      <Seccion titulo="Apariencia">
        <div role="radiogroup" aria-label="Apariencia" className="grid grid-cols-3 gap-1 rounded-2xl bg-gris-light p-1">
          {PREFERENCIAS.map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={tema === p}
              onClick={() => elegirTema(p)}
              className={`min-h-11 rounded-xl text-[13px] font-semibold transition ${
                tema === p ? 'bg-surface text-primary shadow-sm' : 'text-ink-2'
              }`}
            >
              {ETIQUETA_TEMA[p]}
            </button>
          ))}
        </div>
      </Seccion>

      {/* ── Contacto ── */}
      <Seccion titulo="Contactar al administrador">
        <div className="grid grid-cols-2 gap-2">
          <a
            href={urlWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#16A34A] text-[14px] font-semibold text-white active:scale-[0.98]"
          >
            <IconWhatsApp /> WhatsApp
          </a>
          <a
            href={urlCorreo}
            className="flex min-h-[52px] items-center justify-center rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink active:scale-[0.98]"
          >
            Correo
          </a>
        </div>
      </Seccion>

      {/* ── App ── */}
      <Seccion titulo="La app">
        <div className="card px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Versión</p>
              <p className="truncate text-xs text-ink-2">{version || '-'}</p>
            </div>
            <button
              onClick={buscar}
              disabled={buscando}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-primary disabled:opacity-60"
            >
              <IconRefresh className={`h-4 w-4 ${buscando ? 'animate-spin' : ''}`} />
              {buscando ? 'Buscando…' : 'Buscar actualización'}
            </button>
          </div>
          {avisoVersion && <p className="mt-2 text-[12.5px] text-ink-2">{avisoVersion}</p>}

          {instalada === false && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">Instalar app</p>
                <p className="text-xs text-ink-2">Ábrela desde tu pantalla de inicio</p>
              </div>
              <button
                onClick={pedirInstalar}
                className="min-h-11 shrink-0 rounded-xl px-3 text-[13px] font-semibold text-primary"
              >
                Instalar
              </button>
            </div>
          )}
        </div>
      </Seccion>

      <button
        onClick={pedirSalir}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-err-light text-[15px] font-semibold text-err transition active:scale-[0.98]"
      >
        <IconLogout /> Cerrar sesión
      </button>

      <p className="mt-8 pb-4 text-center text-xs text-ink-2">© 2026 Rewards Marketing Relacional</p>

      {instrucciones && (
        <BottomSheet titulo="Instalar app" onClose={() => setInstrucciones('')}>
          <p className="text-[14px]">{instrucciones}</p>
          <button
            onClick={() => setInstrucciones('')}
            className="btn-grad mt-5 min-h-[52px] w-full rounded-2xl text-[15px] font-semibold text-white"
          >
            Entendido
          </button>
        </BottomSheet>
      )}

      {confirmaSalida && cierre && (
        <BottomSheet titulo={cierre.titulo} onClose={() => setConfirmaSalida(false)}>
          <p className="text-[14px] text-ink-2">{cierre.detalle}</p>
          <div className="mt-5 space-y-2">
            <button
              onClick={enviarYSalir}
              disabled={enviando || !enLinea}
              className="btn-grad flex min-h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {!enLinea ? 'Sin señal para enviar' : enviando ? 'Enviando…' : 'Enviar ahora y cerrar sesión'}
            </button>
            <button
              onClick={salir}
              className="min-h-[52px] w-full rounded-2xl bg-err-light text-[15px] font-semibold text-err"
            >
              Cerrar sesión igual
            </button>
            <button
              onClick={() => setConfirmaSalida(false)}
              className="min-h-11 w-full rounded-2xl text-[14px] font-semibold text-ink-2"
            >
              Cancelar
            </button>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}

function Cifra({ titulo, valor, extra }: { titulo: string; valor?: number; extra?: string }) {
  return (
    <div className="px-4 py-3.5 text-center">
      <p className="text-[12px] font-semibold text-ink-2">{titulo}</p>
      <p className="mt-0.5 text-[26px] font-bold leading-tight">{valor ?? '-'}</p>
      <p className="min-h-[1rem] text-[11.5px] text-ink-2">{extra}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-ink-2">{titulo}</h2>
      {children}
    </section>
  );
}
