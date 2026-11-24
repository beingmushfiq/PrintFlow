import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CreditCard, ShieldCheck, Smartphone, Terminal, Loader2, AlertCircle } from 'lucide-react';
import { formatMoney } from '../lib/money';
import { apiRequest } from '../lib/api';

export type PaymentGatewayType = 'sslcommerz' | 'bkash' | 'sandbox';

interface HostedPaymentCheckoutProps {
  slug: string;
  orderToken: string;
  totalMinor: number;
  isQuoteExpired?: boolean;
  onPaymentSuccess?: (result: any) => void;
  onPaymentError?: (err: any) => void;
}

export const HostedPaymentCheckout: React.FC<HostedPaymentCheckoutProps> = ({
  slug,
  orderToken,
  totalMinor,
  isQuoteExpired = false,
  onPaymentSuccess,
  onPaymentError,
}) => {
  const { t, i18n } = useTranslation(['payment', 'common']);
  const currentLang = (i18n.language || 'bn').startsWith('en') ? 'en' : 'bn';

  const [selectedGateway, setSelectedGateway] = useState<PaymentGatewayType>('sandbox');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sandboxOutcome, setSandboxOutcome] = useState<'success' | 'failed' | 'timeout'>('success');

  // Simple sha256 helper for client-side idempotency token
  const generateIdempotencyToken = async (): Promise<string> => {
    const raw = `checkout_${orderToken}_${Date.now()}_${Math.random()}`;
    try {
      const msgBuffer = new TextEncoder().encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback
      return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
  };

  const handleCheckout = async () => {
    if (isSubmitting || isQuoteExpired) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const idempotencyToken = await generateIdempotencyToken();

      if (selectedGateway === 'sandbox') {
        const response = await apiRequest('/public/payments/sandbox/simulate', {
          method: 'POST',
          body: JSON.stringify({
            order_token: orderToken,
            outcome: sandboxOutcome,
            amount_minor: totalMinor,
          }),
        });

        if (response.data?.status === 'PAID') {
          onPaymentSuccess?.(response.data);
        } else {
          throw new Error(response.data?.error || `Sandbox returned status: ${response.data?.status}`);
        }
      } else {
        const response = await apiRequest(`/public/storefront/${slug}/order/${orderToken}/checkout`, {
          method: 'POST',
          body: JSON.stringify({
            gateway: selectedGateway,
            idempotency_token: idempotencyToken,
          }),
        });

        if (response.data?.redirect_url) {
          // In hosted mode, redirect customer to gateway hosted checkout page
          window.location.href = response.data.redirect_url;
        } else {
          onPaymentSuccess?.(response.data);
        }
      }
    } catch (err: any) {
      const msg = err.response?.errors?.[0]?.message || err.message || 'Payment initiation failed';
      setErrorMessage(msg);
      onPaymentError?.(err);
      // Re-enable submit button on error so customer can retry
      setIsSubmitting(false);
    }
  };

  const gateways: { id: PaymentGatewayType; label: string; desc: string; icon: React.ReactNode }[] = [
    {
      id: 'sslcommerz',
      label: t('payment:sslcommerz'),
      desc: t('payment:sslcommerz_desc'),
      icon: <CreditCard className="w-5 h-5 text-indigo-600" />,
    },
    {
      id: 'bkash',
      label: t('payment:bkash'),
      desc: t('payment:bkash_desc'),
      icon: <Smartphone className="w-5 h-5 text-pink-600" />,
    },
    {
      id: 'sandbox',
      label: t('payment:sandbox'),
      desc: t('payment:sandbox_desc'),
      icon: <Terminal className="w-5 h-5 text-emerald-600" />,
    },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-5">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600" />
        <h2 className="text-lg font-semibold text-slate-800">{t('payment:checkout_title')}</h2>
      </div>

      {errorMessage && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Gateway Options */}
      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700">{t('payment:select_gateway')}</label>
        <div className="space-y-2">
          {gateways.map((gw) => {
            const isSelected = selectedGateway === gw.id;
            return (
              <label
                key={gw.id}
                className={`flex items-center gap-3 p-3.5 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="payment_gateway"
                  value={gw.id}
                  checked={isSelected}
                  disabled={isSubmitting}
                  onChange={() => setSelectedGateway(gw.id)}
                  className="text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <div className="p-2 rounded-lg bg-white border border-slate-100 shadow-2xs">
                  {gw.icon}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-800 text-sm">{gw.label}</div>
                  <div className="text-xs text-slate-500">{gw.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Sandbox outcome simulator control */}
      {selectedGateway === 'sandbox' && (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
          <span className="font-semibold text-slate-700 block">Simulation Outcome:</span>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="sandbox_outcome"
                value="success"
                checked={sandboxOutcome === 'success'}
                onChange={() => setSandboxOutcome('success')}
                className="text-indigo-600"
              />
              <span className="text-emerald-700 font-medium">Success (PAID)</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="sandbox_outcome"
                value="failed"
                checked={sandboxOutcome === 'failed'}
                onChange={() => setSandboxOutcome('failed')}
                className="text-indigo-600"
              />
              <span className="text-red-700 font-medium">Declined</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="sandbox_outcome"
                value="timeout"
                checked={sandboxOutcome === 'timeout'}
                onChange={() => setSandboxOutcome('timeout')}
                className="text-indigo-600"
              />
              <span className="text-amber-700 font-medium">Timeout</span>
            </label>
          </div>
        </div>
      )}

      {/* Pay Now Button with Double-Submit Guard */}
      <button
        type="button"
        aria-label="Pay Now"
        disabled={isSubmitting || isQuoteExpired || totalMinor <= 0}
        onClick={handleCheckout}
        className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>{t('payment:processing')}</span>
          </>
        ) : (
          <span>{t('payment:pay_now', { amount: formatMoney(totalMinor, currentLang) })}</span>
        )}
      </button>

      <div className="text-center">
        <p className="text-xs text-slate-400">{t('payment:secure_notice')}</p>
      </div>
    </div>
  );
};
