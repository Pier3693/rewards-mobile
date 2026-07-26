# Rewards Mobile — Trade Marketing (CAPs)

App de campo para capacitadores: asignaciones del día, registro de visitas
con fotos y registro de campañas. Frontend Next.js desplegado en Vercel,
backend Apps Script (Api.gs) sobre Google Sheets.

## Arranque local

```bash
npm install
cp .env.local.example .env.local
# → edita .env.local y pega tu URL /exec del Apps Script
npm run dev
```

Abre http://localhost:3000 — debes poder loguearte con un usuario real
de la hoja `usuarios`.

## Deploy en Vercel

1. Sube este repo a GitHub
2. En vercel.com → Add New Project → importa el repo
3. En Environment Variables agrega:
   `NEXT_PUBLIC_API_URL` = tu URL /exec
4. Deploy

## Estructura

- `lib/api.ts` — cliente del API (truco text/plain para CORS)
- `lib/auth.ts` — sesión local (token 12h + usuario)
- `app/login` — login funcional (Día 2 ✅)
- `app/(app)/hoy` — asignaciones del día (Día 3)
- `app/(app)/registrar` — registrar visita (Día 4)
- `app/(app)/campana` — registrar campaña (Día 5)
- PWA (manifest + service worker) — Día 6
