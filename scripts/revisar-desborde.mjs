// ══════════════════════════════════════════════════
//  Revisión de desborde horizontal
//
//  Recorre todas las pantallas en un Chrome sin ventana, a
//  ancho de iPhone (375 y 393 px), y confirma que nada es
//  más ancho que la pantalla: scrollWidth === clientWidth,
//  y ningún elemento se sale por los lados.
//
//  Sin dependencias: maneja el Chrome local por el
//  protocolo de DevTools con el WebSocket de Node 22.
//  Las pantallas con sesión se prueban sin tocar Apps
//  Script: /api/gs se responde con datos de mentira, con
//  textos largos a propósito.
//
//  Uso:
//    npm run build && npm start      (en otra terminal)
//    npm run revisar:desborde
//    npm run revisar:desborde -- --sin-seguro
//      (desactiva el overflow-x: clip de html/body para ver
//       la causa en vez de taparla)
//
//  Variables: BASE_URL (por defecto http://localhost:3000),
//  CHROME_PATH, SALIDA (carpeta de las capturas) y PANTALLAS
//  (solo esas, separadas por coma: PANTALLAS=mapa,mapa-hoja).
// ══════════════════════════════════════════════════

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const SALIDA = process.env.SALIDA || join(tmpdir(), 'rw-desborde');
const SIN_SEGURO = process.argv.includes('--sin-seguro');
const PUERTO = 9333;

const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const VIEWPORTS = [
  { ancho: 375, alto: 667 }, // iPhone SE
  { ancho: 393, alto: 852 }, // iPhone con Dynamic Island
];
const TEMAS = ['light', 'dark'];

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// ── Datos de mentira, con textos largos a propósito ──

const LARGO = 'Supermercados Nacionales Plaza Vea Express Gran Mercado del Sur';
const DIRECCION = 'Avenida Alfredo Benavides 5440, Urbanización Las Gardenias, Santiago de Surco';
const OBSERVACION =
  'El encargado pidió revisar https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing antes de la próxima visita y dejar el material POP completo.';
const CORREO = 'capacitador.de.campo.con.correo.muy.largo@rewardsperu.com';

const parada = (id, local, campos = {}) => ({
  id_asignacion: id,
  comercio: LARGO,
  mall_puerta: 'Jockey Plaza Centro Comercial Shopping Center',
  direccion: DIRECCION,
  distrito: 'Santiago de Surco',
  motivo: 'Visita',
  status: 'Pendiente',
  resultado: '',
  indicaciones: 'Preguntar por el administrador de turno y revisar el POS de la caja principal',
  hora: '10:30',
  hora_fin: '',
  estado: '',
  meet_link: '',
  id_local: local,
  beneficios: '6 PSI',
  ...campos,
});

const local = (id) => ({
  id_local: id,
  tipo: 'CC',
  comercio: LARGO,
  mall_puerta: 'Jockey Plaza Centro Comercial Shopping Center',
  direccion: DIRECCION,
  distrito: 'Santiago de Surco',
  kam: 'Kam Responsable Con Nombre Completo',
  psi: 'Si',
  puntos_bbva: '',
  procesador_pos: 'Niubiz',
  codigo_openpay: 'OP-1234567890123456',
  codigo_niubiz: '1234567890123456789',
  codigo_izipay: '',
  beneficios: 'Descuento de 20% con tarjeta, 2x1 los martes y puntos dobles en fechas especiales',
  material_pop: 'Afiche, stopper, habladores y cenefa',
  contacto_nombre: 'Rosa María Fernández de los Santos',
  contacto_cel: '987654321',
  ultima_visita: '20/10/2026 10:00',
  ultimo_status: 'Incidencia',
  ultima_observacion: '[Falta material POP] ' + OBSERVACION,
  ultimo_cap: 'Capacitador De Campo',
  ultimo_motivo: 'Branding',
});

const hoy = new Date();
const fechaHoy = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;

/** 1×1 transparente. */
const PNG_VACIO =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

