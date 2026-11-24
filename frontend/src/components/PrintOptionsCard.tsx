import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, FileText, Palette, Layers, SlidersHorizontal, Check } from 'lucide-react';

export interface PrintOptions {
  copies: number;
  color_mode: 'mono' | 'color';
  sides_mode: 'simplex' | 'duplex';
  paper_size: 'A4' | 'Legal';
  page_range: string;
}

interface PrintOptionsCardProps {
  options: PrintOptions;
  onChange: (newOptions: PrintOptions) => void;
  disabled?: boolean;
}

export const PrintOptionsCard: React.FC<PrintOptionsCardProps> = ({
  options,
  onChange,
  disabled = false,
}) => {
  const { t } = useTranslation(['quote', 'common']);
  const [isCustomRange, setIsCustomRange] = useState(options.page_range !== 'all');
  const [customRangeText, setCustomRangeText] = useState(
    options.page_range !== 'all' ? options.page_range : ''
  );

  const updateField = <K extends keyof PrintOptions>(field: K, value: PrintOptions[K]) => {
    onChange({
      ...options,
      [field]: value,
    });
  };

  const handleCopiesChange = (delta: number) => {
    const next = Math.max(1, Math.min(100, options.copies + delta));
    updateField('copies', next);
  };

  const handleCustomRangeBlur = () => {
    const trimmed = customRangeText.trim();
    if (!trimmed || trimmed.toLowerCase() === 'all') {
      setIsCustomRange(false);
      updateField('page_range', 'all');
    } else {
      updateField('page_range', trimmed);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-6">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
        <h2 className="text-lg font-semibold text-slate-800">{t('quote:title')}</h2>
      </div>

      {/* Copies Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Copy className="w-4 h-4 text-slate-500" />
          <label className="text-sm font-medium text-slate-700">{t('quote:copies')}</label>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || options.copies <= 1}
            onClick={() => handleCopiesChange(-1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg"
            aria-label="Decrease copies"
          >
            -
          </button>
          <input
            type="number"
            min={1}
            max={100}
            disabled={disabled}
            value={options.copies}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                updateField('copies', Math.max(1, Math.min(100, val)));
              }
            }}
            className="w-14 text-center font-bold text-slate-900 border border-slate-300 rounded-lg py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            disabled={disabled || options.copies >= 100}
            onClick={() => handleCopiesChange(1)}
            className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg"
            aria-label="Increase copies"
          >
            +
          </button>
        </div>
      </div>

      {/* Sides Mode (Simplex vs Duplex) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <label className="text-sm font-medium text-slate-700">{t('quote:sides_mode')}</label>
          </div>
          <span className="text-xs text-indigo-600 font-medium">{t('quote:duplex_rule_note')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateField('sides_mode', 'simplex')}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
              options.sides_mode === 'simplex'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 ring-2 ring-indigo-500/20'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {options.sides_mode === 'simplex' && <Check className="w-4 h-4 text-indigo-600" />}
            {t('quote:simplex')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateField('sides_mode', 'duplex')}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
              options.sides_mode === 'duplex'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 ring-2 ring-indigo-500/20'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {options.sides_mode === 'duplex' && <Check className="w-4 h-4 text-indigo-600" />}
            {t('quote:duplex')}
          </button>
        </div>
      </div>

      {/* Color Mode (Mono vs Color) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-slate-500" />
          <label className="text-sm font-medium text-slate-700">{t('quote:color_mode')}</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            aria-label="Mono print"
            onClick={() => updateField('color_mode', 'mono')}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
              options.color_mode === 'mono'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 ring-2 ring-indigo-500/20'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {options.color_mode === 'mono' && <Check className="w-4 h-4 text-indigo-600" />}
            {t('quote:color_mono')}
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-label="Color print"
            onClick={() => updateField('color_mode', 'color')}
            className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all ${
              options.color_mode === 'color'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 ring-2 ring-indigo-500/20'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {options.color_mode === 'color' && <Check className="w-4 h-4 text-indigo-600" />}
            {t('quote:color_full')}
          </button>
        </div>
      </div>

      {/* Paper Size (A4 vs Legal) */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <label className="text-sm font-medium text-slate-700">{t('quote:paper_size')}</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateField('paper_size', 'A4')}
            className={`py-2 px-3 rounded-lg border text-sm font-medium text-center transition-all ${
              options.paper_size === 'A4'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 font-semibold'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {t('quote:paper_a4')}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => updateField('paper_size', 'Legal')}
            className={`py-2 px-3 rounded-lg border text-sm font-medium text-center transition-all ${
              options.paper_size === 'Legal'
                ? 'border-indigo-600 bg-indigo-50/60 text-indigo-700 font-semibold'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            {t('quote:paper_legal')}
          </button>
        </div>
      </div>

      {/* Page Range */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-slate-700">{t('quote:page_range')}</label>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="page_range_mode"
              checked={!isCustomRange}
              disabled={disabled}
              onChange={() => {
                setIsCustomRange(false);
                updateField('page_range', 'all');
              }}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span>{t('quote:page_range_all')}</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="page_range_mode"
              checked={isCustomRange}
              disabled={disabled}
              onChange={() => {
                setIsCustomRange(true);
                if (customRangeText.trim()) {
                  updateField('page_range', customRangeText.trim());
                }
              }}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span>{t('quote:page_range_custom')}</span>
          </label>
        </div>

        {isCustomRange && (
          <div className="pt-1">
            <input
              type="text"
              disabled={disabled}
              placeholder="e.g. 1-3, 5, 8-10"
              value={customRangeText}
              onChange={(e) => setCustomRangeText(e.target.value)}
              onBlur={handleCustomRangeBlur}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
};
