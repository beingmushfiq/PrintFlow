import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ListOrdered,
  Pause,
  Play,
  XCircle,
  Plus,
  RefreshCw,
  Printer,
  AlertCircle,
  Phone,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { AgentPairingModal } from '../../components/owner/AgentPairingModal';

export const QueuePage: React.FC = () => {
  const { t } = useTranslation(['common', 'owner']);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [pairingModalOpen, setPairingModalOpen] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await apiRequest('/owner/queue');
      setQueue(res.data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch active queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 5000); // 5s polling fallback
    return () => clearInterval(interval);
  }, []);

  const handleHold = async (jobId: string) => {
    setActionLoadingId(jobId);
    try {
      await apiRequest(`/owner/jobs/${jobId}/hold`, { method: 'POST' });
      await fetchQueue();
    } catch (err: any) {
      alert(err?.message || 'Failed to hold job');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleResume = async (jobId: string) => {
    setActionLoadingId(jobId);
    try {
      await apiRequest(`/owner/jobs/${jobId}/resume`, { method: 'POST' });
      await fetchQueue();
    } catch (err: any) {
      alert(err?.message || 'Failed to resume job');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancel = async (orderId: string, jobId: string) => {
    const reason = window.prompt('Please enter cancellation reason for this order:');
    if (!reason) return;

    setActionLoadingId(jobId);
    try {
      await apiRequest(`/owner/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await fetchQueue();
    } catch (err: any) {
      alert(err?.message || 'Failed to cancel order');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getBadgeColor = (status: string) => {
    const map: Record<string, string> = {
      queued: 'bg-status-warning/15 text-status-warning border-status-warning/30',
      printing: 'bg-accent/15 text-accent border-accent/30 animate-pulse',
      complete: 'bg-status-success/15 text-status-success border-status-success/30',
      error: 'bg-status-error/15 text-status-error border-status-error/30',
      held: 'bg-paper text-muted border-border',
    };
    return map[status] || 'bg-paper text-muted border-border';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center space-x-2.5">
            <ListOrdered className="w-6 h-6 text-accent" />
            <span>{t('owner:live_queue')}</span>
          </h1>
          <p className="text-sm text-muted">
            Auto-refreshing spooler queue (5s polling fallback with Reverb live events)
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchQueue}
            disabled={loading}
            className="p-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-muted hover:text-ink"
            aria-label="Refresh queue"
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
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Queue Table */}
      <div className="bg-surface border border-border rounded-2xl shadow-xs overflow-hidden">
        {queue.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-paper text-muted mx-auto flex items-center justify-center">
              <Printer className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-ink">{t('owner:queue_empty')}</p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Customer prints submitted via the counter QR code will appear here instantly.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View (< md) */}
            <div className="md:hidden divide-y divide-border">
              {queue.map((job) => {
                const isActing = actionLoadingId === job.job_id;
                const isHeld = job.status === 'held';
                return (
                  <div key={job.job_id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm text-ink truncate">
                          {job.order_reference}
                        </p>
                        <p className="text-xs font-semibold text-ink truncate mt-0.5">
                          {job.file_name}
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider shrink-0 ${getBadgeColor(job.status)}`}>
                        {job.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      <span className="font-mono flex items-center space-x-1 mr-2">
                        <Phone className="w-3 h-3 text-muted/70" />
                        <span>{job.customer_phone_masked}</span>
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink">
                        {job.pages}p • {job.copies}x
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink uppercase">
                        {job.sides_mode}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink uppercase">
                        {job.color_mode}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-1">
                      {isHeld ? (
                        <button
                          onClick={() => handleResume(job.job_id)}
                          disabled={isActing}
                          className="flex-1 inline-flex items-center justify-center space-x-1 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-paper text-status-success text-xs font-semibold transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleHold(job.job_id)}
                          disabled={isActing || job.status === 'printing'}
                          className="flex-1 inline-flex items-center justify-center space-x-1 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-paper text-status-warning text-xs font-semibold transition-colors disabled:opacity-40"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Hold</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCancel(job.order_id, job.job_id)}
                        disabled={isActing}
                        className="flex-1 inline-flex items-center justify-center space-x-1 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-status-error/10 text-status-error text-xs font-semibold transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-paper/60 text-muted font-semibold">
                  <th className="py-3.5 px-4">Order Ref</th>
                  <th className="py-3.5 px-4">Customer Phone</th>
                  <th className="py-3.5 px-4">Document</th>
                  <th className="py-3.5 px-4">Copies &amp; Format</th>
                  <th className="py-3.5 px-4">Spooler Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map((job) => {
                  const isActing = actionLoadingId === job.job_id;
                  const isHeld = job.status === 'held';

                  return (
                    <tr key={job.job_id} className="hover:bg-paper/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-ink">
                        {job.order_reference}
                      </td>

                      <td className="py-3.5 px-4 text-muted font-mono">
                        <span className="flex items-center space-x-1">
                          <Phone className="w-3 h-3 text-muted/70" />
                          <span>{job.customer_phone_masked}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-ink max-w-[180px] truncate">{job.file_name}</p>
                          <p className="text-[11px] text-muted">{job.pages} page(s)</p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                          <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink">
                            {job.copies}x
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink uppercase">
                            {job.sides_mode}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-paper border border-border text-[10px] font-semibold text-ink uppercase">
                            {job.color_mode}
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getBadgeColor(job.status)}`}>
                          {job.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right space-x-2">
                        {isHeld ? (
                          <button
                            onClick={() => handleResume(job.job_id)}
                            disabled={isActing}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-paper text-status-success text-xs font-semibold transition-colors"
                            title="Resume job"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Resume</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleHold(job.job_id)}
                            disabled={isActing || job.status === 'printing'}
                            className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-paper text-status-warning text-xs font-semibold transition-colors disabled:opacity-40"
                            title="Hold job"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            <span>Hold</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleCancel(job.order_id, job.job_id)}
                          disabled={isActing || job.status === 'printing'}
                          className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-border bg-surface hover:bg-status-error/10 text-status-error text-xs font-semibold transition-colors disabled:opacity-40"
                          title="Cancel order"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <AgentPairingModal isOpen={pairingModalOpen} onClose={() => setPairingModalOpen(false)} />
    </div>
  );
};

export default QueuePage;
