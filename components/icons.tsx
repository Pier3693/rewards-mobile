// ══ Íconos SVG (estilo outline del mockup) ══
// Sin dependencias externas; heredan color con currentColor.

type P = { className?: string };

export function IconCalendar({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M8 3v3M16 3v3M3 9.5h18" />
    </svg>
  );
}

export function IconClock({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function IconStore({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v9a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-9" />
      <path d="M3.5 6.5 5 3.8A1.5 1.5 0 0 1 6.3 3h11.4a1.5 1.5 0 0 1 1.3.8l1.5 2.7c.7 1.3-.2 3-1.7 3-1 0-1.9-.6-2.1-1.5C16.5 9 15.5 9.5 14.6 9.5S13 9 12.8 8c-.2 1-1.2 1.5-2.1 1.5S9 9 8.8 8C8.6 9 7.6 9.5 6.7 9.5 5.2 9.5 2.8 8 3.5 6.5Z" />
      <path d="M9.5 20v-5h5v5" />
    </svg>
  );
}

export function IconPlus({ className = 'h-6 w-6' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMegaphone({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v3a1 1 0 0 0 1 1h2l3.5 4a1 1 0 0 0 1.5-.9V6a1 1 0 0 0-1.5-.9L6 9H4a1 1 0 0 0-1 1Z" />
      <path d="M14 8.5a4 4 0 0 1 0 7M17 6a8 8 0 0 1 0 12" />
    </svg>
  );
}

export function IconUser({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}

export function IconBell({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </svg>
  );
}

export function IconChevronRight({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function IconCheck({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function IconRefresh({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 1 0-2.3 6.3" />
      <path d="M20 5v6h-6" />
    </svg>
  );
}

export function IconLogout({ className = 'h-5 w-5' }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="m15 16 4-4-4-4M19 12H9" />
    </svg>
  );
}

/* Marca circular del login: texto en círculo + asterisco central */
export function LogoBadge({ size = 150 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" className="text-primary">
      <defs>
        <path id="circlePath" d="M 75,75 m -55,0 a 55,55 0 1,1 110,0 a 55,55 0 1,1 -110,0" />
      </defs>
      <text fill="currentColor" fontSize="13.5" fontWeight="700" letterSpacing="3.5">
        <textPath href="#circlePath">
          REWARDS · MARKETING RELACIONAL ·
        </textPath>
      </text>
      {/* Asterisco / flor central */}
      <g stroke="currentColor" strokeWidth="7" strokeLinecap="round">
        <path d="M75 47v56" />
        <path d="M51 61l48 28" />
        <path d="M99 61l-48 28" />
      </g>
    </svg>
  );
}
