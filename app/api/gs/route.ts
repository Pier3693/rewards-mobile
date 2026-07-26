// ══════════════════════════════════════════════════
//  Proxy servidor → Apps Script
//  El navegador llama a ESTA ruta (mismo origen, sin CORS).
//  Este código corre en el servidor de Next.js (o en la
//  función serverless de Vercel), así que llamar a Apps
//  Script desde aquí NO tiene restricción de CORS.
// ══════════════════════════════════════════════════

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || '';

export async function POST(req: Request) {
  if (!APPS_SCRIPT_URL) {
    return Response.json(
      { ok: false, error: 'Falta configurar APPS_SCRIPT_URL en el servidor' },
      { status: 500 },
    );
  }

  try {
    const body = await req.text(); // ya viene como JSON string desde el cliente

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
    });

    const data = await res.text();

    // Apps Script devuelve JSON; lo reenviamos tal cual
    return new Response(data, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: 'No se pudo contactar al servidor: ' + String(e) },
      { status: 502 },
    );
  }
}
