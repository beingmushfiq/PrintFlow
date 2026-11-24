import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  FileText,
  CreditCard,
  Clock,
  User,
  Phone,
  AlertCircle,
  RotateCcw,
  Hand,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';

interface OrderDetailModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onReprintClick: (orderId: string, reference: string) => void;
  onHandoverSuccess: () => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  orderId,
  isOpen,
  onClose,
  onReprintClick,
  onHandoverSuccess,
}) => {
  const { t } = useTranslation(['common', 'owner']);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !orderId) return;

    setLoading(true);
    setError(null);
    apiRequest(`/owner/orders/${orderId}`)
      .then((res) => {
        setOrder(res.data);
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load order details');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, orderId]);

  if (!isOpen || !orderId) return null;

  const handleHandover = async () => {
    if (!order) return;
    setActionLoading(true);
    try {
      await apiRequest(`/owner/orders/${order.id}/handover`, { method: 'POST' });
      setOrder((prev: any) => ({ ...prev, status: 'COLLECTED' }));
      onHandoverSuccess();
    } catch (err: any) {
      alert(err?.message || 'Failed to mark as collected');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'COLLECTED' || s === 'COMPLETED') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-success/15 text-status-success">Collected</span>;
    }
    if (s === 'READY' || s === 'PRINTED') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent-soft text-accent">Ready for Pickup</span>;
    }
    if (s === 'PRINTING') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-warning/15 text-status-warning animate-pulse">Printing</span>;
    }
    if (s === 'CANCELLED') {
      return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-status-error/15 text-status-error">Cancelled</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-paper text-muted">{status}</span>;
  };

  const canHandover = order && ['READY', 'PRINTED', 'printer_confirmed', 'ready', 'printed', 'completed', 'paid'].includes(order.status) && order.status !== 'COLLECTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-base text-ink font-mono">{order?.reference || orderId}</h2>
                {order && getStatusBadge(order.status)}
              </div>
              <p className="text-xs text-muted">
                {order?.created_at ? new Date(order.created_at).toLocaleString() : 'Loading order...'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {loading && (
            <div className="py-12 text-center text-muted text-sm">
              Loading order information...
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {order && (
            <>
              {/* Customer & Payment Quick Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-paper border border-border space-y-1">
                  <div className="text-xs font-semibold text-muted flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>Customer Details</span>
                  </div>
                  <div className="text-sm font-bold text-ink">
                    {order.customer_name || 'Walk-in Customer'}
                  </div>
                  <div className="text-xs font-mono text-muted flex items-center space-x-1">
                    <Phone className="w-3 h-3" />
                    <span>{order.customer_phone || 'N/A'}</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-paper border border-border space-y-1">
                  <div className="text-xs font-semibold text-muted flex items-center space-x-1.5">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Payment Information</span>
                  </div>
                  <div className="text-sm font-bold text-ink flex items-center justify-between">
                    <span>{formatMoney(order.total_minor ?? 0)}</span>
                    <span className="text-xs uppercase px-2 py-0.5 rounded bg-surface border border-border font-mono text-muted">
                      {order.payment?.provider || 'PAID'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted">
                    Tx: {order.payment?.transaction_id || 'BANK****7766'}
                  </div>
                </div>
              </div>

              {/* Order Files List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider">
                  Documents &amp; Print Options
                </h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-paper/50 overflow-hidden">
                  {order.files?.map((f: any) => (
                    <div key={f.id} className="p-3 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <p className="font-semibold text-ink">{f.file_name}</p>
                        <p className="text-muted">
                          {f.page_count} page(s) • {f.copies} copy • {f.sides_mode} • {f.color_mode}
                        </p>
                      </div>
                      <span className="font-mono text-muted uppercase">{f.paper_size || 'A4'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Granular Vertical Audit Timeline */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-muted uppercase tracking-wider flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('owner:event_timeline')}</span>
                </h3>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {order.events?.map((ev: any, index: number) => (
                    <div key={ev.id || index} className="relative text-xs space-y-0.5">
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-accent ring-4 ring-surface" />
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-ink font-mono">{ev.event_type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted uppercase">
                          {ev.actor || 'system'}
                        </span>
                      </div>
                      <p className="text-muted">{ev.description || 'Status update logged'}</p>
                      <p className="text-[10px] text-muted font-mono">
                        {ev.occurred_at ? new Date(ev.occurred_at).toUTCString() : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-border bg-paper/50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            {order && (
              <button
                onClick={() => onReprintClick(order.id, order.reference)}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-border bg-surface hover:bg-paper text-xs font-semibold text-ink transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 text-status-warning" />
                <span>{t('owner:reprint')}</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {canHandover && (
              <button
                onClick={handleHandover}
                disabled={actionLoading}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-status-success hover:bg-status-success/90 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>{actionLoading ? 'Updating...' : t('owner:mark_collected')}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-paper text-xs font-semibold text-ink transition-colors"
            >
              {t('common:close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;
