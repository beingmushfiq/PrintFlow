import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Printer, RotateCcw } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface ControlledReprintModalProps {
  orderId: string;
  orderReference: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ControlledReprintModal: React.FC<ControlledReprintModalProps> = ({
  orderId,
  orderReference,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation(['common', 'owner']);
  const [reason, setReason] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide a specific justification reason for the reprint.');
      return;
    }
    if (!confirmed) {
      setError('Please confirm that you understand this will send duplicate physical output.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiRequest(`/owner/orders/${orderId}/reprint`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to dispatch reprint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-status-warning/15 text-status-warning flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-ink">{t('owner:reprint')}</h2>
              <p className="text-xs text-muted font-mono">{orderReference}</p>
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Duplicate Warning Banner */}
          <div className="p-4 rounded-xl bg-status-warning/10 border border-status-warning/30 text-xs text-ink/90 space-y-1">
            <div className="flex items-center space-x-2 font-bold text-status-warning">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Duplicate Output Warning</span>
            </div>
            <p className="text-muted leading-relaxed">
              {t('owner:reprint_warning')} Original customer balance will not be charged again.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-xs">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">
              {t('owner:reprint_reason')} <span className="text-status-error">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Paper jam during print, toner smudge on page 2, customer paper tear"
              rows={3}
              required
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
            />
          </div>

          <label className="flex items-start space-x-2.5 cursor-pointer text-xs select-none">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 rounded border-border text-accent focus:ring-accent"
            />
            <span className="text-muted leading-tight">
              I acknowledge that I am authorizing a zero-fee physical reprint on the shop spooler.
            </span>
          </label>

          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-paper text-xs font-semibold text-ink transition-colors"
            >
              {t('common:cancel')}
            </button>

            <button
              type="submit"
              disabled={loading || !confirmed || !reason.trim()}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-status-warning hover:bg-status-warning/90 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : t('owner:reprint_confirm')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ControlledReprintModal;
