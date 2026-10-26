/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
  },
  async redirects() {
    return [
      // Buscar pasó a ser Mapa; la búsqueda de comercios vive en Registrar.
      // No permanente: una pantalla vieja guardada o un enlace siguen
      // llegando a donde está la búsqueda ahora.
      { source: '/buscar', destination: '/registrar', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // El navegador tiene que ver siempre el service worker nuevo: si
        // lo guardara en caché, el aviso de nueva versión llegaría tarde.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};
export default nextConfig;
