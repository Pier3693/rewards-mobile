'use client';

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-8 text-center safe-t safe-b">
      <div>
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-primary-light text-primary">
          <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1.5 9a16 16 0 0 1 21 0M5 13a10.5 10.5 0 0 1 14 0M8.5 17a5.5 5.5 0 0 1 7 0" />
            <path d="M12 20.5v.01M3 3l18 18" />
          </svg>
        </span>
        <h1 className="text-lg font-bold">Sin conexión</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          No se pudo conectar a internet.
          <br />
          Revisa tu señal e intenta de nuevo.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-grad mx-auto mt-6 rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/25"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
