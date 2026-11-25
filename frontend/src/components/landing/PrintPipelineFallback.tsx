import React from 'react';

interface PrintPipelineFallbackProps {
  activeChapter?: number;
  colorMode?: boolean;
  duplexMode?: boolean;
  className?: string;
}

/**
 * Architectural vector CAD diorama rendered when WebGL is disabled,
 * prefers-reduced-motion is active, in automated jsdom tests, or while 3D chunk loads.
 */
export const PrintPipelineFallback: React.FC<PrintPipelineFallbackProps> = ({
  activeChapter = 0,
  colorMode = false,
  duplexMode = true,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center select-none pointer-events-none ${className}`}
      aria-hidden="true"
    >
      {/* Subtle radial glow */}
      <div
        className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl opacity-30 transition-colors duration-700"
        style={{
          background:
            activeChapter === 3
              ? 'radial-gradient(circle, #10B981 0%, transparent 70%)'
              : colorMode
              ? 'radial-gradient(circle, #00D2FF 0%, #245BDB 55%, transparent 75%)'
              : 'radial-gradient(circle, #245BDB 0%, transparent 70%)',
        }}
      />

      <svg
        viewBox="0 0 420 380"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative w-full max-w-[440px] h-auto drop-shadow-[0_24px_48px_rgba(0,0,0,0.55)]"
      >
        <defs>
          <linearGradient id="pf-cad-body" x1="60" y1="110" x2="360" y2="300" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="55%" stopColor="#245BDB" />
            <stop offset="100%" stopColor="#14368B" />
          </linearGradient>
          <linearGradient id="pf-cad-beam" x1="115" y1="0" x2="305" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00D2FF" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#00D2FF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Isometric Floor Blueprint Rings */}
        <ellipse cx="210" cy="306" rx="164" ry="42" stroke="#245BDB" strokeOpacity="0.28" strokeDasharray="6 6" />
        <ellipse cx="210" cy="306" rx="116" ry="28" stroke="#00D2FF" strokeOpacity="0.35" />

        {/* Back Floating Sheet (Duplex Layer) */}
        <g
          className="transition-transform duration-500"
          style={{
            transform: duplexMode ? 'translate(18px, -16px)' : 'translate(0px, 0px)',
            opacity: duplexMode ? 0.85 : 0,
          }}
        >
          <rect
            x="140"
            y="42"
            width="136"
            height="120"
            rx="10"
            fill="#0F172A"
            stroke="#3B82F6"
            strokeOpacity="0.55"
            strokeWidth="1.5"
          />
          <rect x="160" y="64" width="66" height="6" rx="3" fill="#3B82F6" fillOpacity="0.6" />
          <rect x="160" y="78" width="90" height="4" rx="2" fill="#64748B" fillOpacity="0.5" />
          <rect x="160" y="88" width="76" height="4" rx="2" fill="#64748B" fillOpacity="0.5" />
        </g>

        {/* Front Glass PDF Sheet + Laser Scan Bar */}
        <rect
          x="136"
          y="54"
          width="148"
          height="136"
          rx="12"
          fill="#FFFFFF"
          fillOpacity="0.96"
          stroke="#00D2FF"
          strokeOpacity="0.6"
          strokeWidth="1.5"
        />
        <rect
          x="156"
          y="74"
          width="88"
          height="10"
          rx="4"
          fill={colorMode ? '#00D2FF' : '#245BDB'}
        />
        <rect x="156" y="96" width="106" height="6" rx="3" fill={colorMode ? '#EC4899' : '#94A3B8'} fillOpacity="0.65" />
        <rect x="156" y="110" width="92" height="6" rx="3" fill={colorMode ? '#F59E0B' : '#94A3B8'} fillOpacity="0.55" />
        <rect x="156" y="124" width="70" height="6" rx="3" fill="#94A3B8" fillOpacity="0.45" />

        {/* Security Scan Laser Line */}
        <rect x="128" y="138" width="164" height="4" rx="2" fill="url(#pf-cad-beam)" />

        {/* PrintFlow Cobalt Hardware Chassis */}
        <rect x="68" y="152" width="284" height="114" rx="24" fill="url(#pf-cad-body)" />
        {/* Dark Aperture Chamber */}
        <rect x="92" y="176" width="236" height="52" rx="12" fill="#0C1427" stroke="#1E293B" strokeWidth="1.5" />
        {/* Status Telemetry LED */}
        <circle cx="116" cy="202" r="7" fill="#10B981" />
        <circle cx="116" cy="202" r="12" stroke="#10B981" strokeOpacity="0.35" strokeWidth="2" />
        {/* Aperture Laser Guide */}
        <rect x="142" y="199" width="164" height="6" rx="3" fill="#00D2FF" fillOpacity="0.45" />

        {/* Cascading Output Printed Sheet */}
        <path
          d="M132 214C132 210.686 134.686 208 138 208H282C285.314 208 288 210.686 288 214V316C288 322.627 282.627 328 276 328H144C137.373 328 132 322.627 132 316V214Z"
          fill="#FFFFFF"
        />
        <rect x="154" y="236" width="112" height="8" rx="4" fill="#245BDB" />
        <rect x="154" y="254" width="84" height="7" rx="3.5" fill={colorMode ? '#00D2FF' : '#94A3B8'} />
        <rect x="154" y="272" width="96" height="6" rx="3" fill="#CBD5E1" />

        {/* Floating Zero-Trace Shred Motes */}
        <rect x="146" y="338" width="6" height="6" rx="1.5" fill="#00D2FF" fillOpacity="0.7" />
        <rect x="188" y="348" width="5" height="5" rx="1" fill="#10B981" fillOpacity="0.75" />
        <rect x="242" y="340" width="7" height="7" rx="1.5" fill="#FFFFFF" fillOpacity="0.55" />
        <rect x="274" y="352" width="5" height="5" rx="1" fill="#00D2FF" fillOpacity="0.6" />
      </svg>
    </div>
  );
};

export default PrintPipelineFallback;
