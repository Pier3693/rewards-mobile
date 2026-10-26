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

/** Las variables --color-* de un bloque, en hex o en rgba(). */
function variablesDe(bloque: string): Record<string, string> {
  const v: Record<string, string> = {};
  for (const m of bloque.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))\s*;/g)) v[m[1]] = m[2];
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

/**
 * Exige AA a un texto sobre un fondo del tema oscuro. Si el fondo es
 * transparente (un chip al 20 %), se compone sobre `base`.
 */
function exigirAA(fondo: string, texto: string, base = 'surface', paleta = OSCURO) {
  const f = paleta[fondo] ?? fondo;
  const t = paleta[texto] ?? texto;
  const b = paleta[base] ?? base;
  const c = contraste(t, f, b);
  assert.ok(c >= AA, `${texto} (${t}) sobre ${fondo} (${f}) da ${c.toFixed(2)}:1, hace falta ${AA}`);
}

const STATUS = [
  { fondo: 'ok-light', texto: 'ok-texto', relleno: 'ok' },
  { fondo: 'err-light', texto: 'err-texto', relleno: 'err' },
  { fondo: 'warn-light', texto: 'warn-texto', relleno: 'warn' },
  { fondo: 'gris-suave', texto: 'gris-texto', relleno: 'gris' },
];
const MOTIVOS = ['visita', 'branding', 'presencial', 'virtual'];

describe('modo oscuro estilo iOS', () => {
  test('fondos neutros, sin tinte azul', () => {
    assert.equal(OSCURO.bg.toLowerCase(), '#000000');
    assert.equal(OSCURO.surface.toLowerCase(), '#1c1c1e');
    assert.equal(OSCURO.campo.toLowerCase(), '#2c2c2e');
    assert.equal(OSCURO.line.toLowerCase(), '#38383a');
  });

  test('los colores del sistema de iOS', () => {
    assert.deepEqual(
      [OSCURO.ok, OSCURO.err, OSCURO.warn, OSCURO.gris].map((c) => c.toLowerCase()),
      ['#30d158', '#ff453a', '#ffd60a', '#8e8e93'],
    );
    assert.deepEqual(
      ['branding', 'presencial', 'virtual'].map((m) => OSCURO[`motivo-${m}`].toLowerCase()),
      ['#ff9f0a', '#bf5af2', '#64d2ff'],
    );
  });

  // Un chip de motivo nunca puede confundirse con uno de status.
  test('motivos y status nunca comparten color', () => {
    const status = STATUS.flatMap((s) => [OSCURO[s.relleno], OSCURO[s.texto]]);
    const motivos = MOTIVOS.flatMap((m) => [OSCURO[`motivo-${m}`], OSCURO[`motivo-${m}-texto`]]);
    for (const m of motivos) {
      assert.ok(!status.map((c) => c.toLowerCase()).includes(m.toLowerCase()), `${m} se repite`);
    }
  });

  test('la barra del celular es negra', () => {
    assert.equal(COLOR_BARRA.dark, '#000000');
  });
});

describe('contraste AA en modo oscuro', () => {
  test('el texto principal y el secundario, sobre fondo, tarjeta e input', () => {
    for (const fondo of ['bg', 'surface', 'campo']) {
      exigirAA(fondo, 'ink', 'bg');
      exigirAA(fondo, 'ink-2', 'bg');
    }
  });

  // Chips: el color al 20 % sobre la tarjeta, con el texto en el fuerte.
  test('cada status, sobre su chip y sobre la tarjeta', () => {
    for (const s of STATUS) {
      exigirAA(s.fondo, s.texto);
      exigirAA('surface', s.texto);
    }
  });

  test('cada motivo, sobre su chip y sobre la tarjeta', () => {
    for (const m of MOTIVOS) {
      exigirAA(`motivo-${m}-light`, `motivo-${m}-texto`);
      exigirAA('surface', `motivo-${m}-texto`);
    }
  });

  test('el morado de marca como texto se lee', () => {
    exigirAA('surface', 'primary-texto');
    exigirAA('primary-light', 'primary-texto');
  });

  // Botones principales y gradiente: #3D35C8 con texto blanco.
  test('el morado de marca no cambia y su texto blanco cumple AA', () => {
    assert.equal(OSCURO.primary.toLowerCase(), '#3d35c8');
    exigirAA('primary', '#ffffff');
  });

  // Lo que va encima de un relleno verde, rojo, amarillo o gris.
  test('el texto sobre los rellenos de status se lee', () => {
    for (const s of STATUS) exigirAA(s.relleno, 'sobre-estado');
  });

  // En claro la paleta es la de siempre: sobre esos rellenos van sobre
  // todo íconos (el seleccionado del paso 1, la X de la foto, el check),
  // que piden 3:1 (WCAG 1.4.11), no 4.5.
  test('en claro, los íconos sobre los rellenos de status se ven (3:1)', () => {
    for (const s of STATUS) {
      const c = contraste(CLARO['sobre-estado'], CLARO[s.relleno]);
      assert.ok(c >= 3, `${s.relleno} da ${c.toFixed(2)}:1`);
    }
  });

  // En claro, blanco sobre el ámbar del status (#d97706) da 3.19:1: el
  // botón usa un ámbar propio, sin tocar los chips de Reprogramar.
  test('el botón ámbar de Hoy cumple AA', () => {
    exigirAA('warn-boton', 'sobre-estado', 'surface', CLARO);
    exigirAA('warn-boton', 'sobre-estado');
    assert.equal(CLARO.warn.toLowerCase(), '#d97706', 'Reprogramar no cambia');
  });

  test('el aviso invertido (fondo ink, texto surface) se lee', () => {
    exigirAA('ink', 'surface');
    exigirAA('ink', 'surface', 'surface', CLARO);
  });
});

describe('contraste', () => {
  test('blanco y negro dan 21:1', () => {
    assert.equal(contraste('#fff', '#000').toFixed(0), '21');
  });

  test('un color consigo mismo da 1:1', () => {
    assert.equal(contraste('#3d35c8', '#3d35c8'), 1);
  });

  // El secundario de iOS va al 60 %: se compone sobre lo que hay debajo.
  test('compone la transparencia sobre el fondo', () => {
    const sobreNegro = contraste('rgba(235,235,245,0.6)', '#000000');
    const opaco = contraste('#8d8d93', '#000000');
    assert.ok(Math.abs(sobreNegro - opaco) < 0.1, `${sobreNegro} vs ${opaco}`);
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
