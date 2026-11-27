import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { SNAPPY_EASE } from '../../components/common/MotionPrimitives';
import {
  CheckCircle2,
  Clock,
  Printer,
  PackageCheck,
  FileCheck2,
  CreditCard,
  Receipt,
  AlertCircle,
  RefreshCw,
  Globe,
} from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { DevCenterPointBadge } from '../../components/common/DevCenterPointBadge';
import { usePageTitle } from '../../hooks/usePageTitle';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { toBengaliNumerals } from '../../lib/i18n';

interface OrderStatusData {
  reference: string;
  status: string;
  stages: string[];
  current_stage: number;
  shop_name: string;
  channel: string;
  currency: string;
  total_minor: number;
  total_bdt: string;
  created_at: string;
  paid_at?: string;
  completed_at?: string;
  collected_at?: string;
  print_failed?: boolean;
  is_terminal?: boolean;
}

export const OrderStatusPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t, i18n } = useTranslation(['order_status', 'common']);
  const [order, setOrder] = useState<OrderStatusData | null>(null);
  usePageTitle({ subtitle: order ? `Order #${order.reference}` : 'Order Tracking' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isBengali = i18n.language.startsWith('bn');
  const prevStatusRef = useRef<string>('');

  const toggleLanguage = () => {
    const nextLang = isBengali ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
    try {
      if (typeof window !== 'undefined' && typeof window.localStorage?.setItem === 'function') {
        window.localStorage.setItem('printflow_lang', nextLang);
      }
    } catch {
      // Ignore storage failures in restricted browser/test environments
    }
  };

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const response = await apiRequest(`/public/order/${token}`);
      if (response.data) {
        setOrder(response.data);
        setError(null);
      }
    } catch (err: any) {
      setError(err.response?.errors?.[0]?.message || t('order_status:load_failed'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Polling fallback every 3 seconds for live timeline progress
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [token]);

  // Fire confetti exactly once when order transitions to COLLECTED
  useEffect(() => {
    if (!order) return;
    const currentStatus = order.status.toLowerCase();
    if (
      currentStatus !== prevStatusRef.current &&
      (currentStatus === 'collected' || currentStatus === 'completed')
    ) {
      import('canvas-confetti').then((mod) => {
        const confetti = mod.default;
        confetti({ particleCount: 90, spread: 65, origin: { y: 0.55 }, colors: ['#059669', '#10b981', '#6ee7b7'] });
      });
    }
    prevStatusRef.current = currentStatus;
  }, [order?.status]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center space-y-4">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">{t('common:loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">{t('common:error')}</h2>
          <p className="text-sm text-slate-600">{error || t('order_status:order_not_found')}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg text-sm hover:bg-indigo-700"
          >
            {t('common:retry')}
          </button>
        </div>
      </div>
    );
  }

  const stageIcons = [
    <Clock key="0" className="w-5 h-5" />,
    <FileCheck2 key="1" className="w-5 h-5" />,
    <CreditCard key="2" className="w-5 h-5" />,
    <Printer key="3" className="w-5 h-5" />,
    <PackageCheck key="4" className="w-5 h-5" />,
    <CheckCircle2 key="5" className="w-5 h-5" />,
  ];

  const stageLabels: Record<string, string> = {
    SUBMITTED: t('order_status:stage_submitted'),
    UPLOADED: t('order_status:stage_uploaded'),
    PAID: t('order_status:stage_paid'),
    PRINTING: t('order_status:stage_printing'),
    READY: t('order_status:stage_ready'),
    COLLECTED: t('order_status:stage_collected'),
  };

  const stageDescriptions = [
    t('order_status:stage_queued_desc'),
    t('order_status:stage_uploaded_desc'),
    t('order_status:stage_paid_desc'),
    t('order_status:stage_spooling_desc'),
    t('order_status:stage_printed_desc'),
    t('order_status:stage_collected_desc'),
  ];

  const formattedTotal =
    typeof order.total_minor === 'number'
      ? formatMoney(order.total_minor, isBengali ? 'bn' : 'en')
      : order.total_bdt;

  const formattedReference = isBengali ? toBengaliNumerals(order.reference) : order.reference;

  return (
    <div className="min-h-screen bg-slate-50 py-6 sm:py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-5 sm:space-y-6">
        {/* Header Banner */}
        <div className="relative bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 text-center space-y-2">
          <button
            onClick={toggleLanguage}
            className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 transition-colors"
            aria-label="Toggle language"
          >
            <Globe className="w-3.5 h-3.5 text-indigo-600" />
            <span>{isBengali ? 'English' : 'বাংলা'}</span>
          </button>

          <Logo variant="mark" size="sm" className="mx-auto mb-2" />
          <span className="inline-block text-xs font-semibold tracking-wider uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
            {order.shop_name}
          </span>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            {t('order_status:tracking_title')}
          </h1>
          <div className="text-sm text-slate-600 font-medium font-mono">
            {t('order_status:reference', { reference: formattedReference })}
          </div>
          <div className="text-lg font-bold text-slate-900 pt-1">
            {formattedTotal}
          </div>
        </div>

        {/* Collection Handover Badge when Collected */}
        <AnimatePresence>
          {order.is_terminal && (order.status.toLowerCase() === 'collected' || order.status.toLowerCase() === 'completed') && (
            <motion.div
              key="collected-banner"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.45, ease: SNAPPY_EASE }}
              className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800"
            >
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.15 }}
              >
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
              </motion.div>
              <div>
                <div className="font-bold text-sm">{t('order_status:order_collected_title')}</div>
                <div className="text-xs text-emerald-700">
                  {t('order_status:order_collected_desc', {
                    time: order.collected_at
                      ? new Date(order.collected_at).toLocaleTimeString(isBengali ? 'bn-BD' : 'en-US')
                      : t('order_status:counter_fallback'),
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Print Failure Alert */}
        {(order.print_failed || order.status.toLowerCase() === 'failed') && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-800">
            <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
            <div>
              <div className="font-bold text-sm">{t('order_status:print_failed_title')}</div>
              <div className="text-xs text-red-700">{t('order_status:print_failed_desc')}</div>
            </div>
          </div>
        )}

        {/* 6-Stage Vertical Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 sm:p-6 space-y-6">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-800">
              {t('order_status:timeline_title')}
            </h2>
            <span className="text-[11px] font-medium text-slate-400">
              {t('order_status:auto_refresh_notice')}
            </span>
          </div>

          <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {order.stages.map((stageName, idx) => {
              const isCollected =
                order.status.toLowerCase() === 'collected' ||
                order.status.toLowerCase() === 'completed';
              const isPast = idx < order.current_stage || (isCollected && idx === order.current_stage);
              const isCurrent = idx === order.current_stage && !isCollected;
              const displayLabel = stageLabels[stageName] || stageName;

              return (
                <motion.div
                  key={`${stageName}-${isPast ? 'past' : isCurrent ? 'current' : 'future'}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.06, ease: SNAPPY_EASE }}
                  className="relative flex items-start gap-4"
                >
                  {/* Circle Marker */}
                  <motion.div
                    key={`${stageName}-${isPast ? 'past' : isCurrent ? 'current' : 'future'}`}
                    initial={isPast && (idx === order.current_stage - 1 || (isCollected && idx === order.current_stage))
                      ? { scale: 1.3, backgroundColor: '#6366f1' }
                      : { scale: 1 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                    className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white ${
                      isPast
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isPast ? '✓' : isBengali ? toBengaliNumerals(idx + 1) : idx + 1}
                  </motion.div>

                  {/* Stage Details */}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500">
                        {stageIcons[idx]}
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          isCurrent
                            ? 'text-indigo-700'
                            : isPast
                            ? 'text-slate-800'
                            : 'text-slate-400'
                        }`}
                      >
                        {displayLabel}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          {t('order_status:active_badge')}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs ${
                        isCurrent || isPast ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {stageDescriptions[idx] || displayLabel}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Action Button: View Printable Receipt */}
        <div className="text-center pt-2">
          <Link
            to={`/order/${token}/receipt`}
            className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 font-bold text-slate-800 text-sm shadow-2xs transition-all"
          >
            <Receipt className="w-4 h-4 text-slate-600" />
            <span>{t('order_status:view_receipt')}</span>
          </Link>
          <p className="text-xs text-slate-400 mt-3">{t('order_status:reprint_disclaimer')}</p>
        </div>

        <div className="pt-4 text-center">
          <DevCenterPointBadge variant="footer" />
        </div>
      </div>
    </div>
  );
};
