import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, RefreshCw, AlertTriangle, Monitor, ShieldAlert } from 'lucide-react';
import { apiRequest } from '../../lib/api';

interface AgentPairingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgentPairingModal: React.FC<AgentPairingModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation(['common', 'owner']);
  const [pairingCode, setPairingCode] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPairingCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/owner/agents/pairing-code', {
        method: 'POST',
        body: JSON.stringify({ device_name: 'Counter-WinStation' }),
      });
      if (res.data?.pairing_code) {
        setPairingCode(res.data.pairing_code);
        setSecondsRemaining(res.data.expires_in_seconds ?? 300);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to generate pairing code');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPairingCode();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, secondsRemaining]);

  const handleRevoke = async () => {
    try {
      await apiRequest('/owner/agents/pairing-code', { method: 'DELETE' });
    } catch {
      // ignore
    } finally {
      onClose();
    }
  };

  if (!isOpen) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isExpired = secondsRemaining <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 backdrop-blur-xs">
      <div className="bg-surface border border-border rounded-2xl shadow-xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-ink">{t('owner:pair_agent')}</h2>
              <p className="text-xs text-muted">Windows 10/11 Desktop Agent</p>
            </div>
          </div>
          <button
            onClick={handleRevoke}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-xs flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-xs text-muted">{t('owner:pairing_desc')}</p>
            <div className="py-4 px-6 rounded-2xl bg-paper border border-border text-center">
              {loading ? (
                <div className="flex justify-center py-2">
                  <RefreshCw className="w-6 h-6 text-accent animate-spin" />
                </div>
              ) : isExpired ? (
                <div className="text-status-error font-semibold text-sm flex items-center justify-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Code Expired</span>
                </div>
              ) : (
                <div className="text-4xl font-extrabold tracking-widest text-accent font-mono">
                  {pairingCode || '------'}
                </div>
              )}
            </div>

            <div className="flex items-center justify-center space-x-2 text-xs">
              <span className="text-muted">{t('owner:expires_in')}:</span>
              <span className={`font-mono font-bold ${isExpired ? 'text-status-error' : 'text-ink'}`}>
                {timeFormatted}
              </span>
            </div>
          </div>

          <div className="bg-paper rounded-xl p-4 border border-border text-xs space-y-2 text-ink/80">
            <p className="font-semibold text-ink">Setup Instructions:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted">
              <li>Download &amp; run PrintFlow Agent on your counter Windows PC</li>
              <li>Right-click tray icon and choose "Pair with Shop"</li>
              <li>Enter the 6-digit PIN above to securely bind the spooler queue</li>
            </ol>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-paper/50 flex items-center justify-between">
          <button
            onClick={fetchPairingCode}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-xs font-semibold text-ink"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Regenerate PIN</span>
          </button>

          <button
            onClick={handleRevoke}
            className="px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            {t('common:close')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentPairingModal;
