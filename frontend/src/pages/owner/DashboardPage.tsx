import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  Monitor,
  ListOrdered,
  Plus,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { AgentPairingModal } from '../../components/owner/AgentPairingModal';
import { AnimatedCounter } from '../../components/common/MotionPrimitives';

gsap.registerPlugin(useGSAP);

export const DashboardPage: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'owner']);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pairingModalOpen, setPairingModalOpen] = useState<boolean>(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const isJsdom =
        typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
      if (isJsdom) return;

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.kpi-card', {
          y: 14,
          opacity: 0,
          duration: 0.4,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });

      return () => mm.revert();
    },
    { scope: gridRef }
  );

  const fetchMetrics = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const res = await apiRequest('/owner/dashboard/metrics');
      setMetrics(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard metrics');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(() => fetchMetrics(true), 5000); // 5s live sync
    return () => clearInterval(interval);
  }, []);

  const getQueueStatusBadge = (errorsCount: number, queueDepth: number) => {
    if (errorsCount > 0) {
      return { color: 'bg-status-error/15 text-status-error border-status-error/30', label: `${errorsCount} Error(s)` };
    }
    if (queueDepth > 10) {
      return { color: 'bg-status-warning/15 text-status-warning border-status-warning/30', label: 'High Traffic' };
    }
    return { color: 'bg-status-success/15 text-status-success border-status-success/30', label: 'Normal Traffic' };
  };

  const badge = getQueueStatusBadge(metrics?.active_errors_count ?? 0, metrics?.queue_depth ?? 0);

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-150">
      {/* Top Banner & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t('owner:dashboard')}</h1>
          <p className="text-sm text-muted">Real-time walk-in counter operations and physical spooler status</p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => fetchMetrics(false)}
            disabled={loading}
            className="p-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-muted hover:text-ink"
            aria-label="Refresh metrics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => setPairingModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent/90 text-white font-semibold text-xs shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('owner:pair_agent')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 5 Operational Metric Cards */}
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Today's Revenue */}
        <div className="kpi-card p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t('owner:revenue_today')}</span>
            <div className="w-8 h-8 rounded-lg bg-status-success/15 text-status-success flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">
            {loading && !metrics ? (
              <div className="h-8 w-28 rounded-lg skeleton-shimmer" />
            ) : metrics?.today_revenue_poisha != null ? (
              <AnimatedCounter
                value={Number(metrics.today_revenue_poisha) || 0}
                formatter={(v) => formatMoney(Math.round(v), i18n.language.startsWith('bn') ? 'bn' : 'en')}
              />
            ) : (
              metrics?.today_revenue_formatted ?? '৳ 0.00'
            )}
          </div>
          <p className="text-[11px] text-muted">Integer Poisha minor units</p>
        </div>

        {/* Today's Orders */}
        <div className="kpi-card p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t('owner:orders_today')}</span>
            <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">
            {loading && !metrics ? (
              <div className="h-8 w-16 rounded-lg skeleton-shimmer" />
            ) : (
              <AnimatedCounter value={Number(metrics?.today_orders_count ?? 0)} />
            )}
          </div>
          <p className="text-[11px] text-muted">Total counter uploads</p>
        </div>

        {/* Active Queue Depth */}
        <div className="kpi-card p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t('owner:queue_depth')}</span>
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <ListOrdered className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">
            {loading && !metrics ? (
              <div className="h-8 w-16 rounded-lg skeleton-shimmer" />
            ) : (
              <AnimatedCounter value={Number(metrics?.queue_depth ?? 0)} />
            )}
          </div>
          <div className="flex items-center">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${badge.color}`}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Active Print Errors */}
        <div className="kpi-card p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t('owner:print_errors')}</span>
            <div className="w-8 h-8 rounded-lg bg-status-error/15 text-status-error flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">
            {loading && !metrics ? (
              <div className="h-8 w-16 rounded-lg skeleton-shimmer" />
            ) : (
              <AnimatedCounter value={Number(metrics?.active_errors_count ?? 0)} />
            )}
          </div>
          <p className="text-[11px] text-muted">Failed or jammed jobs</p>
        </div>

        {/* Connected Print Agents */}
        <div className="kpi-card p-5 rounded-2xl bg-surface border border-border shadow-xs space-y-3 hover:border-accent/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">{t('owner:connected_agents')}</span>
            <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Monitor className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-ink tracking-tight">
            {loading && !metrics ? (
              <div className="h-8 w-16 rounded-lg skeleton-shimmer" />
            ) : (
              <AnimatedCounter value={Number(metrics?.connected_agents_count ?? 0)} />
            )}
          </div>
          <p className="text-[11px] text-status-success font-semibold flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Active Station(s)</span>
          </p>
        </div>
      </div>

      {/* Operational Shortcuts & System Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/owner/queue"
          className="group p-6 rounded-2xl bg-surface border border-border hover:border-accent shadow-xs transition-all flex flex-col justify-between space-y-4"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
              <ListOrdered className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-ink">{t('owner:live_queue')}</h3>
            <p className="text-xs text-muted">
              Inspect active queue items, hold or cancel jobs prior to physical spool output.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-accent group-hover:translate-x-1 transition-transform">
            <span>Open Queue</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link
          to="/owner/orders"
          className="group p-6 rounded-2xl bg-surface border border-border hover:border-accent shadow-xs transition-all flex flex-col justify-between space-y-4"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-ink">{t('owner:orders')}</h3>
            <p className="text-xs text-muted">
              Search historical transactions by phone, reference, date, and execute handover.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-accent group-hover:translate-x-1 transition-transform">
            <span>Browse History</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>

        <Link
          to="/owner/pricing"
          className="group p-6 rounded-2xl bg-surface border border-border hover:border-accent shadow-xs transition-all flex flex-col justify-between space-y-4"
        >
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-ink">{t('owner:pricing')}</h3>
            <p className="text-xs text-muted">
              Configure simplex/duplex side rates with live dynamic calculator in Poisha.
            </p>
          </div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-accent group-hover:translate-x-1 transition-transform">
            <span>Adjust Pricing</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </Link>
      </div>

      <AgentPairingModal isOpen={pairingModalOpen} onClose={() => setPairingModalOpen(false)} />
    </div>
  );
};

export default DashboardPage;
