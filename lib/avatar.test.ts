import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { urlFotoPerfil, iniciales, contenidoAvatar, refrescarPerfil } from './avatar.ts';
import { actualizarUsuario, getUsuario, getToken } from './auth.ts';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const MINIATURA = `https://drive.google.com/thumbnail?id=${ID}&sz=w320`;

// ══════════════════════════════════════════════════
describe('la URL de la foto desde el enlace de Drive', () => {
  test('/file/d/ID/view, completo o cortado', () => {
    assert.equal(urlFotoPerfil(`https://drive.google.com/file/d/${ID}/view?usp=sharing`), MINIATURA);
    assert.equal(urlFotoPerfil(`https://drive.google.com/file/d/${ID}/view?usp=sharin`), MINIATURA);
    assert.equal(urlFotoPerfil(`https://drive.google.com/file/d/${ID}`), MINIATURA);
    assert.equal(urlFotoPerfil(`  https://drive.google.com/file/d/${ID}/view  `), MINIATURA);
  });

  test('open?id=, uc?…&id= y una miniatura ya armada', () => {
    assert.equal(urlFotoPerfil(`https://drive.google.com/open?id=${ID}`), MINIATURA);
    assert.equal(urlFotoPerfil(`https://drive.google.com/uc?export=view&id=${ID}`), MINIATURA);
    assert.equal(urlFotoPerfil(MINIATURA), MINIATURA);
  });

  test('vacío o basura: sin foto', () => {
    assert.equal(urlFotoPerfil(''), '');
    assert.equal(urlFotoPerfil(undefined), '');
    assert.equal(urlFotoPerfil('foto de Rosa'), '');
    assert.equal(urlFotoPerfil('https://drive.google.com/drive/folders/'), '');
    assert.equal(urlFotoPerfil('https://drive.google.com/file/d/abc/view'), '', 'un ID demasiado corto');
  });
});

describe('qué muestra el avatar', () => {
  test('con foto, la foto', () => {
    assert.deepEqual(contenidoAvatar({ foto: MINIATURA, nombre: 'Rosa Díaz' }), { tipo: 'foto', src: MINIATURA });
  });

  test('sin foto, las iniciales', () => {
    assert.deepEqual(contenidoAvatar({ foto: '', nombre: 'Rosa Díaz' }), { tipo: 'inicial', texto: 'RD' });
    assert.deepEqual(contenidoAvatar({ nombre: 'Rosa' }), { tipo: 'inicial', texto: 'R' });
  });

  test('si la foto no cargó, las iniciales', () => {
    assert.deepEqual(contenidoAvatar({ foto: MINIATURA, nombre: 'Rosa Díaz', fallo: true }), { tipo: 'inicial', texto: 'RD' });
  });

  test('iniciales', () => {
    assert.equal(iniciales('rosa maría díaz'), 'RM');
    assert.equal(iniciales('  Luis  '), 'L');
    assert.equal(iniciales(''), 'C');
    assert.equal(iniciales(undefined), 'C');
  });
});

// ══════════════════════════════════════════════════
describe('getPerfil actualiza el usuario guardado', () => {
  const fetchReal = globalThis.fetch;
  let local: Map<string, string>;
  let sesion: Map<string, string>;

  const almacen = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });

  beforeEach(() => {
    local = new Map([
      ['rw_token', 'token-de-rosa'],
      ['rw_exp', '1893456000000'],
      ['rw_user', JSON.stringify({ nombre: 'Rosa Díaz', correo: 'rosa@empresa.pe', rol: 'CAP' })],
    ]);
    sesion = new Map();
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: almacen(local),
      sessionStorage: almacen(sesion),
      location: { href: '/hoy' },
      dispatchEvent: () => true,
    };
  });
  afterEach(() => {
    globalThis.fetch = fetchReal;
  });

  const backend = (cuerpo: unknown) => {
    globalThis.fetch = (async () => ({ status: 200, ok: true, json: async () => cuerpo }) as Response) as typeof fetch;
  };

  test('guarda la foto sin tocar el token ni su vencimiento', async () => {
    backend({ ok: true, data: { nombre: 'Rosa Díaz', rol: 'CAP', foto: MINIATURA } });
    await refrescarPerfil(true);
    assert.equal(getUsuario()?.foto, MINIATURA);
    assert.equal(getUsuario()?.correo, 'rosa@empresa.pe');
    assert.equal(getToken(), 'token-de-rosa');
    assert.equal(local.get('rw_exp'), '1893456000000');
    assert.equal(sesion.size, 0, 'se queda en el mismo almacén');
  });

  test('si el admin quita la foto, se quita', async () => {
    actualizarUsuario({ foto: MINIATURA });
    backend({ ok: true, data: { nombre: 'Rosa Díaz', rol: 'CAP', foto: '' } });
    await refrescarPerfil(true);
    assert.equal(getUsuario()?.foto, '');
  });

  test('una respuesta sin el campo foto no borra la que hay', async () => {
    actualizarUsuario({ foto: MINIATURA });
    backend({ ok: true, data: { nombre: 'Rosa Díaz', rol: 'CAP' } });
    await refrescarPerfil(true);
    assert.equal(getUsuario()?.foto, MINIATURA);
  });

  test('si falla, nada cambia', async () => {
    actualizarUsuario({ foto: MINIATURA });
    globalThis.fetch = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    await refrescarPerfil(true);
    assert.equal(getUsuario()?.foto, MINIATURA);
  });

  test('una sesión vencida no borra la sesión ni redirige', async () => {
    backend({ ok: false, authError: true, error: 'Sesión expirada' });
    await refrescarPerfil(true);
    assert.equal(getToken(), 'token-de-rosa');
    assert.equal((globalThis as unknown as { window: { location: { href: string } } }).window.location.href, '/hoy');
  });

  test('una sesión temporal se actualiza en su almacén', async () => {
    sesion.set('rw_token', 't');
    sesion.set('rw_user', JSON.stringify({ nombre: 'Luis', correo: 'luis@empresa.pe', rol: 'CAP' }));
    actualizarUsuario({ foto: MINIATURA });
    assert.equal(JSON.parse(sesion.get('rw_user')!).foto, MINIATURA);
    assert.equal(JSON.parse(local.get('rw_user')!).foto, undefined, 'la persistente no se toca');
  });
});
