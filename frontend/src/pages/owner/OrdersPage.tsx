import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  Search,
  Filter,
  Eye,
  Hand,
  RotateCcw,
  RefreshCw,
  Phone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { OrderDetailModal } from '../../components/owner/OrderDetailModal';
import { ControlledReprintModal } from '../../components/owner/ControlledReprintModal';

export const OrdersPage: React.FC = () => {
  const { t } = useTranslation(['common', 'owner']);
  const [orders, setOrders] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, total_pages: 1, total: 0 });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Modals state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [reprintOrder, setReprintOrder] = useState<{ id: string; ref: string } | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      params.append('page', String(page));
      params.append('per_page', '15');

      const res = await apiRequest(`/owner/orders?${params.toString()}`);
      setOrders(res.data || []);
      setMeta(res.meta || {});
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchOrders();
  };

  const handleHandover = async (orderId: string) => {
    try {
      await apiRequest(`/owner/orders/${orderId}/handover`, { method: 'POST' });
      await fetchOrders();
    } catch (err: any) {
      alert(err?.message || 'Handover failed');
    }
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'COLLECTED') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-status-success/15 text-status-success uppercase">Collected</span>;
    }
    if (s === 'READY' || s === 'PRINTED') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-soft text-accent uppercase">Ready</span>;
    }
    if (s === 'PRINTING') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-status-warning/15 text-status-warning uppercase animate-pulse">Printing</span>;
    }
    if (s === 'PAID') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-accent-soft text-accent uppercase">Paid</span>;
    }
    if (s === 'CANCELLED') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-status-error/15 text-status-error uppercase">Cancelled</span>;
    }
    return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-paper text-muted uppercase">{status}</span>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center space-x-2.5">
          <FileText className="w-6 h-6 text-accent" />
          <span>{t('owner:orders')}</span>
        </h1>
        <p className="text-sm text-muted">
          Filter and manage customer print receipts, handovers, and reprint dispatches
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-2xl bg-surface border border-border shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('owner:search_orders')}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </form>

        <div className="flex items-center space-x-2 w-full md:w-auto">
          <div className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-border bg-paper text-xs text-muted">
            <Filter className="w-3.5 h-3.5" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent focus:outline-none text-ink font-medium cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="printing">Printing</option>
              <option value="READY">Ready</option>
              <option value="COLLECTED">Collected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <button
            onClick={fetchOrders}
            className="p-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-muted hover:text-ink"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Orders Ledger Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
        {orders.length === 0 ? (
          <div className="p-12 text-center text-muted text-xs">
            No matching orders found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-paper/60 text-muted font-semibold">
                  <th className="py-3.5 px-4">Order Ref</th>
                  <th className="py-3.5 px-4">Customer Phone</th>
                  <th className="py-3.5 px-4">Total Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-paper/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-ink">
                      {o.reference || o.public_reference}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-muted">
                      <span className="flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-muted/70" />
                        <span>{o.customer_phone_masked || o.customer_phone}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 font-bold text-ink">
                      {formatMoney(o.total_minor ?? o.total_poisha ?? 0)}
                    </td>

                    <td className="py-3.5 px-4">
                      {getStatusBadge(o.status)}
                    </td>

                    <td className="py-3.5 px-4 text-muted text-[11px]">
                      {o.created_at ? new Date(o.created_at).toLocaleDateString() : 'N/A'}
                    </td>

                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setDetailModalOpen(true);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-paper text-ink text-xs font-medium transition-colors"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted" />
                        <span>View</span>
                      </button>

                      {['READY', 'PRINTED', 'printer_confirmed', 'paid', 'completed'].includes(o.status) && o.status !== 'COLLECTED' && (
                        <button
                          onClick={() => handleHandover(o.id)}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-status-success/10 text-status-success text-xs font-medium transition-colors"
                          title="Mark collected"
                        >
                          <Hand className="w-3.5 h-3.5" />
                          <span>Handover</span>
                        </button>
                      )}

                      <button
                        onClick={() => setReprintOrder({ id: o.id, ref: o.reference || o.public_reference })}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-paper text-status-warning text-xs font-medium transition-colors"
                        title="Controlled reprint"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reprint</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="p-3 border-t border-border bg-paper/50 flex items-center justify-between text-xs text-muted">
            <span>
              Page {meta.current_page} of {meta.total_pages} ({meta.total} orders)
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-paper disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))}
                disabled={page >= meta.total_pages}
                className="p-1.5 rounded-lg border border-border bg-surface hover:bg-paper disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <OrderDetailModal
        orderId={selectedOrderId}
        isOpen={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        onReprintClick={(id, ref) => {
          setDetailModalOpen(false);
          setReprintOrder({ id, ref });
        }}
        onHandoverSuccess={fetchOrders}
      />

      {reprintOrder && (
        <ControlledReprintModal
          orderId={reprintOrder.id}
          orderReference={reprintOrder.ref}
          isOpen={true}
          onClose={() => setReprintOrder(null)}
          onSuccess={fetchOrders}
        />
      )}
    </div>
  );
};

export default OrdersPage;