const RESPUESTAS = {
  getAsignacionesDia: {
    ok: true,
    data: {
      fecha: fechaHoy,
      pendientes: [
        // Coordenadas en dos de las tres, para el mapa.
        parada('ASG-1', 'PC-0001', { lat: -12.1211, lng: -77.0297, geo_estado: 'OK' }),
        parada('ASG-2', 'CC-0002', { motivo: 'Capacitación Virtual', meet_link: 'meet.google.com/abc-defg-hij', hora: '12:00', hora_fin: '13:00', estado: 'rango' }),
        parada('ASG-3', 'CC-0003', {
          motivo: 'Branding',
          hora: '15:00',
          mall_puerta: 'Puerta Calle',
          direccion: 'Cal. Libertad Nro. 130 (1Er Piso)',
          lat: -12.0886,
          lng: -77.0158,
          geo_estado: 'Aproximado',
        }),
        // En el mismo mall que ASG-1: el mapa las agrupa.
        parada('ASG-4', 'CC-0004', { motivo: 'Capacitación Presencial', hora: '11:00', lat: -12.1211, lng: -77.0297, geo_estado: 'OK' }),
      ],
      completadas: [
        parada('ASG-0', 'PC-0009', { status: 'Completado', resultado: 'Incidencia', hora: '09:00', lat: -12.1105, lng: -77.0352, geo_estado: 'OK' }),
      ],
      total: 5,
    },
  },
  getAutocompletado: (cuerpo) => ({ ok: true, data: local(cuerpo.id_local || 'PC-0001') }),
  buscarComercio: { ok: true, data: [local('PC-0001'), local('CC-0002')] },
  getMisVisitas: {
    ok: true,
    data: [
      {
        id_visita: 'v-1',
        fecha: `${fechaHoy} 10:45`,
        id_local: 'PC-0001',
        comercio: LARGO,
        mall_puerta: 'Puerta Calle',
        direccion: DIRECCION,
        motivo: 'Capacitación Presencial',
        status: 'Incidencia',
        observacion: '[Falta material POP] ' + OBSERVACION,
        fotos: 'https://drive.google.com/file/d/AbCdEf123/view, https://drive.google.com/file/d/GhIjKl456/view',
      },
      {
        id_visita: '',
        fecha: '20/10/2026 16:10',
        id_local: 'CC-0002',
        comercio: LARGO,
        mall_puerta: 'Jockey Plaza Centro Comercial Shopping Center',
        direccion: DIRECCION,
        motivo: 'Branding',
        status: 'No existe',
        observacion: '',
        fotos: '2 foto(s) - no se pudieron subir',
      },
    ],
  },
  getTradeList: { ok: true, data: ['Trade Marketing Con Un Nombre Bastante Largo', 'Otro'] },
  registrarVisita: { ok: true, data: { fotos: 0 } },
  registrarCampana: { ok: true },
};

function respuestaPara(cuerpo) {
  const r = RESPUESTAS[cuerpo.action];
  if (!r) return { ok: true, data: [] };
  return typeof r === 'function' ? r(cuerpo) : r;
}

// ── Protocolo de DevTools, mínimo ────────────────

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendientes = new Map();
    this.oyentes = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pendientes.has(m.id)) {
        const { resolver, rechazar } = this.pendientes.get(m.id);
        this.pendientes.delete(m.id);
        if (m.error) rechazar(new Error(`${m.error.message} (${m.error.code})`));
        else resolver(m.result);
      } else if (m.method) {
        for (const o of this.oyentes) o(m);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((resolver, rechazar) => this.pendientes.set(id, { resolver, rechazar }));
  }
  on(fn) {
    this.oyentes.push(fn);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cierra Chrome y todos sus procesos hijos. */
function cerrarChrome(proceso) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proceso.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    proceso.kill();
  }
}

async function abrirChrome() {
  const ruta = CHROMES.find((c) => existsSync(c));
  if (!ruta) throw new Error('No encontré Chrome. Pon su ruta en CHROME_PATH.');
  const perfil = mkdtempSync(join(tmpdir(), 'rw-chrome-'));
  const proceso = spawn(
    ruta,
    ['--headless=new', `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, '--no-first-run', '--disable-gpu', 'about:blank'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PUERTO}/json/version`)).json();
      const ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((r, x) => {
        ws.addEventListener('open', r);
        ws.addEventListener('error', x);
      });
      return { cdp: new Cdp(ws), proceso, ws };
    } catch {
      await esperar(200);
    }
  }
  cerrarChrome(proceso);
  throw new Error('Chrome no abrió el puerto de depuración.');
}

