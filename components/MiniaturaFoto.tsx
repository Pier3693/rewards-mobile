'use client';

import { useState } from 'react';
import { IconImage } from '@/components/icons';

/**
 * Una foto ya guardada: la miniatura de Drive, o la del celular si la
 * visita todavía no se envió. Con `url` abre la foto en Drive. Si la
 * miniatura no carga (sin permiso, sin señal), un ícono.
 */
export default function MiniaturaFoto({
  src,
  url,
  n,
  className = 'aspect-square w-full',
}: {
  src: string;
  url?: string;
  n: number;
  className?: string;
}) {
  const [fallo, setFallo] = useState(!src);
  const clase = `grid place-items-center overflow-hidden rounded-xl bg-gris-light text-ink-2 ${className}`;
  const imagen = fallo ? (
    <IconImage className="h-6 w-6" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura de Drive o foto del celular, sin next/image
    <img
      src={src}
      alt={`Foto ${n}`}
      onError={() => setFallo(true)}
      className="h-full w-full object-cover"
      referrerPolicy="no-referrer"
      // Solo se piden las que se ven, y sin bloquear el pintado.
      loading="lazy"
      decoding="async"
    />
  );

  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir foto ${n} en Drive`} className={clase}>
      {imagen}
    </a>
  ) : (
    <span className={clase}>{imagen}</span>
  );
}
