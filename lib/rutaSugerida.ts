// ══════════════════════════════════════════════════
//  Ruta sugerida por cercanía
//
//  Con la ubicación del CAP, en qué orden hacer las paradas
//  pendientes: la más cercana primero y después la más
//  cercana a esa, con una pasada 2-opt para quitar cruces.
//  Todo se calcula en el celular; la ubicación no se envía.
//
//  Las Capacitaciones Presenciales con hora son anclas: no
//  se mueven de su horario. El orden se arma alrededor de
//  ellas simulando el día con una velocidad y un tiempo por
//  visita (las constantes de abajo, para poder ajustarlas).
//  Las Virtuales no son un lugar al que ir: quedan fuera del
//  orden y solo se avisan por su hora.
// ══════════════════════════════════════════════════

import {
  distanciaMetros,
  MAX_M_MISMO_LUGAR,
  type Coordenadas,
  type ParadaEnMapa,
} from './mapa.ts';
import {
  estaCompletada,
  estaVencida,
  esHoraFlexible,
  esVirtual,
  finEnMinutos,
  horaAMinutos,
  horaNormalizada,
  minutosDelDia,
  minutosHasta,
  type Parada,
} from './ruta.ts';

/** Velocidad media en la ciudad, con tráfico. */
export const VELOCIDAD_KMH = 20;
/** Lo que dura una visita en un local. */
export const MINUTOS_POR_VISITA = 20;
/** Moverse menos que esto no cambia el orden: es ruido del GPS o una cuadra. */
export const M_RECALCULO = 300;
/** Cada tanto se recalcula igual: las anclas dependen de la hora. */
export const MS_RECALCULO = 10 * 60_000;
/** Una lectura menos precisa que esto no mueve el orden. */
export const PRECISION_MAXIMA_M = 100;
/** Con cuánta anticipación se avisa de una capacitación. */
export const MINUTOS_AVISO_CAPACITACION = 60;

const MOTIVO_PRESENCIAL = 'Capacitación Presencial';

/** Una presencial con hora que todavía se puede hacer: no se mueve de su horario. */
export function esAncla(p: Parada, ahora = new Date()): boolean {
  return p.motivo === MOTIVO_PRESENCIAL && !esHoraFlexible(p) && !estaVencida(p, ahora);
}

/** Uno o varios locales en el mismo sitio (un mall): una sola parada del orden. */
export interface Lugar {
  /** En el orden de la ruta. */
  paradas: ParadaEnMapa[];
  centro: Coordenadas;
  /** Minutos del día en que empieza y termina, si es un ancla. */
  ancla: { inicio: number; fin: number } | null;
}

export interface Paso {
  lugar: Lugar;
  /** Desde la ubicación del CAP (el primero) o desde el paso anterior. */
  metrosDesdeAnterior: number;
  /** Minuto del día estimado de llegada. */
  llegadaMin: number;
}

export interface RutaSugerida {
  pasos: Paso[];
  totalMetros: number;
  /** Pendientes sin coordenadas: van al final de la lista. */
  sinUbicacion: ParadaEnMapa[];
  /** "Capacitación a las 11:00", si empieza pronto. */
  aviso: string;
}

function minutosDeViaje(metros: number): number {
  return (metros / 1000 / VELOCIDAD_KMH) * 60;
}

/**
 * Las pendientes con coordenadas (sin las virtuales), juntas por lugar: a
 * menos de MAX_M_MISMO_LUGAR del primer local de un lugar, es ese lugar.
 * No se usa la agrupación del mapa, que depende del zoom: el orden no
 * puede cambiar al acercar o alejar.
 */
export function lugaresPendientes(paradas: ParadaEnMapa[], ahora = new Date()): Lugar[] {
  const lugares: Lugar[] = [];
  for (const p of paradas) {
    if (!p.coordenadas || estaCompletada(p.parada) || esVirtual(p.parada)) continue;
    const lugar = lugares.find((l) => distanciaMetros(l.paradas[0].coordenadas!, p.coordenadas!) <= MAX_M_MISMO_LUGAR);
    if (lugar) lugar.paradas.push(p);
    else lugares.push({ paradas: [p], centro: p.coordenadas, ancla: null });
  }
  for (const l of lugares) {
    const cs = l.paradas.map((p) => p.coordenadas!);
    l.centro = {
      lat: cs.reduce((s, c) => s + c.lat, 0) / cs.length,
      lng: cs.reduce((s, c) => s + c.lng, 0) / cs.length,
    };
    // Si en el lugar hay una capacitación con hora, el lugar entero espera a esa hora.
    const anclas = l.paradas
      .filter((p) => esAncla(p.parada, ahora))
      .map((p) => ({ inicio: horaAMinutos(p.parada.hora) as number, fin: finEnMinutos(p.parada) as number }))
      .sort((a, b) => a.inicio - b.inicio);
    l.ancla = anclas[0] || null;
  }
  return lugares;
}

