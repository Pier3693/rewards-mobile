'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, MS_LIMITE_GUARDADO } from '@/lib/api';
import {
  comprimirImagen,
  comprimirParaQueQuepa,
  peticionCabe,
  pesoPeticion,
  LIMITE_PETICION,
  pesoTotal,
  pesoLegible,
  TOPE_FOTOS,
} from '@/lib/img';
import {
  getRutaDeHoy,
  invalidarRutaDeHoy,
  paradasDelDia,
  asignacionDeLocal,
  asignacionesPendientesDeLocal,
  getLocalDelDia,
  localDelDiaEnCache,
  actualizarLocalTrasVisita,
  aplicarEncoladasAlDia,
  type DiaData,
} from '@/lib/cacheDia';
import { useCola } from '@/lib/useCola';
import {
  ordenarRuta,
  ubicacionDe,
  siguienteParada,
  estaCompletada,
  textoEstado,
  estadoTemporal,
  type Parada,
} from '@/lib/ruta';
import { tituloBonito, horaDe } from '@/lib/texto';
import { clearSession, marcarSesionExpirada, getUsuario } from '@/lib/auth';
import { nuevaEntrada } from '@/lib/cola';
import { guardarYEnviar } from '@/lib/sincronizador';
import { estadoDeVisita, TEXTO_ESTADO } from '@/lib/estadoEnvio';
import { useConexion } from '@/lib/useConexion';
import {
  MOTIVOS,
  STATUS_LISTA,
  STATUS_CLS,
  MOTIVO_CLS,
  TIPOS_INCIDENCIA,
  MAX_FOTOS,
  errorCelular,
  celularEsValido,
  componerObservacion,
  armarPeticionVisita,
  datosTrasVisita,
  prellenadoDesde,
  claveBorrador,
  nuevaIdVisita,
  fijarCreadoEn,
  type MomentoGuardado,
  queHacerTrasEnvio,
  borradorTieneAlgo,
  guardarBorrador,
  leerBorrador,
  borrarBorrador,
  hayDictado,
  type Motivo,
  type Status,
  type Autocompletado,
} from '@/lib/visita';
import {
  PROCESADORES,
  BENEFICIOS,
  MATERIAL_POP,
  SIN_PROCESADORES,
  SIN_BENEFICIOS,
  leerProcesadores,
  procesadoresATexto,
  alternarProcesador,
  hayProcesadores,
  leerBeneficios,
  beneficiosATexto,
  alternarBeneficio,
  hayBeneficios,
  leerMaterialPop,
  type SeleccionProcesadores,
  type SeleccionBeneficios,
  type MaterialPop,
} from '@/lib/datosLocal';
import BottomSheet from '@/components/BottomSheet';
import ErrorDeCarga from '@/components/ErrorDeCarga';
import {
  IconStore,
  IconMegaphone,
  IconUsers,
  IconVideo,
  IconCheck,
  IconAlert,
  IconCalendarRepeat,
  IconX,
  IconCamera,
  IconImage,
  IconMic,
  IconChevronRight,
  IconChevronLeft,
  IconPlay,
} from '@/components/icons';

const ICONO_MOTIVO: Record<Motivo, React.ReactNode> = {
  Visita: <IconStore />,
  Branding: <IconMegaphone />,
  'Capacitación Presencial': <IconUsers />,
  'Capacitación Virtual': <IconVideo />,
};

const ICONO_STATUS: Record<Status, React.ReactNode> = {
  'Todo Ok': <IconCheck className="h-5 w-5" />,
  Incidencia: <IconAlert className="h-5 w-5" />,
  Reprogramar: <IconCalendarRepeat className="h-5 w-5" />,
  'No existe': <IconX className="h-5 w-5" />,
};

const PASOS = ['Resultado', 'Datos del local', 'Evidencia'];

