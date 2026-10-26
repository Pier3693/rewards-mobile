import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

import { resolverTema, esPreferencia, SCRIPT_TEMA, COLOR_BARRA, CLAVE_TEMA } from './tema.ts';
import { contraste, AA } from './contraste.ts';

// ══════════════════════════════════════════════════
//  Contraste: se lee de app/globals.css, así la prueba
//  vigila los colores de verdad y no una copia.
// ══════════════════════════════════════════════════

const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

function variablesDe(bloque: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const m of bloque.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) v[m[1]] = m[2];
  return v;
}

function bloque(selector: string): string {
  const i = CSS.indexOf(selector);
  assert.ok(i >= 0, `no está ${selector} en globals.css`);
  const desde = CSS.indexOf('{', i) + 1;
  return CSS.slice(desde, CSS.indexOf('}', desde));
}

const CLARO = variablesDe(bloque('@theme'));
/** El tema oscuro: lo del bloque oscuro, y lo que no redefine, del claro. */
const OSCURO = { ...CLARO, ...variablesDe(bloque(":root[data-theme='dark']")) };

function exigirAA(fondo: string, texto: string, paleta = OSCURO) {
  const f = paleta[fondo];
  const t = paleta[texto];
  assert.ok(f && t, `faltan --color-${fondo} o --color-${texto}`);
  const c = contraste(f, t);
  assert.ok(c >= AA, `${texto} (${t}) sobre ${fondo} (${f}) da ${c.toFixed(2)}:1, hace falta ${AA}`);
}

describe('contraste AA en modo oscuro', () => {
  test('el texto general sobre el fondo y las tarjetas', () => {
    exigirAA('bg', 'ink');
    exigirAA('surface', 'ink');
    exigirAA('bg', 'ink-2');
    exigirAA('surface', 'ink-2');
  });

  // Chips de status: texto del status sobre su fondo suave, y sobre la tarjeta.
  test('los colores de status, sobre su chip y sobre la tarjeta', () => {
    for (const s of ['ok', 'warn', 'err']) {
      exigirAA(`${s}-light`, `${s}-texto`);
      exigirAA('surface', `${s}-texto`);
    }
    // "No existe" usa gris: ink-2 sobre gris-light.
    exigirAA('gris-light', 'ink-2');
  });

  test('los colores de motivo, sobre su chip y sobre la tarjeta', () => {
    for (const m of ['visita', 'branding', 'presencial', 'virtual']) {
      exigirAA(`motivo-${m}-light`, `motivo-${m}-texto`);
      exigirAA('surface', `motivo-${m}-texto`);
    }
  });

  test('el morado de marca como texto se lee', () => {
    exigirAA('surface', 'primary-texto');
    exigirAA('primary-light', 'primary-texto');
  });

  // Los botones llevan texto blanco sobre el morado, en los dos temas.
  test('el morado de marca no cambia y su texto blanco cumple AA', () => {
    assert.equal(OSCURO.primary.toLowerCase(), '#3d35c8');
    assert.ok(contraste('#ffffff', OSCURO.primary) >= AA);
  });

  test('los avisos invertidos (fondo ink, texto surface) se leen', () => {
    exigirAA('ink', 'surface');
    exigirAA('ink', 'surface', CLARO);
  });
});

describe('contraste', () => {
  test('blanco y negro dan 21:1', () => {
    assert.equal(contraste('#fff', '#000').toFixed(0), '21');
  });

  test('un color consigo mismo da 1:1', () => {
    assert.equal(contraste('#3d35c8', '#3d35c8'), 1);
  });
});

// ══════════════════════════════════════════════════
describe('qué tema toca', () => {
  test('la elección del CAP manda sobre el sistema', () => {
    assert.equal(resolverTema('oscuro', false), 'dark');
    assert.equal(resolverTema('claro', true), 'light');
  });

  test('por defecto sigue al sistema', () => {
    assert.equal(resolverTema('sistema', true), 'dark');
    assert.equal(resolverTema('sistema', false), 'light');
  });

  test('solo se aceptan las tres preferencias', () => {
    assert.equal(esPreferencia('oscuro'), true);
    assert.equal(esPreferencia('dark'), false);
    assert.equal(esPreferencia(null), false);
  });
});

// El script del <head> corre antes de React: se prueba tal cual.
describe('script que pone el tema antes de pintar', () => {
  function correr({
    guardado,
    sistemaOscuro = false,
    storageFalla = false,
  }: { guardado?: string; sistemaOscuro?: boolean; storageFalla?: boolean }) {
    const atributos: Record<string, string> = {};
    const raiz = { setAttribute: (k: string, v: string) => (atributos[k] = v), style: { colorScheme: '' } };
    const meta = { content: '', setAttribute: (_: string, v: string) => (meta.content = v) };
    const contexto = vm.createContext({
      localStorage: {
        getItem: (k: string) => {
          if (storageFalla) throw new Error('SecurityError');
          return k === CLAVE_TEMA ? (guardado ?? null) : null;
        },
      },
      window: { matchMedia: () => ({ matches: sistemaOscuro }) },
      document: { documentElement: raiz, querySelector: () => meta },
    });
    vm.runInContext(SCRIPT_TEMA, contexto);
    return { tema: atributos['data-theme'], esquema: raiz.style.colorScheme, barra: meta.content };
  }

  test('sin elección y sistema oscuro → oscuro, con la barra oscura', () => {
    assert.deepEqual(correr({ sistemaOscuro: true }), {
      tema: 'dark',
      esquema: 'dark',
      barra: COLOR_BARRA.dark,
    });
  });

  test('sin elección y sistema claro → claro, con la barra morada', () => {
    assert.deepEqual(correr({}), { tema: 'light', esquema: 'light', barra: COLOR_BARRA.light });
  });

  test('la elección guardada manda', () => {
    assert.equal(correr({ guardado: 'oscuro' }).tema, 'dark');
    assert.equal(correr({ guardado: 'claro', sistemaOscuro: true }).tema, 'light');
  });

  // Modo privado o almacenamiento bloqueado: no puede romper la carga.
  test('si localStorage falla, sigue al sistema sin romper', () => {
    assert.equal(correr({ storageFalla: true, sistemaOscuro: true }).tema, 'dark');
  });
});
