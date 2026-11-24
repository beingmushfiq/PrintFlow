import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calculator, Clock, Receipt, AlertCircle } from 'lucide-react';
import { formatMoney } from '../lib/money';

export interface QuoteBreakdownItem {
  type?: string;
  description: string;
  quantity: number;
  unitRatePoisha: number;
  totalPoisha: number;
}

export interface QuoteBreakdownData {
  id?: string;
  quote_version?: number;
  total_sheets: number;
  total_sides: number;
  duplex_sheets?: number;
  simplex_sheets?: number;
  subtotal_minor: number;
  tax_minor: number;
  fee_minor: number;
  discount_minor: number;
  total_minor: number;
  calculation_hash?: string;
  expires_at?: string;
  is_expired?: boolean;
  line_items: QuoteBreakdownItem[];
}

interface QuoteBreakdownCardProps {
  quote: QuoteBreakdownData | null;
  isLoading?: boolean;
  onRefreshQuote?: () => void;
}

export const QuoteBreakdownCard: React.FC<QuoteBreakdownCardProps> = ({
  quote,
  isLoading = false,
  onRefreshQuote,
}) => {
  const { t, i18n } = useTranslation(['quote', 'common']);
  const currentLang = (i18n.language || 'bn').startsWith('en') ? 'en' : 'bn';

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!quote?.expires_at) {
      setRemainingSeconds(null);
      return;
    }

    const target = new Date(quote.expires_at).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setRemainingSeconds(diff);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [quote?.expires_at]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center space-y-3 min-h-[220px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500 font-medium">{t('common:loading')}</p>
      </div>
    );
  }

  if (!quote) {
    return null;
  }

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const isExpired = remainingSeconds !== null && remainingSeconds <= 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
      {/* Header & Expiry Countdown */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold text-slate-800">{t('quote:breakdown_title')}</h2>
        </div>

        {remainingSeconds !== null && !isExpired && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            <span>{t('quote:expires_in', { minutes: formatTimer(remainingSeconds) })}</span>
          </div>
        )}
      </div>

      {isExpired && (
        <div className="flex items-center justify-between p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>The quote has expired. Please refresh to lock in current rates.</span>
          </div>
          {onRefreshQuote && (
            <button
              onClick={onRefreshQuote}
              className="text-xs font-bold underline hover:text-red-800 px-2 py-1"
            >
              {t('common:retry')}
            </button>
          )}
        </div>
      )}

      {/* Sheets & Sides Metrics */}
      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg text-center">
        <div>
          <span className="block text-xs text-slate-500">{t('quote:sheets_count')}</span>
          <span className="text-xl font-bold text-slate-800">{quote.total_sheets}</span>
        </div>
        <div>
          <span className="block text-xs text-slate-500">{t('quote:sides_count')}</span>
          <span className="text-xl font-bold text-slate-800">{quote.total_sides}</span>
        </div>
      </div>

      {/* Itemized Line Items */}
      <div className="space-y-2 text-sm">
        {quote.line_items.map((item, idx) => {
          const isBackSide = item.type === 'duplex_back_side' || item.description.includes('Back');
          const isFrontSide = item.type === 'duplex_front_side' || item.description.includes('Front');
          const isOddPage = item.type === 'odd_page_simplex' || item.description.includes('Odd Page');

          return (
            <div
              key={idx}
              className={`flex items-start justify-between py-2 px-3 rounded-lg border ${
                isBackSide
                  ? 'bg-emerald-50/50 border-emerald-100 text-emerald-900'
                  : isFrontSide
                  ? 'bg-slate-50/60 border-slate-100 text-slate-800'
                  : isOddPage
                  ? 'bg-amber-50/40 border-amber-100 text-amber-900'
                  : 'bg-white border-slate-100 text-slate-700'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <span>{item.description}</span>
                  {isBackSide && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      Discounted
                    </span>
                  )}
                  {isOddPage && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                      Simplex
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {item.quantity} × {formatMoney(item.unitRatePoisha, currentLang)}
                </div>
              </div>
              <div className="font-semibold whitespace-nowrap">
                {formatMoney(item.totalPoisha, currentLang)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtotal, Tax, Fee, and Grand Total */}
      <div className="space-y-2 pt-2 border-t border-slate-100 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>{t('quote:subtotal')}</span>
          <span className="font-medium">{formatMoney(quote.subtotal_minor, currentLang)}</span>
        </div>

        {quote.fee_minor > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>{t('quote:service_fee')}</span>
            <span className="font-medium">{formatMoney(quote.fee_minor, currentLang)}</span>
          </div>
        )}

        {quote.tax_minor > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>VAT</span>
            <span className="font-medium">{formatMoney(quote.tax_minor, currentLang)}</span>
          </div>
        )}

        {quote.discount_minor > 0 && (
          <div className="flex justify-between text-emerald-600 font-medium">
            <span>{t('quote:discount')}</span>
            <span>-{formatMoney(quote.discount_minor, currentLang)}</span>
          </div>
        )}

        {/* Grand Total with Dual English/Bangla numerals display */}
        <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
          <div className="flex items-center gap-1.5">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <span className="text-base font-bold text-slate-900">{t('quote:total_amount')}</span>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-indigo-700">
              {formatMoney(quote.total_minor, 'bn')}
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {formatMoney(quote.total_minor, 'en')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
