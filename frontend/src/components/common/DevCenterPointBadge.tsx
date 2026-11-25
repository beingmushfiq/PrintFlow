import React from 'react';

interface DevCenterPointBadgeProps {
  /** 'footer' shows full copyright + mark; 'sidebar' shows compact "Built by [mark] DevCenterPoint"; 'icon' shows mark only */
  variant?: 'footer' | 'sidebar' | 'icon';
  className?: string;
}

export const DevCenterPointBadge: React.FC<DevCenterPointBadgeProps> = ({
  variant = 'footer',
  className = '',
}) => {
  if (variant === 'icon') {
    return (
      <a
        href="https://devcenterpoint.com"
        target="_blank"
        rel="noreferrer"
        title="Built by DevCenterPoint"
        aria-label="DevCenterPoint"
        className={`inline-flex items-center justify-center p-1.5 rounded-lg hover:bg-paper transition-colors opacity-80 hover:opacity-100 ${className}`}
      >
        <img
          src="/dcp-mark.png"
          alt="DevCenterPoint"
          width={18}
          height={18}
          className="w-[18px] h-[18px] object-contain"
        />
      </a>
    );
  }

  if (variant === 'sidebar') {
    return (
      <a
        href="https://devcenterpoint.com"
        target="_blank"
        rel="noreferrer"
        className={`inline-flex items-center justify-center space-x-1.5 text-[11px] text-muted hover:text-ink transition-colors group ${className}`}
      >
        <span>Built by</span>
        <img
          src="/dcp-mark.png"
          alt=""
          width={14}
          height={14}
          className="w-3.5 h-3.5 object-contain opacity-90 group-hover:opacity-100"
          aria-hidden="true"
        />
        <span className="font-semibold text-accent group-hover:underline">DevCenterPoint</span>
      </a>
    );
  }

  return (
    <div className={`inline-flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted ${className}`}>
      <span>&copy; 2026 PrintFlow by</span>
      <a
        href="https://devcenterpoint.com"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center space-x-1 font-semibold text-ink/80 hover:text-accent transition-colors"
      >
        <img
          src="/dcp-mark.png"
          alt=""
          width={15}
          height={15}
          className="w-[15px] h-[15px] object-contain"
          aria-hidden="true"
        />
        <span>DevCenterPoint</span>
      </a>
    </div>
  );
};

export default DevCenterPointBadge;