export default function VisitaPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const busqueda = useSearchParams();

  const idLocal = decodeURIComponent(String(params?.id || '')).toUpperCase();
  const idAsignacionUrl = busqueda.get('asg') || '';

  const [local, setLocal] = useState<Autocompletado | null>(null);
  const [dia, setDia] = useState<DiaData | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  /**
   * Cuándo se guardó la copia del celular que se está usando porque el
   * backend no respondió. 0 si los datos son frescos.
   */
  const [copiaDeLas, setCopiaDeLas] = useState(0);

  const [paso, setPaso] = useState(1);
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [tipoIncidencia, setTipoIncidencia] = useState('');
  const [contacto, setContacto] = useState('');
  const [celular, setCelular] = useState('');
  // En la hoja son texto ("Niubiz, Culqi"); aquí, lo marcado (lib/datosLocal).
  const [procesadores, setProcesadores] = useState<SeleccionProcesadores>(SIN_PROCESADORES);
  const [beneficiosSel, setBeneficiosSel] = useState<SeleccionBeneficios>(SIN_BENEFICIOS);
  const [materialPop, setMaterialPop] = useState<MaterialPop>('');
  const [observacion, setObservacion] = useState('');
  const [fotos, setFotos] = useState<string[]>([]);
  /**
   * Identificador de esta visita, fijado al abrir el formulario.
   * Si se generara al guardar, cada reintento llevaría uno nuevo y el
   * backend no podría reconocer el reenvío.
   */
  const [idVisita, setIdVisita] = useState(() => nuevaIdVisita());
  /** Cuándo se tocó Guardar por primera vez en ESTA visita. */
  const guardadoEn = useRef<MomentoGuardado | null>(null);

  const [comprimiendo, setComprimiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  /**
   * El último envío no se confirmó, pero reenviar es seguro: lleva el
   * mismo idVisita y el backend no lo duplica.
   */
  const [puedeReintentar, setPuedeReintentar] = useState(false);
  /** La sesión venció al guardar: el botón pasa a llevar al login. */
  const [sesionVencida, setSesionVencida] = useState(false);
  const enLinea = useConexion();
  const [tocado, setTocado] = useState(false);
  const [ofreceBorrador, setOfreceBorrador] = useState(false);
  const [confirmaSalida, setConfirmaSalida] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const [dictando, setDictando] = useState(false);
  /** Asignación elegida cuando el local tiene varias pendientes hoy. */
  const [asgElegida, setAsgElegida] = useState<string | null>(null);
  /** El CAP dijo que no corresponde a ninguna: es una visita extra. */
  const [esVisitaExtra, setEsVisitaExtra] = useState(false);

  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const reconocimiento = useRef<{ stop: () => void } | null>(null);

  // Las asignaciones con una visita en cola ya están hechas. Se excluye
  // ESTA visita: si no, al entrar en la cola durante el guardado le
  // cambiaría la asignación a media operación.
  const cola = useCola();
  const diaConCola = useMemo(
    () =>
      aplicarEncoladasAlDia(
        dia,
        cola.visitas.filter((v) => v.idVisita !== idVisita).map((v) => v.resumen),
      ),
    [dia, cola.visitas, idVisita],
  );
  /** Para el avance de la confirmación: aquí sí cuenta esta visita. */
  const diaConTodaLaCola = useMemo(
    () => aplicarEncoladasAlDia(dia, cola.visitas.map((v) => v.resumen)),
    [dia, cola.visitas],
  );

  const pendientes = useMemo(
    () => asignacionesPendientesDeLocal(diaConCola, idLocal),
    [diaConCola, idLocal],
  );

  /**
   * De qué asignación es esta visita.
   *
   * Un local puede estar asignado dos veces el mismo día (por ejemplo
   * Branding y Capacitación Virtual). Con varias pendientes no se elige
   * a ciegas: se le pregunta al CAP, porque el resultado acabaría en la
   * fila equivocada.
   */
  const asignacion = useMemo(() => {
    if (esVisitaExtra) return null;
    const todas = asignacionesPendientesDeLocal(diaConCola, idLocal);
    const buscado = idAsignacionUrl || asgElegida;
    if (buscado) {
      return todas.find((p) => p.id_asignacion === buscado) || null;
    }
    return asignacionDeLocal(diaConCola, idLocal);
  }, [diaConCola, idLocal, idAsignacionUrl, asgElegida, esVisitaExtra]);

  /** Hay que preguntar mientras no se sepa de cuál es. */
  const debeElegir =
    !idAsignacionUrl && !asgElegida && !esVisitaExtra && pendientes.length > 1;

  const idAsignacion = asignacion?.id_asignacion || '';
  /** Con asignación, el motivo lo manda la ruta y no se puede cambiar. */
  const motivoFijo = (asignacion?.motivo as Motivo) || null;
  const clave = claveBorrador(idLocal, idAsignacion);

  /**
   * La asignación llega con la ruta, y cuando hay varias el CAP elige
   * después: por eso va aparte de `cargar`. Solo llena lo que la última
   * visita dejó vacío, y nunca encima de lo que el CAP ya tocó.
   */
  const prellenadaCon = useRef('');
  useEffect(() => {
    if (cargando || tocado || !asignacion || !local) return;
    if (prellenadaCon.current === asignacion.id_asignacion) return;
    prellenadaCon.current = asignacion.id_asignacion;
    const desdeAsignacion = leerProcesadores(asignacion.procesador_pos || asignacion.procesador || '', {
      cod_openpay: asignacion.codigo_openpay,
      cod_niubiz: asignacion.codigo_niubiz,
      cod_izipay: asignacion.codigo_izipay,
      cod_culqi: asignacion.codigo_culqi,
    });
    setProcesadores((actual) =>
      hayProcesadores(actual) || !hayProcesadores(desdeAsignacion) ? actual : desdeAsignacion,
    );
    setBeneficiosSel((actual) =>
      hayBeneficios(actual) ? actual : leerBeneficios(asignacion.beneficios || ''),
    );
    setMaterialPop((actual) => actual || leerMaterialPop(asignacion.material_pop || ''));
  }, [cargando, tocado, asignacion, local]);

  // ── Carga ──────────────────────────────────────
  /** Para el refresco por detrás, que no ve el estado de su render. */
  const tocadoRef = useRef(false);
  useEffect(() => {
    tocadoRef.current = tocado;
  }, [tocado]);
  /** Cada carga invalida los refrescos de la anterior (Reintentar). */
  const cargaActual = useRef(0);

  /** Prellenado con la última visita: el CAP solo corrige lo que cambió. */
  const prellenar = useCallback((a: Autocompletado) => {
    const p = prellenadoDesde(a);
    setContacto(p.contacto);
    setCelular(p.celular);
    setProcesadores(p.procesadores);
    setBeneficiosSel(p.beneficios);
    setMaterialPop(p.materialPop);
    // Que la asignación vuelva a completar lo que esto deje vacío.
    prellenadaCon.current = '';
  }, []);

  const cargar = useCallback(async () => {
    const esta = ++cargaActual.current;
    setCargando(true);
    setErrorCarga('');
    try {
      // Los datos del local se piden siempre al servidor (`fresco`): una
      // copia de hace 5 min puede ser de antes de la última visita. Si el
      // celular ya tiene una, se pinta con ella y la fresca llega por
      // detrás; sin señal, se queda la copia con su aviso.
      const copia = localDelDiaEnCache<Autocompletado>(idLocal);
      const pedido = getLocalDelDia<Autocompletado>(idLocal, undefined, undefined, { fresco: true });
      const rDia = await getRutaDeHoy();
      if (rDia.ok && rDia.data) setDia(rDia.data);

      if (copia) {
        setLocal(copia.datos);
        setCopiaDeLas(0);
        prellenar(copia.datos);
        pedido.then((r) => {
          if (esta !== cargaActual.current || !r.ok || !r.data) return;
          setLocal(r.data);
          setCopiaDeLas(r.deCache ? r.guardadoEn || 0 : 0);
          // Nunca encima de lo que el CAP ya marcó o escribió.
          if (!r.deCache && !tocadoRef.current) prellenar(r.data);
        }, () => {
          /* sin respuesta: se queda la copia */
        });
        return;
      }

      const rLocal = await pedido;
      if (!rLocal.ok || !rLocal.data) {
        setErrorCarga(rLocal.error || 'No se encontró este local');
        return;
      }
      setLocal(rLocal.data);
      setCopiaDeLas(rLocal.deCache ? rLocal.guardadoEn || 0 : 0);
      prellenar(rLocal.data);
    } catch {
      setErrorCarga('No se pudo conectar con el servidor. Intenta de nuevo.');
    } finally {
      // Pase lo que pase. Sin esto, cualquier excepción deja el
      // esqueleto puesto y al CAP sin un botón que tocar.
      setCargando(false);
    }
  }, [idLocal, prellenar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * El borrador se lee aparte porque su clave depende de la asignación,
   * que solo se conoce al llegar la ruta del día. Si esto viviera dentro
   * de `cargar`, cambiar la clave volvería a disparar la carga y se
   * pediría el local dos veces a Apps Script.
   */
  useEffect(() => {
    if (cargando || debeElegir || guardada) return;
    if (borradorTieneAlgo(leerBorrador(clave))) setOfreceBorrador(true);
  }, [cargando, debeElegir, guardada, clave]);

  useEffect(() => {
    if (motivoFijo) setMotivo(motivoFijo);
  }, [motivoFijo]);

  // ── Borrador automático ────────────────────────
  useEffect(() => {
    if (!tocado || guardada || ofreceBorrador || debeElegir) return;
    guardarBorrador(clave, {
      idVisita,
      paso,
      motivo,
      status,
      tipoIncidencia,
      contacto,
      celular,
      procesador: procesadoresATexto(procesadores),
      ...procesadores.codigos,
      beneficios: beneficiosATexto(beneficiosSel),
      material_pop: materialPop,
      observacion,
    });
  }, [
    tocado, guardada, ofreceBorrador, debeElegir, clave, idVisita, paso, motivo, status,
    tipoIncidencia, contacto, celular, procesadores, beneficiosSel, materialPop, observacion,
  ]);

  function continuarBorrador() {
    const b = leerBorrador(clave);
    setOfreceBorrador(false);
    if (!b) return;
    // El id del borrador manda: puede que ese envío ya llegara a medias.
    if (b.idVisita) setIdVisita(b.idVisita);
    setPaso(b.paso || 1);
    if (!motivoFijo) setMotivo(b.motivo);
    setStatus(b.status);
    setTipoIncidencia(b.tipoIncidencia || '');
    setContacto(b.contacto || '');
    setCelular(b.celular || '');
    // Pasa por los mismos lectores: los borradores de antes de los chips
    // (texto libre) se marcan igual.
    setProcesadores(
      leerProcesadores(b.procesador || '', {
        cod_openpay: b.cod_openpay,
        cod_niubiz: b.cod_niubiz,
        cod_izipay: b.cod_izipay,
        cod_culqi: b.cod_culqi,
      }),
    );
    setBeneficiosSel(leerBeneficios(b.beneficios || ''));
    setMaterialPop(leerMaterialPop(b.material_pop || ''));
    setObservacion(b.observacion || '');
    setTocado(true);
  }

  function empezarDeNuevo() {
    borrarBorrador(clave);
    setIdVisita(nuevaIdVisita()); // visita nueva, identificador nuevo
    setOfreceBorrador(false);
  }

  // ── Fotos ──────────────────────────────────────
  async function agregarFotos(files: FileList | null) {
    if (!files || !files.length) return;
    const espacio = MAX_FOTOS - fotos.length;
    setComprimiendo(true);
    setError('');

    // Se parte de las que ya hay para ir controlando el peso acumulado.
    const aceptadas = [...fotos];
    let noProcesables = 0;
    let noCaben = 0;

    for (const f of Array.from(files).slice(0, espacio)) {
      let comprimida: string | null;
      try {
        // Si no cabe con la compresión normal, se intenta una más fuerte
        // antes de rechazarla.
        comprimida = await comprimirParaQueQuepa(aceptadas, (ajustes) =>
          comprimirImagen(f, ajustes),
        );
      } catch {
        // Avisamos ahora, al elegirla, no al guardar con el formulario
        // ya lleno. Antes se enviaba el original sin comprimir.
        noProcesables++;
        continue;
      }
      if (!comprimida) {
        noCaben++;
        continue;
      }
      aceptadas.push(comprimida);
    }

    setComprimiendo(false);
    setFotos(aceptadas);
    setTocado(true);

    const avisos: string[] = [];
    if (noProcesables > 0) {
      avisos.push(
        `${noProcesables === 1 ? 'Una foto no se pudo procesar' : `${noProcesables} fotos no se pudieron procesar`}. Tómalas con la cámara en vez de elegirlas de la galería.`,
      );
    }
    if (noCaben > 0) {
      avisos.push(
        `${noCaben === 1 ? 'Una foto no cabe' : `${noCaben} fotos no caben`}: ya llevas ${pesoLegible(pesoTotal(aceptadas))} y el máximo por visita es ${pesoLegible(TOPE_FOTOS)}.`,
      );
    }
    if (avisos.length) setError(avisos.join(' '));
  }

  // ── Dictado ────────────────────────────────────
  function alternarDictado() {
    if (dictando) {
      reconocimiento.current?.stop();
      return;
    }
    const w = window as unknown as Record<string, new () => never>;
    const Motor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Motor) return;

    const r = new Motor() as unknown as {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    r.lang = 'es-PE';
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (e) => {
      const dicho = e.results[0][0].transcript;
      setObservacion((prev) => (prev ? `${prev} ${dicho}` : dicho));
      setTocado(true);
    };
    r.onend = () => setDictando(false);
    r.onerror = () => setDictando(false);
    reconocimiento.current = r;
    r.start();
    setDictando(true);
  }

  // ── Navegación entre pasos ─────────────────────
  function validarPaso1(): string {
    if (!motivo) return 'Elige qué hiciste en el local';
    if (!status) return 'Elige cómo resultó la visita';
    if (status === 'Incidencia' && !tipoIncidencia) {
      return 'Elige qué tipo de incidencia fue';
    }
    return '';
  }

  function avanzar() {
    if (paso === 1) {
      const fallo = validarPaso1();
      if (fallo) return setError(fallo);
    }
    if (paso === 2 && !celularEsValido(celular)) {
      return setError('Revisa el celular antes de continuar');
    }
    setError('');
    setPaso((p) => Math.min(3, p + 1));
    window.scrollTo({ top: 0 });
  }

  function retroceder() {
    setError('');
    setPaso((p) => Math.max(1, p - 1));
    window.scrollTo({ top: 0 });
  }

  function irAlLogin() {
    // El borrador ya está guardado: al volver se ofrece continuarlo.
    marcarSesionExpirada();
    clearSession();
    router.replace('/login');
  }

  function salir() {
    if (tocado && !guardada) return setConfirmaSalida(true);
    router.back();
  }

  // ── Guardado ───────────────────────────────────
  async function guardar() {
    if (guardando || !local) return; // el doble toque no crea dos visitas
    setGuardando(true);
    setError('');
    setPuedeReintentar(false);

    // La hora real: la del primer toque de Guardar. "Reintentar envío"
    // conserva la misma, y la cola la reenvía tal cual en cada intento.
    guardadoEn.current = fijarCreadoEn(guardadoEn.current, idVisita);
    const creadoEn = guardadoEn.current.creadoEn;

    const peticion = armarPeticionVisita(
      local,
      {
        procesador: procesadoresATexto(procesadores),
        ...procesadores.codigos,
        beneficios: beneficiosATexto(beneficiosSel),
        material_pop: materialPop,
        motivo,
        contacto,
        celular,
        status,
        observacion: componerObservacion(tipoIncidencia, observacion),
      },
      { fotosBase64: fotos, idAsignacion, idVisita, creadoEn },
    );

    // Al volver a abrir este local (aunque sea sin señal) debe verse esta
    // visita, no la copia de antes.
    const recordarVisitaEnElLocal = () =>
      actualizarLocalTrasVisita(local.id_local, local, datosTrasVisita(peticion, getUsuario()?.nombre || ''));

    // Las fotos ya se controlan al elegirlas, así que esto no debería
    // saltar nunca. Si salta, no se envía: Vercel la cortaría con un 413.
    if (!peticionCabe(peticion)) {
      setGuardando(false);
      setError(
        `La visita pesa ${pesoLegible(pesoPeticion(peticion))} y el máximo es ${pesoLegible(LIMITE_PETICION)}. Quita una foto e intenta de nuevo.`,
      );
      return;
    }

    // Primero se guarda en el celular: si el CAP cierra la app, o se va
    // la señal, la visita y sus fotos siguen ahí. El próximo intento de la
    // cola se deja para después del límite del envío inmediato.
    const entrada = {
      ...nuevaEntrada(
        idVisita,
        peticion,
        {
          comercio: local.comercio,
          status,
          idAsignacion,
          idLocal: local.id_local,
        },
        getUsuario()?.correo || '',
        creadoEn,
      ),
      proximoIntento: Date.now() + MS_LIMITE_GUARDADO + 30_000,
    };

    // En cuanto está en el celular se enseña la confirmación, y el envío
    // sigue por detrás: antes el CAP esperaba la subida de las fotos a
    // Drive y otra llamada a Apps Script para el avance. Hoy marca la
    // parada como hecha al instante (la cola cuenta) y la confirmación va
    // diciendo "Enviando… / Enviada ✓ / Pendiente de envío".
    if (await guardarYEnviar(entrada)) {
      recordarVisitaEnElLocal();
      borrarBorrador(clave);
      setGuardando(false);
      setGuardada(true);
      window.scrollTo({ top: 0 });
      return;
    }

    // Sin IndexedDB (modo privado) no hay dónde dejarla: se envía
    // esperando la respuesta, como antes.
    const r = await api('registrarVisita', peticion, {
      msLimite: MS_LIMITE_GUARDADO,
      redirigirSiVence: false,
    });
    // `repetida` es un éxito: el backend reconoció el id porque un envío
    // anterior sí llegó, aunque el CAP no viera la confirmación.
    const resultado = queHacerTrasEnvio(r);
    const mensajeError = r.error || '';

    if (resultado === 'reintentar') {
      setGuardando(false);
      setPuedeReintentar(true);
      setError(
        `${mensajeError || 'No pudimos confirmar el envío.'} Puedes reintentar: la visita no se duplicará.`,
      );
      return;
    }
    if (resultado === 'sesion') {
      // No se redirige solo: las fotos viven en esta pantalla y el CAP
      // tiene que saber qué va a perder antes de irse.
      setGuardando(false);
      setSesionVencida(true);
      setError(
        'Tu sesión venció. Al volver a entrar recuperarás lo que escribiste, pero tendrás que adjuntar las fotos de nuevo.',
      );
      return;
    }
    if (resultado === 'error') {
      setGuardando(false);
      setError(mensajeError || 'No se pudo guardar la visita');
      return;
    }

    recordarVisitaEnElLocal();
    borrarBorrador(clave);
    // La ruta del día cambió. Se pide por detrás: la confirmación no espera.
    invalidarRutaDeHoy();
    getRutaDeHoy(true).then((rDia) => {
      if (rDia.ok && rDia.data) setDia(rDia.data);
    });
    setGuardando(false);
    setGuardada(true);
    window.scrollTo({ top: 0 });
  }

  // ══════════════════════════════════════════════
  if (cargando) return <Esqueleto />;

  if (errorCarga || !local) {
    return (
      <main className="mx-auto max-w-md px-5 pt-pantalla">
        <ErrorDeCarga
          detalle={errorCarga}
          onReintentar={cargar}
          onVolver={() => router.back()}
        />
      </main>
    );
  }

  if (guardada) {
    return (
      <Confirmacion
        local={local}
        dia={diaConTodaLaCola}
        idVisita={idVisita}
        onIniciarSesion={irAlLogin}
        onVerHistorial={() => router.replace('/historial')}
      />
    );
  }

  // La misma línea que ven Hoy y el Detalle: para puerta calle el
  // catálogo fija mall_puerta = "Puerta Calle", que no identifica nada.
  const ubicacion = [ubicacionDe(local), local.id_local]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mx-auto max-w-md px-5 pb-barra pt-seguro">
      {/* ── Cabecera y progreso: fijos arriba, bajo la hora ── */}
      <div className="encabezado-fijo -mx-5 px-5 pb-2.5 pt-2">
      <header className="flex items-center gap-2">
        <button
          onClick={salir}
          aria-label="Salir del registro"
          className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-ink"
        >
          <IconX className="h-5 w-5" />
        </button>
        <p className="flex-1 text-center text-[15px] font-bold">
          Registrar visita
        </p>
        <span className="w-11 text-right text-[13px] font-semibold text-ink-2">
          {paso}/3
        </span>
      </header>

      {/* ── Progreso ── */}
      <div className="mt-3 flex gap-1.5">
        {PASOS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < paso ? 'bg-primary' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between">
        {PASOS.map((nombre, i) => (
          <span
            key={nombre}
            className={`text-[11px] font-semibold ${
              i + 1 === paso ? 'text-primary' : 'text-ink-2'
            }`}
          >
            {i + 1} · {nombre}
          </span>
        ))}
      </div>
      </div>

      {!enLinea && (
        <p className="mt-3 rounded-xl bg-warn-light px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">
          Sin señal. Guardaremos la visita y se enviará sola al recuperar conexión.
        </p>
      )}

      {copiaDeLas > 0 && (
        <p className="mt-3 rounded-xl bg-warn-light px-3.5 py-2.5 text-[12.5px] font-medium text-warn">
          Datos del local de las {horaDe(copiaDeLas)}: no se pudieron actualizar.
        </p>
      )}

      {/* ── Tarjeta del local ── */}
      <div className="card mt-4 flex items-center gap-3 p-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-light text-primary">
          <IconStore />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{local.comercio}</p>
          <p className="truncate text-[12.5px] text-ink-2">{ubicacion}</p>
        </div>
        {/* Si viene de una asignación, el local no se cambia. */}
        {!idAsignacion && (
          <button
            onClick={() => router.push('/registrar')}
            className="shrink-0 px-1 text-[13px] font-semibold text-primary"
          >
            Cambiar
          </button>
        )}
      </div>

      {paso === 1 && (
        <Paso1
          motivo={motivo}
          motivoFijo={motivoFijo}
          status={status}
          tipoIncidencia={tipoIncidencia}
          onMotivo={(m) => {
            setMotivo(m);
            setTocado(true);
          }}
          onStatus={(s) => {
            setStatus(s);
            if (s !== 'Incidencia') setTipoIncidencia('');
            setTocado(true);
          }}
          onTipo={(t) => {
            setTipoIncidencia(t);
            setTocado(true);
          }}
        />
      )}

      {paso === 2 && (
        <Paso2
          contacto={contacto}
          celular={celular}
          procesadores={procesadores}
          beneficios={beneficiosSel}
          materialPop={materialPop}
          ultimaVisita={local.ultima_visita}
          onContacto={(v) => {
            setContacto(v);
            setTocado(true);
          }}
          onCelular={(v) => {
            setCelular(v);
            setTocado(true);
          }}
          onProcesadores={(v) => {
            setProcesadores(v);
            setTocado(true);
          }}
          onBeneficios={(v) => {
            setBeneficiosSel(v);
            setTocado(true);
          }}
          onMaterialPop={(v) => {
            setMaterialPop(v);
            setTocado(true);
          }}
        />
      )}

      {paso === 3 && (
        <Paso3
          fotos={fotos}
          comprimiendo={comprimiendo}
          observacion={observacion}
          dictando={dictando}
          motivo={motivo}
          status={status}
          tipoIncidencia={tipoIncidencia}
          camaraRef={camaraRef}
          galeriaRef={galeriaRef}
          onArchivos={agregarFotos}
          onQuitarFoto={(i) =>
            setFotos((prev) => prev.filter((_, idx) => idx !== i))
          }
          onObservacion={(v) => {
            setObservacion(v);
            setTocado(true);
          }}
          onDictar={alternarDictado}
        />
      )}

      {error && (
        <div className="mt-4 rounded-xl bg-err-light px-4 py-3 text-sm font-medium text-err">
          {error}
        </div>
      )}

      {/* ── Botones ── */}
      <div className="fixed inset-x-0 bottom-0 z-30 barra-ios px-5 pt-3 pb-barra-fija">
        <div className="mx-auto flex max-w-md gap-2">
          {paso > 1 && (
            <button
              onClick={retroceder}
              aria-label="Paso anterior"
              className="grid min-h-[52px] w-14 place-items-center rounded-2xl border border-line text-ink-2 active:scale-[0.98]"
            >
              <IconChevronLeft />
            </button>
          )}
          {paso < 3 ? (
            <button
              onClick={avanzar}
              className="btn-grad flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 active:scale-[0.98]"
            >
              Continuar
              <IconChevronRight />
            </button>
          ) : (
            <button
              onClick={sesionVencida ? irAlLogin : guardar}
              disabled={guardando}
              className="btn-grad flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 active:scale-[0.98] disabled:opacity-60"
            >
              {guardando ? (
                <>
                  <span className="spinner !h-5 !w-5 !border-white/30 !border-t-white" />
                  Guardando…
                </>
              ) : sesionVencida ? (
                'Iniciar sesión'
              ) : puedeReintentar ? (
                'Reintentar envío'
              ) : (
                'Guardar visita'
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Varias asignaciones hoy: hay que preguntar cuál ── */}
      {debeElegir && (
        <ElegirAsignacion
          pendientes={pendientes}
          comercio={local.comercio}
          onElegir={(id) => setAsgElegida(id)}
          onExtra={() => setEsVisitaExtra(true)}
        />
      )}

      {/* ── Borrador ── */}
      {!debeElegir && ofreceBorrador && (
        <BottomSheet
          titulo="Tienes un registro sin terminar"
          subtitulo={local.comercio}
          onClose={empezarDeNuevo}
        >
          <div className="space-y-3">
            <p className="text-[14px] leading-snug text-ink-2">
              Guardamos lo que habías escrito en este local. ¿Lo retomamos?
            </p>
            <button
              onClick={continuarBorrador}
              className="btn-grad min-h-[52px] w-full rounded-2xl text-[15px] font-semibold text-white active:scale-[0.98]"
            >
              Continuar borrador
            </button>
            <button
              onClick={empezarDeNuevo}
              className="min-h-[52px] w-full rounded-2xl bg-gris-light text-[15px] font-semibold text-ink-2 active:scale-[0.98]"
            >
              Empezar de nuevo
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Confirmar salida ── */}
      {confirmaSalida && (
        <BottomSheet
          titulo="¿Salir del registro?"
          onClose={() => setConfirmaSalida(false)}
        >
          <div className="space-y-3">
            <p className="text-[14px] leading-snug text-ink-2">
              Lo que escribiste se guarda como borrador y podrás retomarlo
              desde este mismo local.
            </p>
            <button
              onClick={() => router.back()}
              className="min-h-[52px] w-full rounded-2xl bg-err-light text-[15px] font-semibold text-err active:scale-[0.98]"
            >
              Salir
            </button>
            <button
              onClick={() => setConfirmaSalida(false)}
              className="min-h-[52px] w-full rounded-2xl bg-gris-light text-[15px] font-semibold text-ink-2 active:scale-[0.98]"
            >
              Seguir aquí
            </button>
          </div>
        </BottomSheet>
      )}
    </main>
  );
}

// ══════════════════════════════════════════════════
//  ¿Cuál de las asignaciones de hoy?
//
//  Solo aparece cuando el local tiene más de una pendiente y la URL no
//  dice cuál. Sin esto se elegía la primera en silencio y el resultado
//  acababa en la fila equivocada.
// ══════════════════════════════════════════════════
function ElegirAsignacion({
  pendientes,
  comercio,
  onElegir,
  onExtra,
}: {
  pendientes: Parada[];
  comercio: string;
  onElegir: (idAsignacion: string) => void;
  onExtra: () => void;
}) {
  const ahora = new Date();

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40">
      <div className="animate-sheet-up flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-surface">
        <div className="flex justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-line" />
        </div>

        <div className="px-5 pb-3 pt-3">
          <p className="text-lg font-bold">¿Cuál estás registrando?</p>
          <p className="text-[13px] text-ink-2">
            {comercio} tiene {pendientes.length} visitas asignadas para hoy
          </p>
        </div>

        <div className="space-y-2.5 overflow-y-auto px-5 pb-6">
          {pendientes.map((p) => {
            const estado = estadoTemporal(p, ahora);
            return (
              <button
                key={p.id_asignacion}
                onClick={() => onElegir(p.id_asignacion)}
                className="card flex w-full items-center gap-3 border border-line p-4 text-left !shadow-none active:scale-[0.99]"
              >
                <span
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                    MOTIVO_CLS[p.motivo as Motivo] || 'bg-gris-light text-ink-2'
                  }`}
                >
                  {ICONO_MOTIVO[p.motivo as Motivo] || <IconStore />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.motivo}</p>
                  {estado !== 'flexible' && (
                    <p className="text-[12.5px] text-ink-2">
                      {textoEstado(p, ahora)}
                    </p>
                  )}
                </div>
                <IconChevronRight className="shrink-0 text-ink-2" />
              </button>
            );
          })}

          <button
            onClick={onExtra}
            className="min-h-[52px] w-full rounded-2xl bg-gris-light text-[14px] font-semibold text-ink-2 active:scale-[0.98]"
          >
            Ninguna, es una visita extra
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
//  Paso 1 · Resultado
// ══════════════════════════════════════════════════
function Paso1({
  motivo,
  motivoFijo,
  status,
  tipoIncidencia,
  onMotivo,
  onStatus,
  onTipo,
}: {
  motivo: Motivo | null;
  motivoFijo: Motivo | null;
  status: Status | null;
  tipoIncidencia: string;
  onMotivo: (m: Motivo) => void;
  onStatus: (s: Status) => void;
  onTipo: (t: string) => void;
}) {
  return (
    <>
      <h2 className="mb-2.5 mt-6 text-[17px] font-bold">
        ¿Qué hiciste en el local?
      </h2>
      {motivoFijo && (
        <p className="mb-2.5 -mt-1.5 text-[12.5px] text-ink-2">
          Viene de tu ruta de hoy, por eso no se puede cambiar
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {MOTIVOS.map((m) => {
          const activo = motivo === m.valor;
          const bloqueado = !!motivoFijo && motivoFijo !== m.valor;
          return (
            <button
              key={m.valor}
              onClick={() => !motivoFijo && onMotivo(m.valor)}
              disabled={bloqueado}
              className={`flex min-h-[64px] items-center gap-2.5 rounded-2xl border p-3.5 text-left transition disabled:opacity-40 ${
                activo
                  ? `border-current ${MOTIVO_CLS[m.valor]}`
                  : 'border-line bg-surface'
              }`}
            >
              <span className={activo ? '' : 'text-ink-2'}>
                {ICONO_MOTIVO[m.valor]}
              </span>
              <span className="text-[13px] font-semibold">{m.label}</span>
              {activo && <IconCheck className="ml-auto h-4 w-4" />}
            </button>
          );
        })}
      </div>

      <h2 className="mb-2.5 mt-6 text-[17px] font-bold">¿Cómo resultó?</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {STATUS_LISTA.map((s) => {
          const activo = status === s;
          return (
            <button
              key={s}
              onClick={() => onStatus(s)}
              className={`flex min-h-[64px] items-center gap-2.5 rounded-2xl border p-3 text-left transition ${
                activo ? STATUS_CLS[s].fuerte : 'border-line bg-surface'
              }`}
            >
              {/* El color del resultado se ve antes de elegir, no solo al elegir. */}
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition ${
                  activo ? STATUS_CLS[s].iconoActivo : STATUS_CLS[s].icono
                }`}
              >
                {ICONO_STATUS[s]}
              </span>
              <span
                className={`text-[13px] font-semibold ${activo ? '' : 'text-ink'}`}
              >
                {s}
              </span>
            </button>
          );
        })}
      </div>

      {status === 'Incidencia' && (
        <div className="mt-4 rounded-2xl border border-err/30 bg-err-light/40 p-4">
          <p className="text-[14px] font-bold text-err">
            ¿Qué tipo de incidencia?
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {TIPOS_INCIDENCIA.map((t) => (
              <button
                key={t}
                onClick={() => onTipo(t)}
                className={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
                  tipoIncidencia === t
                    ? 'bg-err text-sobre-estado'
                    : 'border border-line bg-surface text-ink-2'
                }`}
              >
                {tipoIncidencia === t && <IconCheck className="h-3.5 w-3.5" />}
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════
//  Paso 2 · Datos del local
// ══════════════════════════════════════════════════
function Paso2({
  contacto,
  celular,
  procesadores,
  beneficios,
  materialPop,
  ultimaVisita,
  onContacto,
  onCelular,
  onProcesadores,
  onBeneficios,
  onMaterialPop,
}: {
  contacto: string;
  celular: string;
  procesadores: SeleccionProcesadores;
  beneficios: SeleccionBeneficios;
  materialPop: MaterialPop;
  ultimaVisita: string;
  onContacto: (v: string) => void;
  onCelular: (v: string) => void;
  onProcesadores: (v: SeleccionProcesadores) => void;
  onBeneficios: (v: SeleccionBeneficios) => void;
  onMaterialPop: (v: MaterialPop) => void;
}) {
  // Los cuatro de la lista y, detrás, los que venían escritos y no son de ella.
  const opcionesProcesador = [...PROCESADORES.map((p) => p.valor as string), ...procesadores.extras];

  return (
    <>
      <h2 className="mb-1 mt-6 text-[17px] font-bold">Datos del local</h2>
      <p className="mb-4 text-[12.5px] text-ink-2">
        {ultimaVisita
          ? `Vienen de la visita del ${ultimaVisita.split(' ')[0]}. Corrige solo lo que cambió.`
          : 'Este local no tiene visitas previas: completa lo que puedas.'}
      </p>

      <div className="space-y-5">
        <CampoTexto
          id="contacto"
          label="Personal que atendió"
          valor={contacto}
          placeholder="¿Quién te atendió?"
          onCambio={onContacto}
        />
        <CampoTexto
          id="celular"
          label="Celular o teléfono"
          valor={celular}
          placeholder="987654321 o 011234567"
          modo="tel"
          fallo={errorCelular(celular)}
          onCambio={onCelular}
        />

        <div>
          <GrupoChips id="procesador" titulo="Procesador POS">
            {opcionesProcesador.map((p) => (
              <Chip
                key={p}
                texto={p}
                marcado={procesadores.marcados.includes(p)}
                onTocar={() => onProcesadores(alternarProcesador(procesadores, p))}
              />
            ))}
          </GrupoChips>
          {/* Solo los códigos de los marcados: desmarcar borra el suyo. */}
          {PROCESADORES.filter((p) => procesadores.marcados.includes(p.valor)).map((p) => (
            <div key={p.campo} className="mt-3">
              <CampoTexto
                id={p.campo}
                label={p.etiqueta}
                valor={procesadores.codigos[p.campo]}
                onCambio={(v) =>
                  onProcesadores({ ...procesadores, codigos: { ...procesadores.codigos, [p.campo]: v } })
                }
              />
            </div>
          ))}
        </div>

        <div>
          <p id="material-pop" className={ETIQUETA_CAMPO}>
            Material POP
          </p>
          <div
            role="radiogroup"
            aria-labelledby="material-pop"
            className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-campo p-1"
          >
            {MATERIAL_POP.map((m) => {
              const activo = materialPop === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => onMaterialPop(m)}
                  className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-[14px] font-semibold transition ${
                    activo ? 'bg-primary text-white' : 'text-ink-2'
                  }`}
                >
                  {activo && <IconCheck className="h-3.5 w-3.5" />}
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <GrupoChips id="beneficios" titulo="Beneficios activos">
            {BENEFICIOS.map((b) => (
              <Chip
                key={b}
                texto={b}
                marcado={beneficios.marcados.includes(b)}
                onTocar={() => onBeneficios(alternarBeneficio(beneficios, b))}
              />
            ))}
            {/* Desmarcar Otro esconde el texto pero no lo borra: si se
                vuelve a marcar, sigue ahí. Solo se guarda si está marcado. */}
            <Chip
              texto="Otro"
              marcado={beneficios.otro}
              onTocar={() => onBeneficios({ ...beneficios, otro: !beneficios.otro })}
            />
          </GrupoChips>
          {beneficios.otro && (
            <div className="mt-3">
              <CampoTexto
                id="beneficio-otro"
                label="Otro beneficio"
                valor={beneficios.textoOtro}
                placeholder="2x1 jueves, 20% dscto…"
                onCambio={(v) => onBeneficios({ ...beneficios, textoOtro: v })}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const ETIQUETA_CAMPO = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-2';

function CampoTexto({
  id,
  label,
  valor,
  placeholder,
  modo,
  fallo = '',
  onCambio,
}: {
  id: string;
  label: string;
  valor: string;
  placeholder?: string;
  modo?: 'tel';
  fallo?: string;
  onCambio: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={ETIQUETA_CAMPO}>
        {label}
      </label>
      <input
        id={id}
        value={valor || ''}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        inputMode={modo}
        aria-invalid={!!fallo}
        className={`w-full rounded-xl border bg-campo px-4 py-3 text-[15px] outline-none focus:ring-4 ${
          fallo
            ? 'border-err focus:border-err focus:ring-err/10'
            : 'border-line focus:border-primary focus:ring-primary/10'
        }`}
      />
      {/* El error va junto al campo, no en un bloque al final. */}
      {fallo && <p className="mt-1 text-[12px] font-medium text-err">{fallo}</p>}
    </div>
  );
}

/** Varias opciones para marcar: el lector de pantalla las anuncia juntas. */
function GrupoChips({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <>
      <p id={`${id}-titulo`} className={ETIQUETA_CAMPO}>
        {titulo}
      </p>
      <div role="group" aria-labelledby={`${id}-titulo`} className="flex flex-wrap gap-2">
        {children}
      </div>
    </>
  );
}

/** Se marca y se desmarca; aria-pressed dice en qué estado está. */
function Chip({ texto, marcado, onTocar }: { texto: string; marcado: boolean; onTocar: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={marcado}
      onClick={onTocar}
      className={`flex min-h-11 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
        marcado ? 'bg-primary text-white' : 'border border-line bg-surface text-ink-2'
      }`}
    >
      {marcado && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
      <span className="min-w-0 break-words text-left">{texto}</span>
    </button>
  );
}

// ══════════════════════════════════════════════════
//  Paso 3 · Evidencia
// ══════════════════════════════════════════════════
function Paso3({
  fotos,
  comprimiendo,
  observacion,
  dictando,
  motivo,
  status,
  tipoIncidencia,
  camaraRef,
  galeriaRef,
  onArchivos,
  onQuitarFoto,
  onObservacion,
  onDictar,
}: {
  fotos: string[];
  comprimiendo: boolean;
  observacion: string;
  dictando: boolean;
  motivo: Motivo | null;
  status: Status | null;
  tipoIncidencia: string;
  camaraRef: React.RefObject<HTMLInputElement | null>;
  galeriaRef: React.RefObject<HTMLInputElement | null>;
  onArchivos: (f: FileList | null) => void;
  onQuitarFoto: (i: number) => void;
  onObservacion: (v: string) => void;
  onDictar: () => void;
}) {
  const [puedeDictar, setPuedeDictar] = useState(false);
  // Se comprueba en el cliente: en el servidor no hay navegador.
  useEffect(() => setPuedeDictar(hayDictado()), []);

  const quedan = MAX_FOTOS - fotos.length;

  return (
    <>
      <div className="mb-2.5 mt-6 flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">Evidencia</h2>
        <span className="text-[12.5px] text-ink-2">
          {fotos.length} de {MAX_FOTOS} fotos
          {fotos.length > 0 && ` · ${pesoLegible(pesoTotal(fotos))}`}
        </span>
      </div>

      <input
        ref={camaraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => onArchivos(e.target.files)}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onArchivos(e.target.files)}
      />

      {fotos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f}
                alt={`Foto ${i + 1}`}
                className="h-20 w-20 rounded-xl object-cover"
              />
              <button
                onClick={() => onQuitarFoto(i)}
                aria-label={`Quitar foto ${i + 1}`}
                className="toque-44 absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-err text-sobre-estado"
              >
                <IconX className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {quedan > 0 && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => camaraRef.current?.click()}
            disabled={comprimiendo}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary-light text-[14px] font-semibold text-primary active:scale-[0.98] disabled:opacity-60"
          >
            <IconCamera className="h-5 w-5" />
            {comprimiendo ? 'Procesando…' : 'Tomar foto'}
          </button>
          <button
            onClick={() => galeriaRef.current?.click()}
            disabled={comprimiendo}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[14px] font-semibold text-ink active:scale-[0.98] disabled:opacity-60"
          >
            <IconImage className="h-5 w-5" />
            Galería
          </button>
        </div>
      )}

      <div className="mt-6">
        <label
          htmlFor="observacion"
          className="mb-1.5 block text-[17px] font-bold"
        >
          Observaciones
        </label>
        <div className="relative">
          <textarea
            id="observacion"
            value={observacion}
            onChange={(e) => onObservacion(e.target.value)}
            placeholder="Describe lo que encontraste…"
            rows={4}
            className={`w-full resize-none rounded-xl border border-line bg-campo py-3 pl-4 text-[15px] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 ${
              puedeDictar ? 'pr-16' : 'pr-4'
            }`}
          />
          {/* Solo si el navegador lo soporta. */}
          {puedeDictar && (
            <button
              onClick={onDictar}
              aria-label={dictando ? 'Detener dictado' : 'Dictar por voz'}
              className={`absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-xl transition ${
                dictando
                  ? 'animate-pulse bg-err text-sobre-estado'
                  : 'bg-primary text-white'
              }`}
            >
              <IconMic className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Resumen ── */}
      <div className="card mt-6 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">
          Resumen
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {motivo && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${MOTIVO_CLS[motivo]}`}
            >
              {motivo}
            </span>
          )}
          {status && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${STATUS_CLS[status].suave}`}
            >
              {status}
              {tipoIncidencia && ` · ${tipoIncidencia}`}
            </span>
          )}
          <span className="rounded-full bg-gris-light px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-2">
            {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}
          </span>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════
//  Confirmación
// ══════════════════════════════════════════════════
function Confirmacion({
  local,
  dia,
  idVisita,
  onIniciarSesion,
  onVerHistorial,
}: {
  local: Autocompletado;
  dia: DiaData | null;
  idVisita: string;
  onIniciarSesion: () => void;
  onVerHistorial: () => void;
}) {
  const router = useRouter();
  // El envío sigue por detrás: esto se actualiza solo cuando avanza.
  const cola = useCola();
  const entrada = cola.visitas.find((v) => v.idVisita === idVisita);
  const estado = estadoDeVisita({
    enCola: entrada,
    // Hasta leer la cola no se sabe: mejor "enviando" que un "enviada" falso.
    enVuelo: cola.enVuelo.includes(idVisita) || !cola.leida,
    sesionVencida: cola.sesionVencida,
  });
  const enCola = estado === 'pendiente' || estado === 'sesion' || estado === 'revisar';
  const ruta = useMemo(() => ordenarRuta(paradasDelDia(dia)), [dia]);
  const hechas = ruta.filter(estaCompletada).length;
  const total = ruta.length;
  const siguiente: Parada | null = useMemo(
    () => siguienteParada(ruta),
    [ruta],
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 text-center py-seguro">
      <span
        className={`mx-auto grid h-24 w-24 place-items-center rounded-full ${
          enCola ? 'bg-warn-light text-warn' : 'bg-ok-light text-ok'
        }`}
      >
        <IconCheck className="h-12 w-12" />
      </span>

      {enCola ? (
        <>
          <h1 className="mt-5 text-[24px] font-bold">Visita guardada en el celular</h1>
          <p className="mt-2 text-[14px] text-ink-2">
            {estado === 'sesion'
              ? 'Tu sesión venció. Inicia sesión y se enviará sola.'
              : estado === 'revisar'
                ? `No se pudo registrar: ${entrada?.ultimoError || 'el servidor no la aceptó'}. Sigue guardada; revísala en Historial.`
                : 'Se enviará sola al recuperar señal.'}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-5 text-[26px] font-bold">¡Visita guardada!</h1>
          <p className="mt-2 text-[14px] text-ink-2">
            {local.comercio}
            {local.mall_puerta && ` · ${tituloBonito(local.mall_puerta)}`} quedó
            registrada.
          </p>
        </>
      )}

      {/* El envío en vivo: Enviando… → Enviada ✓, o Pendiente de envío. */}
      <p
        role="status"
        aria-live="polite"
        className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold ${
          estado === 'enviada'
            ? 'bg-ok-light text-ok'
            : estado === 'enviando'
              ? 'bg-primary-light text-primary'
              : 'bg-warn-light text-warn'
        }`}
      >
        {estado === 'enviando' && <span className="spinner !h-3.5 !w-3.5 !border-2" />}
        {TEXTO_ESTADO[estado]}
      </p>

      {total > 0 && (
        <div className="card mt-6 p-4 text-left">
          <div className="flex items-baseline justify-between">
            <span className="text-[14px] font-semibold">Avance de hoy</span>
            <span className="text-[15px] font-bold">
              {hechas} de {total}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <div
              className="btn-grad h-full rounded-full transition-all"
              style={{ width: `${total ? (hechas / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {siguiente && (
        <div className="card mt-3 border border-primary/25 p-4 text-left">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-2">
            Siguiente
          </p>
          <p className="mt-0.5 font-bold">{siguiente.comercio}</p>
          <p className="text-[12.5px] text-ink-2">
            {[siguiente.hora, siguiente.motivo].filter(Boolean).join(' · ')}
          </p>
        </div>
      )}

      <div className="mt-auto space-y-2 pt-8">
        {estado === 'revisar' && (
          <button
            onClick={onVerHistorial}
            className="btn-grad flex min-h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            Ver en Historial
          </button>
        )}
        {estado === 'sesion' && (
          <button
            onClick={onIniciarSesion}
            className="btn-grad flex min-h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            Iniciar sesión
          </button>
        )}
        {estado !== 'sesion' && estado !== 'revisar' && siguiente?.id_local && (
          <button
            onClick={() =>
              router.replace(
                `/local/${encodeURIComponent(siguiente.id_local as string)}`,
              )
            }
            className="btn-grad flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            <IconPlay className="h-[18px] w-[18px]" />
            Ir a la siguiente visita
          </button>
        )}
        <button
          onClick={() => router.replace('/hoy')}
          className="min-h-[52px] w-full rounded-2xl text-[15px] font-semibold text-primary"
        >
          Volver al inicio
        </button>
      </div>
    </main>
  );
}

function Esqueleto() {
  return (
    <main className="mx-auto max-w-md animate-pulse px-5 pt-pantalla">
      <div className="h-11 w-full rounded bg-line/60" />
      <div className="mt-3 h-1.5 w-full rounded-full bg-line" />
      <div className="mt-4 h-[66px] rounded-2xl bg-line/70" />
      <div className="mt-6 h-6 w-48 rounded bg-line" />
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-line/50" />
        ))}
      </div>
    </main>
  );
}
