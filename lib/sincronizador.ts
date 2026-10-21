// ══════════════════════════════════════════════════
//  Cuándo se envía la cola (solo navegador)
//
//  La política (qué se envía, qué se borra, cuánto se
//  espera) vive en sincronizacion.ts y está probada.
//  Aquí solo se decide CUÁNDO: al abrir la app, al volver
//  la señal, al volver a primer plano, al tocar Reintentar
//  y con un temporizador hasta el próximo intento.
//
//  iOS no deja enviar nada con la app cerrada, así que la
//  cola solo avanza con la app abierta.
// ══════════════════════════════════════════════════

import { api, MS_LIMITE_GUARDADO } from './api.ts';
import { getUsuario } from './auth.ts';
import { invalidarRutaDeHoy } from './cacheDia.ts';
import { colaIndexedDB, delUsuario, EVENTO_COLA } from './cola.ts';
import {
  procesarCola,
  esperaEnvioManual,
  type ResultadoSincronizacion,
} from './sincronizacion.ts';

let enCurso: Promise<ResultadoSincronizacion | null> | null = null;
let sesionVencida = false;
let temporizador: ReturnType<typeof setTimeout> | null = null;

/** El mayor retraso que acepta setTimeout sin desbordarse. */
const MAX_TIMEOUT = 2_147_483_647;

export function correoConectado(): string {
  return getUsuario()?.correo || '';
}

function sinSenal(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function avisar() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENTO_COLA));
}

export interface EstadoSincronizacion {
  enCurso: boolean;
  /** La última pasada se detuvo porque la sesión venció. */
  sesionVencida: boolean;
}

export function estadoSincronizacion(): EstadoSincronizacion {
  return { enCurso: !!enCurso, sesionVencida };
}

/**
 * Envía lo que toque de la cola. Si ya hay una pasada en marcha devuelve
 * esa: nunca van dos a la vez.
 * @param forzar se salta las esperas. Lo usa el botón Reintentar.
 */
export function sincronizar(forzar = false): Promise<ResultadoSincronizacion | null> {
  if (enCurso) return enCurso;
  enCurso = ejecutar(forzar)
    .catch(() => null)
    .finally(() => {
      enCurso = null;
      avisar();
      programarSiguiente();
    });
  avisar();
  return enCurso;
}

async function ejecutar(forzar: boolean): Promise<ResultadoSincronizacion | null> {
  const correo = correoConectado();
  if (!correo || sinSenal()) return null;

  const pasada = () =>
    procesarCola({
      almacen: colaIndexedDB,
      correo,
      forzar,
      // Sin redirigir: esto corre detrás de cualquier pantalla y un salto
      // al login a media visita haría perder las fotos del formulario.
      enviar: (payload) =>
        api('registrarVisita', payload, {
          msLimite: MS_LIMITE_GUARDADO,
          redirigirSiVence: false,
        }),
    });

  // Con dos pestañas abiertas, el candado del navegador evita que las
  // dos envíen la misma visita a la vez.
  const r =
    typeof navigator !== 'undefined' && navigator.locks?.request
      ? await navigator.locks.request('rw-cola', pasada)
      : await pasada();

  sesionVencida = r.sesionVencida;
  // Hoy tiene que enseñar lo que ya llegó al backend.
  if (r.enviadas > 0) invalidarRutaDeHoy();
  return r;
}

/** Deja programada la próxima pasada para cuando toque el siguiente intento. */
async function programarSiguiente() {
  if (temporizador) clearTimeout(temporizador);
  temporizador = null;
  // Sin señal se espera al evento `online`; con la sesión vencida, al login.
  if (sinSenal() || sesionVencida) return;

  const mias = delUsuario(await colaIndexedDB.listar(), correoConectado()).filter(
    (v) => !esperaEnvioManual(v),
  );
  if (!mias.length) return;

  const proximo = Math.min(...mias.map((v) => v.proximoIntento));
  const espera = Math.min(Math.max(1000, proximo - Date.now()), MAX_TIMEOUT);
  temporizador = setTimeout(() => sincronizar(), espera);
}

let persistenciaPedida = false;

/**
 * Pide al navegador que no borre lo guardado cuando le falte espacio.
 * En iPhone sin la app instalada puede que no lo conceda: por eso el
 * envío se intenta siempre en el momento y la cola dura poco.
 */
export function pedirAlmacenamientoPersistente() {
  if (persistenciaPedida || typeof navigator === 'undefined') return;
  persistenciaPedida = true;
  navigator.storage?.persist?.().catch(() => {});
}
