/**
 * Iconos dibujados a mano en SVG.
 *
 * Son ocho trazos simples; traer una libreria de iconos completa para esto
 * seria sumar cientos de kilobytes al bundle y una dependencia mas que
 * mantener. Todos heredan el color del texto (stroke="currentColor"), asi que
 * el modo oscuro los cambia sin que haya que tocar nada.
 */

function Trazo({ tam = 18, children }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Iconos = {
  /* Mortero de farmacia: la marca */
  Mortero: ({ tam = 26 }) => (
    <Trazo tam={tam}>
      <path d="M4 10h16" />
      <path d="M6 10a6 6 0 0 0 12 0" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
      <path d="m14 8 5-5" />
    </Trazo>
  ),

  Resumen: ({ tam }) => (
    <Trazo tam={tam}>
      <rect x="3" y="3" width="7" height="8" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </Trazo>
  ),

  Lista: ({ tam }) => (
    <Trazo tam={tam}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Trazo>
  ),

  Reporte: ({ tam }) => (
    <Trazo tam={tam}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </Trazo>
  ),

  Ajustes: ({ tam }) => (
    <Trazo tam={tam}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 3.7 7.9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H8a1.6 1.6 0 0 0 1-1.5V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V8a1.6 1.6 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </Trazo>
  ),

  Sol: ({ tam }) => (
    <Trazo tam={tam}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Trazo>
  ),

  Luna: ({ tam }) => (
    <Trazo tam={tam}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </Trazo>
  ),

  Lupa: ({ tam }) => (
    <Trazo tam={tam}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Trazo>
  ),

  Descargar: ({ tam }) => (
    <Trazo tam={tam}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </Trazo>
  ),

  Refrescar: ({ tam }) => (
    <Trazo tam={tam}>
      <path d="M20 11a8 8 0 1 0-1.6 5.6" />
      <path d="M20 4v7h-7" />
    </Trazo>
  ),
};
