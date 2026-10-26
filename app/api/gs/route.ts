// ══════════════════════════════════════════════════
//  Proxy servidor → Apps Script
//  El navegador llama a ESTA ruta (mismo origen, sin CORS).
//  Este código corre en el servidor de Next.js (o en la
//  función serverless de Vercel), así que llamar a Apps
//  Script desde aquí NO tiene restricción de CORS.
//
//  La cadena de relojes, de más estricto a más laxo:
//    cliente 180 s  <  proxy 280 s  <  Vercel 300 s  <  GAS 360 s
//  Cada eslabón corta antes que el siguiente, así que el
//  error lo da siempre quien puede explicarlo.
// ══════════════════════════════════════════════════

/**
 * Techo de la función en Vercel. 300 s es el máximo del plan Hobby
 * (Pro llega a 800). Pasado eso, Vercel devuelve su propio 504
 * FUNCTION_INVOCATION_TIMEOUT, que el cliente no sabe leer.
 *
 * Requiere Fluid compute activado en el proyecto; sin él rigen los
 * límites antiguos, mucho más cortos.
 */
export const maxDuration = 300;

/**
 * Nuestro límite al hablar con Apps Script: 20 s por debajo del techo,
 * de sobra para construir y enviar la respuesta antes de que Vercel
 * nos corte por su cuenta.
 */
const MS_LIMITE_APPS_SCRIPT = 280_000;

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

/**
 * Siempre con estado 200, aunque sea un error.
 *
 * `lib/api.ts` hace res.json() sin mirar el estado: cualquier otra cosa
 * acabaría en su catch genérico y el CAP vería "No se pudo conectar"
 * cuando en realidad el problema fue otro.
 *
 * Todos los errores de aquí son de camino, no respuestas del backend,
 * así que van marcados como reintentables: con el id_visita, reenviar
 * un guardado no lo duplica.
 */
function error(mensaje: string) {
  return Response.json(
    { ok: false, reintentable: true, error: mensaje },
    { status: 200 },
  );
}

export async function POST(req: Request) {
  if (!APPS_SCRIPT_URL) {
    return Response.json(
      { ok: false, error: 'Falta configurar APPS_SCRIPT_URL en el servidor' },
      { status: 500 },
    );
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), MS_LIMITE_APPS_SCRIPT);

  // Si el CAP cierra la app, dejamos de esperar en vez de mantener viva
  // una función que ya no le importa a nadie.
  const alAbortarCliente = () => control.abort();
  req.signal.addEventListener('abort', alAbortarCliente);

  try {
    const body = await req.text(); // ya viene como JSON string desde el cliente

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: control.signal,
    });

    const data = await res.text();

    // Apps Script puede responder un error con HTML. Reenviarlo como si
    // fuera JSON hacía reventar al cliente al parsearlo.
    if (!res.ok) {
      return error(
        `El servidor respondió con un error (${res.status}). Intenta de nuevo.`,
      );
    }

    // Apps Script devuelve JSON; lo reenviamos tal cual
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const abortado =
      !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';

    if (abortado) {
      return error('El servidor tardó demasiado en responder.');
    }
    return error('No se pudo contactar al servidor. Intenta de nuevo.');
  } finally {
    clearTimeout(temporizador);
    req.signal.removeEventListener('abort', alAbortarCliente);
  }
}
