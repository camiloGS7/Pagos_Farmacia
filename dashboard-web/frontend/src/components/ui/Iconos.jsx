/**
 * Iconos de trazo en SVG, dibujados a mano como en el diseño. Heredan el color
 * del texto (currentColor), asi que el modo oscuro los cambia solo. Todos van
 * con aria-hidden: el boton que los contiene lleva su propia etiqueta.
 */

function Trazo({ tam = 20, grosor = 1.8, children, ...resto }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

export function Logo({ tam = 36 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 36 36" aria-hidden="true" focusable="false" className="logo">
      <rect width="36" height="36" rx="10" fill="var(--hero-accent)" />
      <path d="M18 10v16M10 18h16" stroke="#0B1220" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export const Iconos = {
  Resumen: (p) => (
    <Trazo {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Trazo>
  ),
  Pagos: (p) => (
    <Trazo {...p}>
      <path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3" />
    </Trazo>
  ),
  Reportes: (p) => (
    <Trazo {...p}>
      <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
      <path d="M14 3v5h5M9 17v-3M12 17v-6M15 17v-2" />
    </Trazo>
  ),
  Ajustes: (p) => (
    <Trazo {...p}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Trazo>
  ),
  Luna: (p) => (
    <Trazo tam={18} {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </Trazo>
  ),
  Sol: (p) => (
    <Trazo tam={18} {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Trazo>
  ),
  Lupa: (p) => (
    <Trazo tam={18} {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </Trazo>
  ),
  Ampliar: (p) => (
    <Trazo tam={18} {...p}>
      <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />
    </Trazo>
  ),
  Cerrar: (p) => (
    <Trazo tam={16} grosor={2} {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Trazo>
  ),
  Check: (p) => (
    <Trazo tam={16} grosor={2.4} {...p}>
      <path d="M5 12l5 5 9-10" />
    </Trazo>
  ),
  Derecha: (p) => (
    <Trazo tam={18} grosor={2} {...p}>
      <path d="M9 6l6 6-6 6" />
    </Trazo>
  ),
  Izquierda: (p) => (
    <Trazo tam={18} grosor={2} {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Trazo>
  ),
  Mas: (p) => (
    <Trazo tam={18} grosor={2} {...p}>
      <path d="M12 5v14M5 12h14" />
    </Trazo>
  ),
  Descargar: (p) => (
    <Trazo tam={18} {...p}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Trazo>
  ),
  Editar: (p) => (
    <Trazo tam={16} {...p}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </Trazo>
  ),
  Alerta: (p) => (
    <Trazo tam={20} grosor={2} {...p}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </Trazo>
  ),
  Refrescar: (p) => (
    <Trazo tam={18} {...p}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M5 4v4h4M19 20v-4h-4" />
    </Trazo>
  ),
  Reloj: (p) => (
    <Trazo tam={18} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Trazo>
  ),
};
