# Rewards Mobile — Trade Marketing (CAPs)

App de campo para los capacitadores (CAP): ruta del día, registro de visitas
con fotos, campañas, historial y perfil. Funciona sin señal y se instala en
la pantalla de inicio del celular.

- **Frontend:** Next.js 15 (App Router) en Vercel, Tailwind v4.
- **Backend:** Apps Script sobre Google Sheets. La app nunca le habla
  directo: pasa por el proxy `app/api/gs`, en el mismo origen, sin CORS.

## Arranque local

```bash
npm install
cp .env.example .env.local   # y pon los valores reales
npm run dev                  # http://localhost:3000
```

El service worker solo funciona bien con el build de producción. Para
probar el modo sin señal: `npm run build && npm start`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `APPS_SCRIPT_URL` | URL `/exec` del Web App de Apps Script. Solo la usa el servidor. |
| `NEXT_PUBLIC_ADMIN_WHATSAPP` | WhatsApp del administrador, formato internacional sin `+` (ej. `51987654321`). |
| `NEXT_PUBLIC_ADMIN_EMAIL` | Correo del administrador. |

Los dos de contacto salen en "¿Olvidaste tu clave?" y en Perfil.

## Pruebas

```bash
npm test        # node --test sobre lib/*.test.ts, sin navegador
npm run lint
npm run build
```

Las pruebas cubren la lógica pura: la cola y los reintentos, el service
worker (cargado en `node:vm`), el contraste AA de los colores, el
historial, las fotos y el registro.

## Cómo funciona sin señal

- **Cola de envío** (`lib/cola.ts`, `lib/sincronizacion.ts`): al tocar
  Guardar, la visita y sus fotos se guardan **primero** en IndexedDB y
  después se envían.
  - Si no hay señal, el envío se corta o la sesión venció, la visita queda
    en la cola y se reintenta sola, cada vez con más espera.
  - Cada visita lleva `id_visita`, con el que el backend ignora los
    reenvíos (no hay duplicados), y `creado_en`, la hora en que se tocó
    Guardar, que es la que queda en la hoja.
  - Solo se envían las visitas del CAP conectado.
- **Sincronizador** (`lib/sincronizador.ts`): envía la cola al abrir la
  app, al volver la señal y al volver a primer plano. iOS no deja enviar
  con la app cerrada.
- **Copias en el celular:** la ruta del día y sus locales
  (`lib/cacheDia.ts`) y el historial (`lib/historial.ts`), por usuario.
  Se enseñan al instante y se piden frescas por detrás.
- **Service worker** (`lib/sw/sw.js`, servido por `app/sw.js/route.ts`):
  - El build le pone la versión (el commit en Vercel) y la lista de
    archivos de `.next/static`.
  - Guarda las pantallas y todos los chunks para abrir sin señal.
  - Al activarse solo copia lo que ya tenía, sin red, así nunca deja la
    pantalla en blanco. Las descargas van después.
  - Una versión nueva espera hasta que el CAP toca **"Hay una nueva
    versión · Actualizar"**.

## Despliegue en Vercel

1. Las tres variables de arriba, en **Production** y **Preview**.
2. **Fluid compute activado.** `app/api/gs` declara `maxDuration = 300`:
   guardar una visita sube hasta 4 fotos a Drive dentro de la misma
   petición, y sin Fluid compute rigen límites mucho más cortos.
3. El dominio de producción no debe cambiar. La cola, la sesión y la
   instalación van atadas al dominio: si cambia, los CAPs pierden lo que
   tengan guardado.

## Estructura

- `app/login`: entrada, con "Mantener sesión iniciada".
- `app/(app)/hoy`: ruta del día, avance e indicador de envío.
- `app/(app)/buscar` y `app/(app)/local/[id]`: buscador y detalle del local.
- `app/(app)/visita/[id]`: registro en 3 pasos.
- `app/(app)/registrar`: elegir local o registrar una campaña.
- `app/(app)/historial` y `app/(app)/perfil`.
- `app/api/gs`: proxy hacia Apps Script.
- `lib/`: lógica sin React (y sus pruebas); `components/`: piezas compartidas.
- `docs/propuesta-pwa/`: el brief y los mockups.
