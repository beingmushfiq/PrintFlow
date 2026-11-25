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

  // DevCenterPoint Brand Mark
  const renderMark = () => (
    <img
      src="/brand-mark.png"
      alt=""
      width={currentSize.mark}
      height={currentSize.mark}
      className="shrink-0 select-none shadow-sm rounded-[24%] object-contain bg-white border border-border/40"
      aria-hidden="true"
    />
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
