import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { SNAPPY_EASE } from '../../components/common/MotionPrimitives';
import {
  ShieldCheck,
  MapPin,
  Phone,
  AlertTriangle,
  Globe,
  Loader2,
  CheckCircle,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { DevCenterPointBadge } from '../../components/common/DevCenterPointBadge';
import { usePageTitle } from '../../hooks/usePageTitle';
import { PhoneIntake } from '../../components/PhoneIntake';
import { FileUploadDropzone } from '../../components/FileUploadDropzone';
import type { UploadFileItem } from '../../components/FileCard';
import { PrintOptionsCard, type PrintOptions } from '../../components/PrintOptionsCard';
import { QuoteBreakdownCard, type QuoteBreakdownData } from '../../components/QuoteBreakdownCard';
import { HostedPaymentCheckout } from '../../components/HostedPaymentCheckout';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';

interface ShopData {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  public_status: string;
  public_settings: {
    accepted_formats?: string[];
    price_guide?: {
      simplex_mono?: number;
      duplex_mono?: number;
      simplex_color?: number;
      duplex_color?: number;
    };
  };
}

interface OrderData {
  id: string;
  public_reference: string;
  public_token: string;
  customer_phone: string;
  status: string;
}

export const StorefrontPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(['storefront', 'common']);

  const [shop, setShop] = useState<ShopData | null>(null);
  usePageTitle({ prefixShopName: shop?.name });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Order state
  const [customerPhone, setCustomerPhone] = useState('');
  const [isPhoneValid, setIsPhoneValid] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [order, setOrder] = useState<OrderData | null>(null);
  const [readyFiles, setReadyFiles] = useState<UploadFileItem[]>([]);
  const [step, setStep] = useState<'intake' | 'upload' | 'options_and_checkout'>('intake');

  // Milestone 3: Print Options & Quote state
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    copies: 1,
    color_mode: 'mono',
    sides_mode: 'simplex',
    paper_size: 'A4',
    page_range: 'all',
  });
  const [quote, setQuote] = useState<QuoteBreakdownData | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiRequest<{ shop: ShopData }>(`/public/storefront/${slug}`)
      .then(res => {
        setShop(res.data.shop);
        setError(null);
      })
      .catch(err => {
        setError(err.message || 'Shop not found.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('bn') ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
  };

  const handleStartOrder = async () => {
    if (!isPhoneValid || !slug || creatingOrder) return;

    setCreatingOrder(true);
    try {
      const res = await apiRequest<{ order: OrderData }>(`/public/storefront/${slug}/order`, {
        method: 'POST',
        body: JSON.stringify({
          customer_phone: customerPhone,
          customer_name: customerName || undefined,
        }),
      });

      setOrder(res.data.order);
      setStep('upload');
    } catch (err: any) {
      alert(err.message || 'Failed to start order.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const fetchQuote = async (opts: PrintOptions = printOptions) => {
    if (!order || !slug) return;
    setQuoteLoading(true);
    try {
      const res = await apiRequest(`/public/storefront/${slug}/order/${order.public_token}/quote`, {
        method: 'POST',
        body: JSON.stringify(opts),
      });
      if (res.data?.quote) {
        setQuote(res.data.quote);
      }
    } catch (err: any) {
      console.error('Failed to calculate quote', err);
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleProceedToOptions = () => {
    setStep('options_and_checkout');
    fetchQuote(printOptions);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3 text-muted">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm font-medium">{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface border border-border rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 text-status-danger flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-ink">Shop Unavailable</h2>
          <p className="text-sm text-muted">{error || 'Unable to load print shop storefront.'}</p>
        </div>
      </div>
    );
  }

  const isPaused = shop.public_status !== 'active';
  const isBengali = i18n.language.startsWith('bn');
  const priceGuide = shop.public_settings?.price_guide || {
    simplex_mono: 300,
    duplex_mono: 500,
    simplex_color: 1000,
    duplex_color: 1800,
  };

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between selection:bg-accent-soft selection:text-accent">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 bg-surface/95 backdrop-blur border-b border-border px-4 py-3 sm:px-6 shadow-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Logo variant="mark" size="sm" />
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent block leading-none">
                {t('storefront:counter_label')}
              </span>
              <h1 className="text-base font-bold text-ink leading-tight truncate max-w-[140px] sm:max-w-xs">
                {shop.name}
              </h1>
            </div>
          </div>

          <button
            onClick={toggleLanguage}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border bg-paper hover:bg-paper-dark transition-colors text-xs font-medium"
            aria-label="Toggle language"
          >
            <Globe className="w-3.5 h-3.5 text-accent" />
            <span>{isBengali ? 'English' : 'বাংলা'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* Shop Info Card */}
        <section className="bg-surface border border-border rounded-2xl p-5 shadow-sm space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-ink tracking-tight">
                {t('storefront:welcome', { shopName: shop.name })}
              </h2>
              {shop.address && (
                <p className="text-xs text-muted flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-accent" />
                  <span>{shop.address}</span>
                </p>
              )}
              {shop.phone && (
                <p className="text-xs text-muted flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5 shrink-0 text-accent" />
                  <span>{shop.phone}</span>
                </p>
              )}
            </div>

            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              shop.public_status === 'active'
                ? 'bg-emerald-50 text-status-success border border-status-success/20'
                : 'bg-amber-50 text-status-warning border border-status-warning/20'
            }`}>
              ● {shop.public_status === 'active' ? t('storefront:status_open') : t('storefront:status_paused')}
            </span>
          </div>

          {/* Pricing Guide Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/60">
            <div className="bg-paper p-2 rounded-lg text-center">
              <span className="text-[10px] text-muted block uppercase font-bold">{t('storefront:rate_mono_single')}</span>
              <span className="text-xs font-bold text-ink">
                {formatMoney(priceGuide.simplex_mono || 300, isBengali ? 'bn' : 'en')}
              </span>
            </div>
            <div className="bg-paper p-2 rounded-lg text-center">
              <span className="text-[10px] text-muted block uppercase font-bold">{t('storefront:rate_mono_duplex')}</span>
              <span className="text-xs font-bold text-ink">
                {formatMoney(priceGuide.duplex_mono || 500, isBengali ? 'bn' : 'en')}
              </span>
            </div>
            <div className="bg-paper p-2 rounded-lg text-center">
              <span className="text-[10px] text-muted block uppercase font-bold">{t('storefront:rate_color_single')}</span>
              <span className="text-xs font-bold text-ink">
                {formatMoney(priceGuide.simplex_color || 1000, isBengali ? 'bn' : 'en')}
              </span>
            </div>
            <div className="bg-paper p-2 rounded-lg text-center">
              <span className="text-[10px] text-muted block uppercase font-bold">{t('storefront:rate_color_duplex')}</span>
              <span className="text-xs font-bold text-ink">
                {formatMoney(priceGuide.duplex_color || 1800, isBengali ? 'bn' : 'en')}
              </span>
            </div>
          </div>
        </section>

        {/* Closed/Paused Alert */}
        {isPaused && (
          <div className="bg-amber-50 border border-status-warning/30 rounded-2xl p-4 flex items-start space-x-3 text-status-warning">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold">{t('storefront:shop_paused_title')}</h3>
              <p className="text-xs mt-0.5 text-amber-800">
                {t('storefront:shop_paused_desc')}
              </p>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 1: Customer Phone Intake */}
          {!order && !isPaused && (
            <motion.section
              key="step-phone"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: SNAPPY_EASE }}
              className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
            >
            <div className="space-y-1">
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-accent-soft text-accent">
                <Sparkles className="w-3 h-3" />
                <span>{t('storefront:step_1_of_2')}</span>
              </span>
              <h3 className="text-lg font-bold text-ink">
                {t('storefront:scan_prompt')}
              </h3>
              <p className="text-xs text-muted">
                {t('storefront:phone_hint')}
              </p>
            </div>

            <div className="space-y-4">
              <PhoneIntake
                value={customerPhone}
                onChange={(val, valid) => {
                  setCustomerPhone(val);
                  setIsPhoneValid(valid);
                }}
                onSubmit={handleStartOrder}
                autoFocus
              />

              <div className="space-y-1.5">
                <label htmlFor="customer-name" className="block text-xs font-semibold text-ink">
                  {t('storefront:customer_name_label')}
                </label>
                <input
                  id="customer-name"
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder={t('storefront:customer_name_placeholder')}
                  className="block w-full h-11 px-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              <button
                type="button"
                onClick={handleStartOrder}
                disabled={!isPhoneValid || creatingOrder}
                className={`w-full h-12 flex items-center justify-center space-x-2 rounded-xl font-bold text-sm transition-all ${
                  isPhoneValid && !creatingOrder
                    ? 'bg-accent hover:bg-accent/90 text-white shadow-md cursor-pointer'
                    : 'bg-paper-dark text-muted border border-border cursor-not-allowed'
                }`}
              >
                {creatingOrder ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>{t('storefront:continue_to_upload')}</span>
                    <span>→</span>
                  </>
                )}
              </button>
            </div>
            </motion.section>
          )}

          {/* Step 2: Upload Documents */}
          {order && (
            <motion.section
              key="step-upload"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: SNAPPY_EASE }}
              className="bg-surface border border-border rounded-2xl p-5 sm:p-6 shadow-sm space-y-5"
            >
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold text-accent uppercase tracking-wider block">
                  Active Order Session
                </span>
                <span className="text-base font-extrabold text-ink font-mono">
                  {order.public_reference}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted block">Phone</span>
                <span className="text-xs font-semibold text-ink">
                  {order.customer_phone}
                </span>
              </div>
            </div>

            <FileUploadDropzone
              publicToken={order.public_token}
              onFilesChanged={(files) => setReadyFiles(files)}
            />

            {readyFiles.length > 0 && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProceedToOptions}
                  className="w-full h-12 flex items-center justify-center space-x-2 rounded-xl bg-status-success text-white font-bold text-sm shadow-md hover:bg-status-success/90 transition-all cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    Proceed with {readyFiles.length} {readyFiles.length === 1 ? 'document' : 'documents'}
                  </span>
                </button>
              </div>
            )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Step 3: Print Options, Live Quote & Checkout */}
        <AnimatePresence>
          {order && step === 'options_and_checkout' && (
            <motion.section
              key="step-options"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: SNAPPY_EASE }}
              className="space-y-6"
            >
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change Uploaded Documents</span>
              </button>

              <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md">
                {order.public_reference}
              </span>
            </div>

            {/* Print Options Configuration Card */}
            <PrintOptionsCard
              options={printOptions}
              onChange={(newOptions) => {
                setPrintOptions(newOptions);
                fetchQuote(newOptions);
              }}
            />

            {/* Live Interactive Quote Breakdown Card */}
            <QuoteBreakdownCard
              quote={quote}
              isLoading={quoteLoading}
              onRefreshQuote={() => fetchQuote(printOptions)}
            />

            {/* Hosted Payment Selection UI & Double-Submit Guard */}
            {quote && (
              <HostedPaymentCheckout
                slug={slug!}
                orderToken={order.public_token}
                totalMinor={quote.total_minor}
                isQuoteExpired={quote.is_expired}
                onPaymentSuccess={() => {
                  navigate(`/order/${order.public_token}`);
                }}
              />
            )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Trust & Privacy Card */}
        <section className="bg-surface/60 border border-border rounded-xl p-4 flex items-start space-x-3 text-xs text-muted shadow-xs">
          <ShieldCheck className="w-5 h-5 text-status-success shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-ink">
              {t('storefront:privacy_notice')}
            </p>
            <p className="text-[11px]">
              {t('storefront:file_retention_policy')}
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-4 px-4 text-center border-t border-border bg-surface">
        <DevCenterPointBadge variant="footer" />
      </footer>
    </div>
  );
};
