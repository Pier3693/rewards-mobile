// ══════════════════════════════════════════════════
//  Foto de perfil
//
//  La hoja usuarios trae el enlace de Drive de la foto; el
//  backend lo convierte en una miniatura (thumbnail?id=…) y
//  la manda en el login y en getPerfil. Si no hay foto, o no
//  carga, se ven las iniciales como siempre.
// ══════════════════════════════════════════════════

import { api } from './api.ts';
import { actualizarUsuario, getUsuario } from './auth.ts';

/**
 * La miniatura de una foto de Drive, a partir del enlace tal como esté en
 * la hoja: "/file/d/<ID>/view?usp=sharing" (aunque venga cortado),
 * "open?id=<ID>", "uc?export=view&id=<ID>" o una miniatura ya armada.
 * Vacío si no hay un ID. La misma regla que _urlFotoPerfil_ del backend.
 */
export function urlFotoPerfil(enlace: string | undefined): string {
  const texto = String(enlace || '').trim();
  const m = texto.match(/\/d\/([\w-]{20,})/) || texto.match(/[?&]id=([\w-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w320` : '';
}

/** "Rosa Díaz" → "RD". Sin nombre, "C" (de CAP). */
export function iniciales(nombre: string | undefined): string {
  return (
    String(nombre || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'C'
  );
}

export type ContenidoAvatar = { tipo: 'foto'; src: string } | { tipo: 'inicial'; texto: string };

/** La foto, o las iniciales si no hay foto o no cargó. */
export function contenidoAvatar({
  foto,
  nombre,
  fallo = false,
}: {
  foto?: string;
  nombre?: string;
  fallo?: boolean;
}): ContenidoAvatar {
  const src = urlFotoPerfil(foto);
  return src && !fallo ? { tipo: 'foto', src } : { tipo: 'inicial', texto: iniciales(nombre) };
}

let refrescado = false;

/**
 * Una vez por apertura de la app, pide el perfil por detrás y guarda la
 * foto (y el nombre y el rol) en el usuario del celular. Así los que ya
 * tenían la sesión abierta reciben la foto sin volver a entrar, y un
 * cambio del admin se ve la próxima vez. Si falla, no pasa nada: ni
 * redirige al login ni toca la sesión.
 */
export async function refrescarPerfil(forzar = false): Promise<void> {
  if (refrescado && !forzar) return;
  refrescado = true;
  if (!getUsuario()) return;
  try {
    const r = await api<{ nombre?: string; rol?: string; foto?: string }>('getPerfil', {}, { redirigirSiVence: false });
    if (!r.ok || !r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return;
    const { nombre, rol, foto } = r.data;
    actualizarUsuario({
      ...(nombre ? { nombre } : {}),
      ...(rol ? { rol } : {}),
      // Sin el campo (un backend sin foto todavía), la que hubiera se queda.
      ...(typeof foto === 'string' ? { foto: urlFotoPerfil(foto) } : {}),
    });
  } catch {
    /* sin señal o backend viejo: se queda lo que había */
  }
}
