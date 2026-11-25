import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
} from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { DevCenterPointBadge } from '../../components/common/DevCenterPointBadge';
import { usePageTitle } from '../../hooks/usePageTitle';
import { apiRequest } from '../../lib/api';

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
  is_terminal?: boolean;
}

export const OrderStatusPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [order, setOrder] = useState<OrderStatusData | null>(null);
  usePageTitle({ subtitle: order ? `Order #${order.reference}` : 'Order Tracking' });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    if (!token) return;
    try {
      const response = await apiRequest(`/public/order/${token}`);
      if (response.data) {
        setOrder(response.data);
      }
    } catch (err: any) {
      setError(err.response?.errors?.[0]?.message || 'Failed to load order status.');
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 flex flex-col items-center space-y-4">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-medium text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">{t('common.error')}</h2>
          <p className="text-sm text-slate-600">{error || 'Order not found'}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg text-sm hover:bg-indigo-700"
          >
            {t('common.retry')}
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

  const stageDescriptions = [
    t('order_status.stage_queued_desc'),
    'Documents securely scanned and processed',
    t('order_status.stage_paid_desc'),
    t('order_status.stage_spooling_desc'),
    t('order_status.stage_printed_desc'),
    t('order_status.stage_collected_desc'),
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 text-center space-y-2">
          <Logo variant="mark" size="sm" className="mx-auto mb-2" />
          <span className="text-xs font-semibold tracking-wider uppercase text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
            {order.shop_name}
          </span>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            {t('order_status.tracking_title')}
          </h1>
          <div className="text-sm text-slate-600 font-medium">
            {t('order_status.reference', { reference: order.reference })}
          </div>
          <div className="text-lg font-bold text-slate-800 pt-1">
            {order.total_bdt}
          </div>
        </div>

        {/* Collection Handover Badge when Collected */}
        {order.is_terminal && (order.status.toLowerCase() === 'collected' || order.status.toLowerCase() === 'completed') && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <div className="font-bold text-sm">Order Collected Successfully</div>
              <div className="text-xs text-emerald-700">
                Handed over to customer at {order.collected_at ? new Date(order.collected_at).toLocaleTimeString() : 'counter'}.
              </div>
            </div>
          </div>
        )}

        {/* 6-Stage Vertical Timeline */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <h2 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
            Timeline Progress
          </h2>

          <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {order.stages.map((stageName, idx) => {
              const isPast = idx < order.current_stage;
              const isCurrent = idx === order.current_stage;

              return (
                <div key={stageName} className="relative flex items-start gap-4">
                  {/* Circle Marker */}
                  <div
                    className={`absolute -left-6 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-4 ring-white ${
                      isPast
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-indigo-600 text-white animate-pulse'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isPast ? '✓' : idx + 1}
                  </div>

                  {/* Stage Details */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
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
                        {stageName}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs ${
                        isCurrent || isPast ? 'text-slate-600' : 'text-slate-400'
                      }`}
                    >
                      {stageDescriptions[idx] || stageName}
                    </p>
                  </div>
                </div>
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
            <span>{t('order_status.view_receipt')}</span>
          </Link>
          <p className="text-xs text-slate-400 mt-3">{t('order_status.reprint_disclaimer')}</p>
        </div>

        <div className="pt-4 text-center">
          <DevCenterPointBadge variant="footer" />
        </div>
      </div>
    </div>
  );
};
