import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, Check, AlertCircle } from 'lucide-react';
import { normalizeBdPhone, isValidBdPhone } from '../lib/phone';

export interface PhoneIntakeProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  autoFocus?: boolean;
  className?: string;
}

export const PhoneIntake: React.FC<PhoneIntakeProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  required = true,
  error: customError,
  autoFocus = false,
  className = '',
}) => {
  const { t } = useTranslation(['storefront', 'common']);
  const [touched, setTouched] = useState(false);

  const normalized = normalizeBdPhone(value);
  const isValid = isValidBdPhone(normalized);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    const clean = normalizeBdPhone(rawVal);
    const valid = isValidBdPhone(clean);
    onChange(clean, valid);
  };

  const handleBlur = () => {
    setTouched(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValid && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const showError = (touched || !!customError) && !isValid && (value.length > 0 || required);
  const errorMessage = customError || t('storefront:invalid_phone');

  return (
    <div className={`space-y-1.5 w-full ${className}`}>
      <label
        htmlFor="bd-phone-intake"
        className="block text-sm font-semibold text-ink flex items-center justify-between"
      >
        <span className="flex items-center space-x-1.5">
          <Phone className="w-4 h-4 text-accent" />
          <span>{t('storefront:phone_label')}</span>
        </span>
        {required && (
          <span className="text-xs text-status-danger font-normal">
            * {t('common:required', { defaultValue: 'Required' })}
          </span>
        )}
      </label>

      <div className="relative rounded-lg shadow-sm">
        {/* Country code prefix badge */}
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent border border-accent/20">
            <span>🇧🇩</span>
            <span>+880</span>
          </span>
        </div>

        <input
          id="bd-phone-intake"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          disabled={disabled}
          autoFocus={autoFocus}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={t('storefront:phone_placeholder', { defaultValue: '01XXXXXXXXX' })}
          className={`block w-full h-12 pl-24 pr-10 text-base font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 ${
            showError
              ? 'border-status-danger text-status-danger focus:ring-status-danger/30'
              : isValid
              ? 'border-status-success text-ink focus:border-status-success focus:ring-status-success/30'
              : 'border-border text-ink focus:border-accent focus:ring-accent/30 bg-surface'
          } ${disabled ? 'opacity-60 bg-paper cursor-not-allowed' : ''}`}
          aria-invalid={showError}
          aria-describedby={showError ? 'phone-error' : 'phone-hint'}
        />

        {/* Status icon right */}
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          {isValid ? (
            <Check className="w-5 h-5 text-status-success" />
          ) : showError ? (
            <AlertCircle className="w-5 h-5 text-status-danger" />
          ) : null}
        </div>
      </div>

      {showError ? (
        <p id="phone-error" className="text-xs font-medium text-status-danger flex items-center space-x-1 mt-1">
          <span>{errorMessage}</span>
        </p>
      ) : (
        <p id="phone-hint" className="text-xs text-muted mt-1">
          {t('storefront:phone_hint')}
        </p>
      )}
    </div>
  );
};
