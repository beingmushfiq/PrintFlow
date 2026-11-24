import React from 'react';
import { useTranslation } from 'react-i18next';

export interface LogoProps {
  variant?: 'full' | 'mark' | 'wordmark';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  theme?: 'default' | 'white' | 'dark';
  showTagline?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'full',
  size = 'md',
  theme = 'default',
  showTagline = false,
  className = '',
  onClick,
}) => {
  const { t } = useTranslation('common');

  // Size mapping
  const sizeMap = {
    xs: { mark: 24, font: 'text-sm', sub: 'text-[9px]', gap: 'gap-1.5' },
    sm: { mark: 32, font: 'text-base', sub: 'text-[10px]', gap: 'gap-2' },
    md: { mark: 40, font: 'text-xl', sub: 'text-xs', gap: 'gap-2.5' },
    lg: { mark: 48, font: 'text-2xl', sub: 'text-sm', gap: 'gap-3' },
    xl: { mark: 64, font: 'text-3xl', sub: 'text-base', gap: 'gap-3.5' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  // Color theming
  const textPrimary =
    theme === 'white' ? 'text-white' : theme === 'dark' ? 'text-ink-dark' : 'text-ink';
  const textAccent =
    theme === 'white' ? 'text-blue-300' : 'text-accent';
  const textMuted =
    theme === 'white' ? 'text-slate-300' : 'text-muted';

  // Standalone vector SVG Mark
  const renderMark = () => (
    <svg
      width={currentSize.mark}
      height={currentSize.mark}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 select-none shadow-sm rounded-[24%]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pf-mark-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="50%" stopColor="#245BDB" />
          <stop offset="100%" stopColor="#14368B" />
        </linearGradient>
        <linearGradient id="pf-mark-cyan" x1="22" y1="38" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00D2FF" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>

      {/* Rounded Super-ellipse Canvas */}
      <rect width="64" height="64" rx="15" fill="url(#pf-mark-grad)" />

      {/* Back Sheet Feed */}
      <path
        d="M22 13C22 11.8954 22.8954 11 24 11H40C41.1046 11 42 11.8954 42 13V22H22V13Z"
        fill="#FFFFFF"
        fillOpacity="0.85"
      />

      {/* Printer Feed Aperture Chamber */}
      <rect x="13" y="21" width="38" height="15" rx="4.5" fill="#0C1427" />
      {/* Ready Status LED */}
      <circle cx="18.5" cy="28.5" r="2" fill="#10B981" />
      {/* Laser Feed Slot line */}
      <rect x="24" y="27.5" width="21" height="2" rx="1" fill="#FFFFFF" fillOpacity="0.35" />

      {/* Cascading Output Document Sheet */}
      <path
        d="M17.5 29C17.5 28.4477 17.9477 28 18.5 28H45.5C46.0523 28 46.5 28.4477 46.5 29V44.5C46.5 46.433 44.933 48 43 48H21C19.067 48 17.5 46.433 17.5 44.5V29Z"
        fill="#FFFFFF"
      />

      {/* Content Stream Lines */}
      <rect x="22" y="33.5" width="20" height="3" rx="1.5" fill="#245BDB" />
      <rect x="22" y="38.5" width="13" height="3" rx="1.5" fill="url(#pf-mark-cyan)" />
      <circle cx="39" cy="40" r="1.5" fill="#10B981" />
    </svg>
  );

  if (variant === 'mark') {
    return (
      <div
        className={`inline-flex items-center justify-center ${className}`}
        onClick={onClick}
        role="img"
        aria-label="PrintFlow Logo Mark"
      >
        {renderMark()}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center ${currentSize.gap} ${className} select-none`}
      onClick={onClick}
      role="banner"
    >
      {variant !== 'wordmark' && renderMark()}

      <div className="flex flex-col">
        <span
          className={`font-black tracking-tight leading-none ${currentSize.font} ${textPrimary}`}
        >
          Print<span className={textAccent}>Flow</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-success ml-0.5 align-baseline" />
        </span>

        {showTagline && (
          <span className={`font-semibold tracking-wide uppercase mt-0.5 ${currentSize.sub} ${textMuted}`}>
            {t('tagline', { defaultValue: 'Autonomous Print Ops' })}
          </span>
        )}
      </div>
    </div>
  );
};
