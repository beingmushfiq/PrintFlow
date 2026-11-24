import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  RefreshCw,
  AlertTriangle,
  Monitor,
  ShieldAlert,
  Copy,
  Check,
  FolderOpen,
  Terminal,
  Printer,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [pairedAgentName, setPairedAgentName] = useState<string | null>(null);

  const agentDirPath = 'd:\\PrintFlow\\print-agent';
  const pythonCommand = `python d:\\PrintFlow\\print-agent\\run_agent.py --pair ${pairingCode || '<PIN>'}`;
  const batCommand = `d:\\PrintFlow\\print-agent\\run-agent.bat ${pairingCode || '<PIN>'}`;

  const fetchPairingCode = async () => {
    setLoading(true);
    setError(null);
    setPairedAgentName(null);
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

  // Poll for paired agent while modal is open
  useEffect(() => {
    if (!isOpen || pairedAgentName || !pairingCode) return;
    const checkInterval = setInterval(async () => {
      try {
        const res = await apiRequest('/owner/dashboard');
        const count = res.data?.connected_agents ?? res.data?.active_agents_count ?? 0;
        if (count > 0) {
          setPairedAgentName('Counter-WinStation (Online)');
        }
      } catch {
        // ignore polling errors
      }
    }, 4000);
    return () => clearInterval(checkInterval);
  }, [isOpen, pairedAgentName, pairingCode]);

  const handleCopy = (text: string, type: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2500);
    }
  };

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
      <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between shrink-0 bg-surface">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
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

        {/* Scrollable Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-xs flex items-center space-x-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {pairedAgentName && (
            <div className="p-3.5 rounded-xl bg-status-success/10 border border-status-success/30 text-status-success text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-status-success animate-ping" />
                <span className="font-semibold">Agent Connected &amp; Online: {pairedAgentName}</span>
              </div>
              <ShieldCheck className="w-4 h-4 text-status-success" />
            </div>
          )}

          {/* 6-Digit PIN Display Card */}
          <div className="text-center space-y-2">
            <p className="text-xs text-muted">{t('owner:pairing_desc')}</p>
            <div className="py-4 px-6 rounded-2xl bg-paper border border-border text-center relative group">
              {loading ? (
                <div className="flex justify-center py-2">
                  <RefreshCw className="w-7 h-7 text-accent animate-spin" />
                </div>
              ) : isExpired ? (
                <div className="text-status-error font-semibold text-sm flex items-center justify-center space-x-1.5 py-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Code Expired — Click Regenerate PIN below</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <span className="text-4xl font-extrabold tracking-widest text-accent font-mono select-all">
                    {pairingCode || '------'}
                  </span>
                  {pairingCode && (
                    <button
                      onClick={() => handleCopy(pairingCode, 'pin')}
                      title="Copy PIN"
                      className="p-2 rounded-lg bg-surface border border-border text-muted hover:text-accent transition-colors"
                    >
                      {copiedType === 'pin' ? <Check className="w-4 h-4 text-status-success" /> : <Copy className="w-4 h-4" />}
                    </button>
                  )}
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

          {/* Setup Instructions & Location */}
          <div className="bg-paper rounded-xl p-4 border border-border text-xs space-y-3 text-ink/80">
            <div className="flex items-center justify-between">
              <p className="font-bold text-ink">Setup Instructions:</p>
              <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent font-mono text-[10px] font-semibold">
                Windows 10 / 11
              </span>
            </div>

            <ol className="list-decimal list-inside space-y-2 text-muted">
              <li>
                <span className="font-semibold text-ink">Download &amp; run PrintFlow Agent on your counter Windows PC</span>
                <div className="mt-1.5 ml-4 p-2.5 bg-surface rounded-lg border border-border space-y-1.5">
                  <div className="flex items-center justify-between text-muted text-[11px]">
                    <span className="flex items-center space-x-1">
                      <FolderOpen className="w-3.5 h-3.5 text-accent" />
                      <span>Agent Location in Project:</span>
                    </span>
                    <button
                      onClick={() => handleCopy(agentDirPath, 'dir')}
                      className="text-accent hover:underline flex items-center space-x-1 font-mono text-[10px]"
                    >
                      {copiedType === 'dir' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedType === 'dir' ? 'Copied' : 'Copy Path'}</span>
                    </button>
                  </div>
                  <code className="block font-mono text-[11px] text-ink bg-paper p-1.5 rounded border border-border/50 break-all select-all">
                    {agentDirPath}
                  </code>
                </div>
              </li>

              <li>
                <span className="font-semibold text-ink">Run via Terminal or double-click launcher:</span>
                <div className="mt-1.5 ml-4 space-y-2">
                  <div className="p-2.5 bg-surface rounded-lg border border-border space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span className="flex items-center space-x-1">
                        <Terminal className="w-3.5 h-3.5 text-accent" />
                        <span>Command (PowerShell / Command Prompt):</span>
                      </span>
                      <button
                        onClick={() => handleCopy(pythonCommand, 'cmd')}
                        className="text-accent hover:underline flex items-center space-x-1 font-mono text-[10px] font-semibold"
                      >
                        {copiedType === 'cmd' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedType === 'cmd' ? 'Copied!' : 'Copy Command'}</span>
                      </button>
                    </div>
                    <code className="block font-mono text-[11px] text-ink bg-paper p-1.5 rounded border border-border/50 break-all select-all">
                      {pythonCommand}
                    </code>
                  </div>

                  <div className="p-2 bg-surface rounded-lg border border-border text-[11px] flex items-center justify-between">
                    <span className="text-muted">Or double-click:</span>
                    <button
                      onClick={() => handleCopy(batCommand, 'bat')}
                      className="font-mono text-accent hover:underline flex items-center space-x-1 text-[10px]"
                    >
                      {copiedType === 'bat' ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                      <span>run-agent.bat</span>
                    </button>
                  </div>
                </div>
              </li>

              <li>
                <span className="font-semibold text-ink">Right-click tray icon and choose "Pair with Shop"</span>
              </li>
              <li>
                <span className="font-semibold text-ink">Enter the 6-digit PIN above to securely bind the spooler queue</span>
              </li>
            </ol>
          </div>

          {/* Collapsible Info: What Does the Desktop Agent Do? */}
          <div className="border border-border rounded-xl overflow-hidden bg-surface">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="w-full p-3 text-left flex items-center justify-between text-xs font-semibold text-ink hover:bg-paper/50 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Printer className="w-4 h-4 text-accent" />
                <span>What does the PrintFlow Desktop Agent do?</span>
              </div>
              {showExplanation ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
            </button>

            {showExplanation && (
              <div className="p-3.5 border-t border-border bg-paper/30 text-xs text-muted space-y-2 leading-relaxed">
                <p>
                  The <strong className="text-ink">PrintFlow Desktop Agent</strong> runs quietly in your counter Windows PC tray to bridge your local physical printers to the cloud:
                </p>
                <ul className="list-disc list-inside space-y-1 pl-1">
                  <li>
                    <strong className="text-ink">Direct Hardware Spooling:</strong> Connects to local USB &amp; network printers via native Windows <code className="font-mono text-[10px]">winspool.drv</code>.
                  </li>
                  <li>
                    <strong className="text-ink">Zero-Trace Customer Privacy:</strong> Automatically downloads encrypted documents into memory, prints to paper, and immediately performs 2-pass forensic file shredding. No customer files remain on disk.
                  </li>
                  <li>
                    <strong className="text-ink">Duplicate Print Prevention:</strong> Uses a durable embedded SQLite journal to guarantee that network hiccups or restarts never double-print an order.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-paper/50 flex items-center justify-between shrink-0">
          <button
            onClick={fetchPairingCode}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-xs font-semibold text-ink disabled:opacity-50"
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