/** Largo de un recorrido que sale de `inicio`, pasa por los lugares y, si hay, llega a `fin`. */
function largo(inicio: Coordenadas, lugares: Lugar[], fin: Coordenadas | null): number {
  let total = 0;
  let pos = inicio;
  for (const l of lugares) {
    total += distanciaMetros(pos, l.centro);
    pos = l.centro;
  }
  return fin ? total + distanciaMetros(pos, fin) : total;
}

/**
 * 2-opt: da la vuelta a un trozo del recorrido si así queda más corto, y
 * repite hasta que no mejora. Los extremos quedan fijos (la ubicación del
 * CAP o un ancla), así que el tiempo hasta el ancla siguiente no crece.
 */
export function dosOpt(inicio: Coordenadas, tramo: Lugar[], fin: Coordenadas | null): Lugar[] {
  let mejor = [...tramo];
  let mejorLargo = largo(inicio, mejor, fin);
  for (let mejoro = true; mejoro; ) {
    mejoro = false;
    for (let i = 0; i < mejor.length - 1; i++) {
      for (let k = i + 1; k < mejor.length; k++) {
        const prueba = [...mejor.slice(0, i), ...mejor.slice(i, k + 1).reverse(), ...mejor.slice(k + 1)];
        const l = largo(inicio, prueba, fin);
        // Un margen de 1 m: sin él, dos órdenes iguales se alternan sin fin.
        if (l < mejorLargo - 1) {
          mejor = prueba;
          mejorLargo = l;
          mejoro = true;
        }
      }
    }
  }
  return mejor;
}

function masCercano(lugares: Lugar[], pos: Coordenadas): Lugar {
  return lugares.reduce((a, b) => (distanciaMetros(pos, b.centro) < distanciaMetros(pos, a.centro) ? b : a));
}

function duracion(l: Lugar): number {
  return MINUTOS_POR_VISITA * l.paradas.length;
}

/**
 * El orden sugerido desde `origen`. Simula el día: va al lugar libre más
 * cercano, salvo que con esa visita ya no llegue a tiempo al ancla
 * siguiente; entonces va al ancla, espera a su hora y sigue desde ahí.
 */
