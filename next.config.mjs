/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
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
