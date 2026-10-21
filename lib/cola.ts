// ══════════════════════════════════════════════════
//  Cola de visitas pendientes de envío
//
//  Las visitas llevan fotos en base64, así que no caben
//  en localStorage: van en IndexedDB, a pelo y sin
//  dependencias nuevas.
//
//  Una visita NUNCA se descarta: o se envía, o sigue en
//  la cola esperando. Es trabajo de campo que no se puede
//  volver a hacer.
// ══════════════════════════════════════════════════

import type { Status } from './visita.ts';

const BASE = 'rewards-cola';
const ALMACEN = 'visitas';
const VERSION = 1;

/** Lo mínimo para que Hoy cuente la visita sin abrir el payload con las fotos. */
export interface ResumenEncolado {
  comercio: string;
  status: Status | null;
  idAsignacion: string;
  idLocal: string;
}

export interface VisitaEncolada {
  /** Clave primaria. El mismo que viaja como id_visita al backend. */
  idVisita: string;
  /** Los parámetros tal cual se mandan a `registrarVisita`. */
  payload: Record<string, unknown>;
  resumen: ResumenEncolado;
  intentos: number;
  /** Milisegundos epoch a partir de los cuales toca reintentar. */
  proximoIntento: number;
  creadoEn: number;
  /** Último error, para poder explicarle al CAP qué pasa. */
  ultimoError?: string;
}

/** Contrato que usa la sincronización. Permite probarla sin IndexedDB. */
export interface AlmacenCola {
  listar(): Promise<VisitaEncolada[]>;
  guardar(v: VisitaEncolada): Promise<void>;
  borrar(idVisita: string): Promise<void>;
  contar(): Promise<number>;
}

// ── IndexedDB ─────────────────────────────────────

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no guarda visitas sin conexión'));
      return;
    }
    const peticion = indexedDB.open(BASE, VERSION);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'idVisita' });
      }
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

function conAlmacen<T>(
  modo: IDBTransactionMode,
  accion: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(ALMACEN, modo);
        const peticion = accion(tx.objectStore(ALMACEN));
        peticion.onsuccess = () => resolve(peticion.result);
        peticion.onerror = () => reject(peticion.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** La cola real, sobre IndexedDB. */
export const colaIndexedDB: AlmacenCola = {
  async listar() {
    try {
      const todas = await conAlmacen<VisitaEncolada[]>('readonly', (s) =>
        s.getAll() as IDBRequest<VisitaEncolada[]>,
      );
      return ordenarPorAntiguedad(todas || []);
    } catch {
      // Modo privado o almacenamiento bloqueado: mejor vacío que romper.
      return [];
    }
  },

  async guardar(v) {
    await conAlmacen('readwrite', (s) => s.put(v) as IDBRequest<IDBValidKey>);
  },

  async borrar(idVisita) {
    try {
      await conAlmacen('readwrite', (s) => s.delete(idVisita) as IDBRequest<undefined>);
    } catch {
      /* si no se puede borrar, el reenvío lo deduplica el backend */
    }
  },

  async contar() {
    try {
      return await conAlmacen<number>('readonly', (s) => s.count());
    } catch {
      return 0;
    }
  },
};

// ── Helpers puros ─────────────────────────────────

/** La más antigua primero: se envía en el orden en que se hicieron. */
export function ordenarPorAntiguedad(visitas: VisitaEncolada[]): VisitaEncolada[] {
  return [...visitas].sort((a, b) => a.creadoEn - b.creadoEn);
}

/** Crea la entrada para una visita que no se pudo enviar. */
export function nuevaEntrada(
  idVisita: string,
  payload: Record<string, unknown>,
  resumen: ResumenEncolado,
  ahora = Date.now(),
): VisitaEncolada {
  return {
    idVisita,
    payload,
    resumen,
    intentos: 0,
    proximoIntento: ahora,
    creadoEn: ahora,
  };
}

/** Las que corresponden a una asignación concreta. */
export function encoladasDeAsignacion(
  visitas: VisitaEncolada[],
  idAsignacion: string,
): VisitaEncolada[] {
  const id = String(idAsignacion || '').trim();
  if (!id) return [];
  return visitas.filter((v) => v.resumen.idAsignacion === id);
}

/** True si ese local ya tiene una visita esperando a enviarse. */
export function localTieneEncolada(
  visitas: VisitaEncolada[],
  idLocal: string,
): boolean {
  const id = String(idLocal || '').trim().toUpperCase();
  if (!id) return false;
  return visitas.some(
    (v) => String(v.resumen.idLocal || '').trim().toUpperCase() === id,
  );
}