export function sugerirRuta(paradas: ParadaEnMapa[], origen: Coordenadas, ahora = new Date()): RutaSugerida {
  const lugares = lugaresPendientes(paradas, ahora);
  const libres = lugares.filter((l) => !l.ancla);
  const anclas = lugares.filter((l) => l.ancla).sort((a, b) => a.ancla!.inicio - b.ancla!.inicio);

  // 1. Vecino más cercano, alrededor de las anclas. Cada tramo de libres
  //    queda entre dos puntos fijos para el 2-opt.
  const tramos: { inicio: Coordenadas; libres: Lugar[]; ancla: Lugar | null }[] = [];
  let tramo = { inicio: origen, libres: [] as Lugar[], ancla: null as Lugar | null };
  let pos = origen;
  let t = minutosDelDia(ahora);
  const irAlAncla = () => {
    const a = anclas.shift()!;
    t = Math.max(t + minutosDeViaje(distanciaMetros(pos, a.centro)), a.ancla!.inicio) + (a.ancla!.fin - a.ancla!.inicio);
    pos = a.centro;
    tramo.ancla = a;
    tramos.push(tramo);
    tramo = { inicio: a.centro, libres: [], ancla: null };
  };
  while (libres.length || anclas.length) {
    if (!libres.length) {
      irAlAncla();
      continue;
    }
    const candidato = masCercano(libres, pos);
    const llegada = t + minutosDeViaje(distanciaMetros(pos, candidato.centro));
    const siguiente = anclas[0];
    if (siguiente) {
      const alAncla = llegada + duracion(candidato) + minutosDeViaje(distanciaMetros(candidato.centro, siguiente.centro));
      if (alAncla > siguiente.ancla!.inicio) {
        irAlAncla();
        continue;
      }
    }
    t = llegada + duracion(candidato);
    pos = candidato.centro;
    tramo.libres.push(candidato);
    libres.splice(libres.indexOf(candidato), 1);
  }
  tramos.push(tramo);

  // 2. 2-opt en cada tramo, con sus extremos fijos.
  const orden = tramos.flatMap((tr) => [
    ...dosOpt(tr.inicio, tr.libres, tr.ancla ? tr.ancla.centro : null),
    ...(tr.ancla ? [tr.ancla] : []),
  ]);

  // 3. Distancias y horas de llegada del orden final.
  const pasos: Paso[] = [];
  pos = origen;
  t = minutosDelDia(ahora);
  let totalMetros = 0;
  for (const lugar of orden) {
    const metros = distanciaMetros(pos, lugar.centro);
    const llegada = t + minutosDeViaje(metros);
    pasos.push({ lugar, metrosDesdeAnterior: metros, llegadaMin: Math.round(llegada) });
    totalMetros += metros;
    t = lugar.ancla ? Math.max(llegada, lugar.ancla.inicio) + (lugar.ancla.fin - lugar.ancla.inicio) : llegada + duracion(lugar);
    pos = lugar.centro;
  }

  return {
    pasos,
    totalMetros,
    sinUbicacion: paradas.filter((p) => !p.coordenadas && !estaCompletada(p.parada) && !esVirtual(p.parada)),
    aviso: avisoCapacitacion(paradas.map((p) => p.parada), ahora),
  };
}

/**
 * "Capacitación a las 11:00" (o "Capacitación virtual a las 11:00") si
 * la próxima capacitación pendiente con hora empieza dentro de
 * MINUTOS_AVISO_CAPACITACION. Vacío si no.
 */
export function avisoCapacitacion(paradas: Parada[], ahora = new Date()): string {
  const proxima = paradas
    .filter((p) => (p.motivo === MOTIVO_PRESENCIAL || esVirtual(p)) && !estaCompletada(p) && !esHoraFlexible(p))
    .map((p) => ({ p, falta: minutosHasta(p.hora, ahora) as number }))
    .filter(({ falta }) => falta >= 0 && falta <= MINUTOS_AVISO_CAPACITACION)
    .sort((a, b) => a.falta - b.falta)[0];
  if (!proxima) return '';
  return `${esVirtual(proxima.p) ? 'Capacitación virtual' : 'Capacitación'} a las ${horaNormalizada(proxima.p.hora)}`;
}

/** El número de cada parada (su número en la ruta) en el orden sugerido. */
export function numerosSugeridos(ruta: RutaSugerida): Map<number, number> {
  const m = new Map<number, number>();
  ruta.pasos.forEach((paso, i) => paso.lugar.paradas.forEach((p) => m.set(p.numero, i + 1)));
  return m;
}

// ── Cuándo recalcular ─────────────────────────────

/** Identifica el conjunto de paradas pendientes: si cambia, se recalcula. */
export function clavePendientes(paradas: ParadaEnMapa[]): string {
  return paradas
    .filter((p) => !estaCompletada(p.parada))
    .map((p) => p.parada.id_asignacion || `#${p.numero}`)
    .sort()
    .join('|');
}

export interface Calculo {
  clave: string;
  origen: Coordenadas;
  /** Milisegundos epoch. */
  en: number;
}

/**
 * Recalcular solo cuando vale la pena: la primera vez, al cambiar las
 * pendientes (también por una visita que sigue en la cola), cada
 * MS_RECALCULO, o al moverse más de M_RECALCULO con una lectura precisa.
 * Así el orden no salta por el ruido del GPS.
 */
export function debeRecalcular(
  anterior: Calculo | null,
  ahora: { clave: string; ubicacion: Coordenadas & { precision: number }; en: number },
): boolean {
  if (!anterior) return true;
  if (anterior.clave !== ahora.clave) return true;
  if (ahora.en - anterior.en >= MS_RECALCULO) return true;
  return (
    ahora.ubicacion.precision <= PRECISION_MAXIMA_M &&
    distanciaMetros(anterior.origen, ahora.ubicacion) > M_RECALCULO
  );
}
