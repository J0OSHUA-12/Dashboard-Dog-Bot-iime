// Iconos SVG en línea (sin dependencias externas).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base(size = 15, props: P) {
  const { size: _s, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const IStop = (p: P) => (
  <svg {...base(p.size, p)}>
    <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);
export const IPower = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 3v9" />
    <path d="M6.4 6.6a8 8 0 1 0 11.2 0" />
  </svg>
);
export const IPlug = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />
  </svg>
);
export const IChip = (p: P) => (
  <svg {...base(p.size, p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
  </svg>
);
export const IUpload = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
  </svg>
);
export const ICheck = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
export const IAlert = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v5M12 18h.01" />
  </svg>
);
export const IError = (p: P) => (
  <svg {...base(p.size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </svg>
);
export const IInfo = (p: P) => (
  <svg {...base(p.size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5h.01" />
  </svg>
);
export const IPlay = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor" stroke="none" />
  </svg>
);
export const ISave = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M5 3h11l4 4v14H4V3h1z" />
    <path d="M8 3v5h7V3M8 21v-7h8v7" />
  </svg>
);
export const IFolder = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11z" />
  </svg>
);
export const IFile = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M6 2h8l5 5v15H6V2z" />
    <path d="M14 2v5h5" />
  </svg>
);
export const IDownload = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 4v12M6 10l6 6 6-6M4 20h16" />
  </svg>
);
export const IHammer = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M14 6l4 4M3 21l9-9M12 4l8 8-3 3-8-8 3-3z" />
  </svg>
);
export const ICube = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 2l9 5v10l-9 5-9-5V7l9-5z" />
    <path d="M3 7l9 5 9-5M12 12v10" />
  </svg>
);
export const ISliders = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);
export const ICode = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
  </svg>
);
export const IChart = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-5 3 3 5-7" />
  </svg>
);
export const ILink = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </svg>
);
export const IGauge = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 18l4-6" />
  </svg>
);
export const ILayers = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 3l9 5-9 5-9-5 9-5z" />
    <path d="M3 13l9 5 9-5" />
  </svg>
);
export const IRefresh = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" />
  </svg>
);
export const IChevron = (p: P & { dir?: 'left' | 'right' | 'up' | 'down' }) => {
  const r = { left: 180, right: 0, up: -90, down: 90 }[p.dir ?? 'right'];
  const { dir: _d, ...rest } = p;
  return (
    <svg {...base(p.size, rest)} style={{ transform: `rotate(${r}deg)` }}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
};
export const IPaw = (p: P) => (
  <svg {...base(p.size, p)} strokeWidth={0} fill="currentColor">
    <ellipse cx="7" cy="9" rx="2" ry="2.6" />
    <ellipse cx="17" cy="9" rx="2" ry="2.6" />
    <ellipse cx="10.2" cy="5.5" rx="1.9" ry="2.5" />
    <ellipse cx="13.8" cy="5.5" rx="1.9" ry="2.5" />
    <path d="M12 11c3 0 5.5 3.2 5.5 5.6 0 2-1.5 2.9-3 2.9-1 0-1.6-.6-2.5-.6s-1.5.6-2.5.6c-1.5 0-3-.9-3-2.9C6.5 14.2 9 11 12 11z" />
  </svg>
);
export const ITrash = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </svg>
);
export const IPlus = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IEye = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const ITarget = (p: P) => (
  <svg {...base(p.size, p)}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const IBattery = (p: P) => (
  <svg {...base(p.size, p)}>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 11v2" />
  </svg>
);
export const IThermo = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z" />
  </svg>
);
export const IHelp = (p: P) => (
  <svg {...base(p.size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.9.7c0 1.7-2.5 2.2-2.5 3.8M12 17h.01" />
  </svg>
);
export const IUndo = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const IRedo = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
export const ISearch = (p: P) => (
  <svg {...base(p.size, p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);
export const IX = (p: P) => (
  <svg {...base(p.size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
