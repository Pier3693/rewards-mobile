import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  plataformaDe,
  instruccionesDe,
  estaInstalada,
  debeMostrarAviso,
  avisoYaSalio,
  marcarAvisoVisto,
  CLAVE_AVISO,
} from './instalacion.ts';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  escritorio:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

describe('plataforma', () => {
  // En iPhone todos se instalan igual, desde Compartir.
  test('iPhone con Safari, Chrome o Firefox es iOS', () => {
    assert.equal(plataformaDe(UA.iphoneSafari), 'ios');
    assert.equal(plataformaDe(UA.iphoneChrome), 'ios');
    assert.equal(plataformaDe(UA.iphoneFirefox), 'ios');
  });

  test('Android y escritorio', () => {
    assert.equal(plataformaDe(UA.android), 'android');
    assert.equal(plataformaDe(UA.escritorio), 'otro');
  });

  test('las instrucciones de iPhone hablan de Compartir y Agregar a inicio', () => {
    assert.match(instruccionesDe('ios'), /Compartir/);
    assert.match(instruccionesDe('ios'), /Agregar a inicio/);
    assert.match(instruccionesDe('android'), /⋮/);
    assert.ok(instruccionesDe('otro'));
  });
});

describe('ya instalada', () => {
  test('abierta desde el ícono (display-mode standalone)', () => {
    assert.equal(estaInstalada({ matchMedia: () => ({ matches: true }) }), true);
  });

  test('en iPhone, navigator.standalone', () => {
    assert.equal(
      estaInstalada({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }),
      true,
    );
  });

  test('en el navegador, no', () => {
    assert.equal(estaInstalada({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
    assert.equal(estaInstalada(undefined), false);
  });
});

describe('cuándo sale el aviso', () => {
  const base = {
    ruta: '/login',
    yaSalio: false,
    instalada: false,
    plataforma: 'android' as const,
    hayEvento: true,
  };

  test('en el login, la primera vez, sin instalar', () => {
    assert.equal(debeMostrarAviso(base), true);
  });

  // El fallo que se corrige: salía en Historial y en cualquier pantalla.
  test('en ninguna otra pantalla', () => {
    for (const ruta of ['/hoy', '/historial', '/perfil', '/visita/PC-1', null]) {
      assert.equal(debeMostrarAviso({ ...base, ruta }), false, String(ruta));
    }
  });

  test('una sola vez por celular', () => {
    assert.equal(debeMostrarAviso({ ...base, yaSalio: true }), false);
  });

  test('nunca si ya está instalada', () => {
    assert.equal(debeMostrarAviso({ ...base, instalada: true }), false);
  });

  // iPhone no tiene beforeinstallprompt: sale con las instrucciones.
  test('en iPhone sale aunque no haya evento', () => {
    assert.equal(debeMostrarAviso({ ...base, plataforma: 'ios', hayEvento: false }), true);
  });

  test('en Android sin evento, espera al siguiente login', () => {
    assert.equal(debeMostrarAviso({ ...base, hayEvento: false }), false);
  });
});

describe('la marca de "ya salió"', () => {
  function almacen() {
    const datos = new Map<string, string>();
    return {
      datos,
      getItem: (k: string) => datos.get(k) ?? null,
      setItem: (k: string, v: string) => void datos.set(k, v),
    };
  }

  test('se guarda y se lee', () => {
    const a = almacen();
    assert.equal(avisoYaSalio(a), false);
    marcarAvisoVisto(a);
    assert.equal(avisoYaSalio(a), true);
    assert.equal(a.datos.get(CLAVE_AVISO), '1');
  });

  // Por defecto va a localStorage: sessionStorage se borra al cerrar.
  test('va a localStorage, no a sessionStorage', () => {
    const local = almacen();
    const sesion = almacen();
    (globalThis as unknown as { window: unknown }).window = { localStorage: local, sessionStorage: sesion };
    try {
      marcarAvisoVisto();
      assert.equal(local.datos.get(CLAVE_AVISO), '1');
      assert.equal(sesion.datos.size, 0);
      assert.equal(avisoYaSalio(), true);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });

  test('si el almacenamiento falla, no rompe', () => {
    const roto = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    assert.equal(avisoYaSalio(roto), false);
    assert.doesNotThrow(() => marcarAvisoVisto(roto));
    assert.equal(avisoYaSalio(null), false);
  });
});
