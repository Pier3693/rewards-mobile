'use client';

import { useEffect, useState } from 'react';
import { contenidoAvatar } from '@/lib/avatar';

/**
 * La foto de perfil, redonda. Recortada con cover y la vista un poco más
 * arriba del centro (20 %): en una foto de cuerpo entero la cara está
 * arriba. Sin foto, o si no carga (sin señal y sin copia), las iniciales.
 */
export default function Avatar({
  nombre,
  foto,
  className = 'h-12 w-12 text-sm',
}: {
  nombre?: string;
  foto?: string;
  /** Tamaño y letra de las iniciales: "h-12 w-12 text-sm". */
  className?: string;
}) {
  const [fallo, setFallo] = useState(false);
  // Una foto nueva merece otro intento.
  useEffect(() => setFallo(false), [foto]);

  const contenido = contenidoAvatar({ foto, nombre, fallo });
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary font-bold text-white ${className}`;

  if (contenido.tipo === 'foto') {
    return (
      <span className={base}>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de Drive, sin next/image */}
        <img
          src={contenido.src}
          alt={nombre ? `Foto de ${nombre}` : 'Foto de perfil'}
          onError={() => setFallo(true)}
          referrerPolicy="no-referrer"
          decoding="async"
          className="h-full w-full object-cover"
          style={{ objectPosition: 'center 20%' }}
        />
      </span>
    );
  }
  return (
    <span className={base} role="img" aria-label={nombre || 'Perfil'}>
      <span aria-hidden="true">{contenido.texto}</span>
    </span>
  );
}