/** Una pestaña aislada (su propio localStorage) con el celular emulado. */
async function nuevaPestana(cdp, { ancho, alto }, tema) {
  const { browserContextId } = await cdp.send('Target.createBrowserContext');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Network.enable');
  // Sin service worker: así /api/gs llega siempre a la intercepción.
  await s('Network.setBypassServiceWorker', { bypass: true });
  await s('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 3, mobile: true });
  await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s('Emulation.setUserAgentOverride', { userAgent: UA_IPHONE });
  await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: tema }] });

  // /api/gs con datos de mentira.
  // Los mosaicos del mapa, con un PNG vacío: la prueba no pide nada a OpenStreetMap.
  await s('Fetch.enable', { patterns: [{ urlPattern: '*/api/gs*' }, { urlPattern: '*tile.openstreetmap.org*' }] });
  cdp.on(async (m) => {
    if (m.sessionId !== sessionId || m.method !== 'Fetch.requestPaused') return;
    if (m.params.request.url.includes('tile.openstreetmap.org')) {
      await s('Fetch.fulfillRequest', {
        requestId: m.params.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'image/png' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
        ],
        body: PNG_VACIO,
      }).catch(() => {});
      return;
    }
    let cuerpo = {};
    try {
      cuerpo = JSON.parse(m.params.request.postData || '{}');
    } catch {
      /* sin cuerpo */
    }
    const body = Buffer.from(JSON.stringify(respuestaPara(cuerpo))).toString('base64');
    await s('Fetch.fulfillRequest', {
      requestId: m.params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body,
    }).catch(() => {});
  });

  if (SIN_SEGURO) {
    // Se quita el overflow-x: clip de html/body para ver la causa real.
    await s('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded', () => {
        const e = document.createElement('style');
        e.textContent = 'html, body { overflow-x: visible !important; }';
        document.head.appendChild(e);
      });`,
    });
  }

  const evaluar = async (expresion) => {
    const r = await s('Runtime.evaluate', { expression: expresion, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'error en la página');
    return r.result.value;
  };

  const ir = async (ruta, ms = 1500) => {
    const cargada = new Promise((r) => {
      const fn = (m) => {
        if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') r();
      };
      cdp.on(fn);
    });
    await s('Page.navigate', { url: BASE + ruta });
    await Promise.race([cargada, esperar(15000)]);
    await esperar(ms);
  };

  const captura = async (nombre) => {
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SALIDA, `${nombre}.png`), Buffer.from(data, 'base64'));
  };

  const cerrar = () => cdp.send('Target.disposeBrowserContext', { browserContextId });

  return { evaluar, ir, captura, cerrar };
}

// ── Lo que se mide en cada pantalla ──────────────

/** Con DIAGNOSTICO=1 se listan TODOS los que se salen, también los de tamaño 0 o dentro de un scroll. */
const DIAGNOSTICO = process.env.DIAGNOSTICO === '1';

const MEDIR = `(() => {
  const cw = document.documentElement.clientWidth;
  const dentroDeScroll = (e) => {
    for (let p = e.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const describir = (e) => {
    const c = typeof e.className === 'string' ? e.className : (e.className && e.className.baseVal) || '';
    return e.tagName.toLowerCase() + (c ? '.' + c.trim().split(/\\s+/).slice(0, 6).join('.') : '');
  };
  const todos = ${DIAGNOSTICO};
  const malos = [];
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if (!todos && (!r.width || !r.height)) continue;
    if (r.right <= cw + 1 && r.left >= -1) continue;
    if (!todos && dentroDeScroll(e)) continue;
    malos.push({
      elemento: describir(e),
      sobraDerecha: Math.round(r.right - cw),
      sobraIzquierda: Math.round(-r.left),
      fijo: getComputedStyle(e).position === 'fixed',
      texto: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
      ancho: Math.round(r.width),
      enScroll: dentroDeScroll(e),
    });
  }
  // Texto que se sale de su caja (una URL o un correo sin espacios): la
  // caja mide lo que debe, pero su contenido no, y eso ensancha la página.
  for (const e of document.querySelectorAll('body *')) {
    if (e.scrollWidth <= e.clientWidth + 1 || !e.clientWidth) continue;
    const o = getComputedStyle(e).overflowX;
    if (o !== 'visible') continue;
    if (dentroDeScroll(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.left + e.scrollWidth <= cw + 1) continue;
    malos.push({
      elemento: describir(e) + ' [texto que se sale]',
      sobraDerecha: Math.round(r.left + e.scrollWidth - cw),
      sobraIzquierda: 0,
      fijo: getComputedStyle(e).position === 'fixed',
      texto: (e.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 50),
      ancho: e.scrollWidth,
      enScroll: false,
    });
  }

  const html = document.documentElement;
  // ¿Lo provocan los elementos fijos? Un fijo con inset-x-0 se estira al
  // ancho del layout, que crece si OTRA cosa desborda: así se separa la
  // causa del síntoma.
  const fijos = [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).position === 'fixed');
  const antes = fijos.map((e) => e.style.display);
  fijos.forEach((e) => (e.style.display = 'none'));
  const sinFijos = html.scrollWidth;
  fijos.forEach((e, i) => (e.style.display = antes[i]));
  // Y cada fijo por separado.
  const porFijo = [];
  for (const f of fijos) {
    const d = f.style.display;
    fijos.forEach((e) => { if (e !== f) e.style.display = 'none'; });
    const ancho = html.scrollWidth;
    fijos.forEach((e, i) => (e.style.display = antes[i]));
    f.style.display = d;
    if (ancho > cw) porFijo.push({ elemento: describir(f), scroll: ancho, anchoPropio: Math.round(f.scrollWidth) });
  }
  return {
    cw,
    scrollHtml: html.scrollWidth,
    scrollBody: document.body.scrollWidth,
    sinFijos,
    porFijo,
    malos,
  };
})()`;

const clicPorTexto = (texto) => `(() => {
  const b = [...document.querySelectorAll('button, a, label')].find((x) => (x.textContent || '').includes(${JSON.stringify(texto)}));
  if (b) b.click();
  return !!b;
})()`;

const escribir = (selector, valor) => `(() => {
  const i = document.querySelector(${JSON.stringify(selector)});
  if (!i) return false;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(i, ${JSON.stringify(valor)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const SESION = `(() => {
  localStorage.setItem('rw_token', 'prueba.desborde');
  localStorage.setItem('rw_user', JSON.stringify({ nombre: 'Capacitador De Campo Con Nombre Largo', correo: ${JSON.stringify(CORREO)}, rol: 'CAP' }));
  localStorage.setItem('rw_aviso_instalar', '1');
  return true;
})()`;

const borrador = (paso) => `(() => {
  localStorage.setItem('rw_borrador_PC-0001_ASG-1', JSON.stringify({
    idVisita: 'v-desborde-' + ${paso},
    paso: ${paso},
    motivo: 'Visita',
    status: 'Incidencia',
    tipoIncidencia: 'Falta material POP',
    contacto: 'Rosa María Fernández de los Santos',
    celular: '987654321',
    procesador: 'Niubiz',
    cod_openpay: 'OP-1234567890123456',
    cod_niubiz: '1234567890123456789',
    cod_izipay: '',
    beneficios: 'Descuento de 20% con tarjeta',
    material_pop: 'Afiche',
    observacion: ${JSON.stringify(OBSERVACION)},
    guardadoEn: Date.now(),
  }));
  return true;
})()`;

/** Las pantallas, en orden. Cada una deja la página lista para medir. */
const PANTALLAS = [
  { nombre: 'login', pasos: async (p) => p.ir('/login') },
  { nombre: 'offline', pasos: async (p) => p.ir('/offline') },
  {
    nombre: 'hoy',
    pasos: async (p) => {
      await p.evaluar(SESION);
      await p.ir('/hoy', 2500);
    },
  },
  {
    nombre: 'registrar-buscar',
    pasos: async (p) => {
      await p.ir('/registrar');
      await p.evaluar(escribir('input', 'plaza vea'));
      await esperar(1500);
    },
  },
  { nombre: 'detalle', pasos: async (p) => p.ir('/local/PC-0001', 2500) },
  { nombre: 'registro-paso1', pasos: async (p) => p.ir('/visita/PC-0001?asg=ASG-1', 2500) },
  {
    nombre: 'registro-paso2',
    pasos: async (p) => {
      await p.evaluar(borrador(2));
      await p.ir('/visita/PC-0001?asg=ASG-1', 2500);
      await p.evaluar(clicPorTexto('Continuar borrador'));
      await esperar(600);
    },
  },
  {
    nombre: 'registro-paso3',
    pasos: async (p) => {
      await p.evaluar(borrador(3));
      await p.ir('/visita/PC-0001?asg=ASG-1', 2500);
      await p.evaluar(clicPorTexto('Continuar borrador'));
      await esperar(600);
    },
  },
  {
    nombre: 'confirmacion',
    pasos: async (p) => {
      await p.evaluar(clicPorTexto('Guardar visita'));
      await esperar(2500);
    },
  },
  {
    nombre: 'registrar-campana',
    pasos: async (p) => {
      await p.ir('/registrar');
      await p.evaluar(clicPorTexto('Campaña'));
      await esperar(300);
      await p.evaluar(escribir('input', 'plaza vea'));
      await esperar(1500);
      await p.evaluar(`(() => {
        const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('Supermercados'));
        if (b) b.click();
        return !!b;
      })()`);
      await esperar(1200);
    },
  },
  { nombre: 'historial', pasos: async (p) => p.ir('/historial', 2500) },
  {
    nombre: 'historial-detalle',
    pasos: async (p) => {
      await p.evaluar(`(() => { const b = document.querySelector('main button.card'); if (b) b.click(); return !!b; })()`);
      await esperar(800);
    },
  },
  { nombre: 'perfil', pasos: async (p) => p.ir('/perfil', 2500) },
  {
    nombre: 'mapa',
    // Pone su propia sesión: así sirve también con PANTALLAS=mapa.
    pasos: async (p) => {
      await p.ir('/login', 500);
      await p.evaluar(SESION);
      await p.ir('/mapa', 3000);
    },
  },
  {
    nombre: 'mapa-hoja',
    pasos: async (p) => {
      // La parada 5 va sola: la de la dirección con "1er" y la ubicación aproximada.
      await p.evaluar(`(() => { const m = document.querySelector('.leaflet-marker-icon[title^="5."]'); if (m) m.click(); return !!m; })()`);
      await esperar(1200);
    },
  },
  {
    nombre: 'mapa-grupo',
    pasos: async (p) => {
      await p.ir('/mapa', 3000);
      await p.evaluar(`(() => { const m = document.querySelector('.marcador--grupo')?.closest('.leaflet-marker-icon'); if (m) m.click(); return !!m; })()`);
      await esperar(1200);
    },
  },
];

/**
 * En el mapa, la barra de abajo no puede tapar la atribución ni la ficha
 * de "sin ubicación", y los botones tienen que medir 44 px.
 */
const MEDIR_MAPA = `(() => {
  const barra = document.querySelector('nav')?.getBoundingClientRect();
  const problemas = [];
  const debajo = (sel, nombre) => {
    const e = document.querySelector(sel);
    if (!e) return problemas.push('falta ' + nombre);
    const r = e.getBoundingClientRect();
    if (barra && r.bottom > barra.top + 0.5) problemas.push(nombre + ' bajo la barra (' + Math.round(r.bottom) + ' > ' + Math.round(barra.top) + ')');
  };
  debajo('.leaflet-control-attribution', 'la atribución');
  debajo('.mapa-abajo', 'la ficha sin ubicación');
  for (const b of document.querySelectorAll('.mapa-ruta button')) {
    const r = b.getBoundingClientRect();
    const toque = getComputedStyle(b, '::after').width === '44px';
    if (!toque && (r.width < 43.5 || r.height < 43.5)) problemas.push('botón chico ' + Math.round(r.width) + '×' + Math.round(r.height) + ' «' + (b.textContent || b.getAttribute('aria-label')).trim().slice(0, 30) + '»');
  }
  const atribucion = document.querySelector('.leaflet-control-attribution')?.textContent || '';
  if (!atribucion.includes('OpenStreetMap')) problemas.push('sin atribución de OpenStreetMap');
  return problemas;
})()`;

const SOLO = (process.env.PANTALLAS || '').split(',').map((n) => n.trim()).filter(Boolean);
const ELEGIDAS = SOLO.length ? PANTALLAS.filter((p) => SOLO.includes(p.nombre)) : PANTALLAS;

// ── Recorrido ─────────────────────────────────────

async function main() {
  mkdirSync(SALIDA, { recursive: true });
  const { cdp, proceso, ws } = await abrirChrome();
  let fallos = 0;
  let encabezadoFijo = null;

  try {
    for (const vp of VIEWPORTS) {
      for (const tema of TEMAS) {
        const p = await nuevaPestana(cdp, vp, tema);
        console.log(`\n── ${vp.ancho}×${vp.alto} · ${tema === 'dark' ? 'oscuro' : 'claro'}${SIN_SEGURO ? ' · sin seguro' : ''} ──`);
        for (const pantalla of ELEGIDAS) {
          try {
            await pantalla.pasos(p);
            const r = await p.evaluar(MEDIR);
            const desborda = r.scrollHtml > r.cw || r.scrollBody > r.cw;
            const etiqueta = `${pantalla.nombre}`.padEnd(18);
            if (!desborda && r.malos.length === 0) {
              console.log(`  ✓ ${etiqueta} ${r.cw}px`);
            } else {
              fallos++;
              console.log(
                `  ✗ ${etiqueta} clientWidth ${r.cw} · scrollWidth html ${r.scrollHtml} body ${r.scrollBody} · sin los fijos ${r.sinFijos}`,
              );
              for (const f of r.porFijo) {
                console.log(`      provoca desborde solo: ${f.elemento} (scroll ${f.scroll}, su contenido mide ${f.anchoPropio}px)`);
              }
              for (const m of r.malos.slice(0, DIAGNOSTICO ? 40 : 8)) {
                const lado = m.sobraDerecha > 0 ? `+${m.sobraDerecha}px dcha` : `+${m.sobraIzquierda}px izq`;
                console.log(
                  `      ${lado}${m.fijo ? ' (fijo)' : ''}${m.enScroll ? ' (en scroll)' : ''} ancho ${m.ancho}  ${m.elemento}  «${m.texto}»`,
                );
              }
            }
            await p.captura(`${pantalla.nombre}-${vp.ancho}-${tema}${SIN_SEGURO ? '-sin-seguro' : ''}`);

            if (pantalla.nombre === 'mapa') {
              const problemas = await p.evaluar(MEDIR_MAPA);
              for (const pr of problemas) console.log(`      ✗ mapa: ${pr}`);
              fallos += problemas.length;
            }

            // El encabezado fijo del registro tiene que seguir arriba al hacer scroll.
            if (pantalla.nombre === 'registro-paso3' && encabezadoFijo === null) {
              encabezadoFijo = await p.evaluar(`(async () => {
                window.scrollTo(0, 600);
                await new Promise((r) => setTimeout(r, 300));
                const e = document.querySelector('.encabezado-fijo');
                return e ? Math.round(e.getBoundingClientRect().top) : null;
              })()`);
            }
          } catch (e) {
            fallos++;
            console.log(`  ! ${pantalla.nombre}: ${e.message}`);
          }
        }
        await p.cerrar();
      }
    }
  } finally {
    ws.close();
    cerrarChrome(proceso);
  }

  if (encabezadoFijo !== null) console.log(`\nEncabezado fijo del registro tras hacer scroll: top = ${encabezadoFijo}px (0 = sigue arriba)`);
  console.log(`Capturas en ${SALIDA}`);
  if (fallos) {
    console.log(`\n${fallos} pantalla(s) con desborde o error.`);
    process.exit(1);
  }
  console.log('\nSin desborde horizontal en ninguna pantalla.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
