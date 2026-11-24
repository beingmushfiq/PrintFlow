import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Printer,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  Layers,
  Palette,
  FileCheck,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

export const PrintersPage: React.FC = () => {
  const { t } = useTranslation(['common', 'owner']);
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPrinters = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/owner/printers');
      setPrinters(res.data || []);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch printers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrinters();
  }, []);

  const handleSetDefault = async (printerId: string) => {
    setActionLoadingId(printerId);
    try {
      await apiRequest(`/owner/printers/${printerId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_default: true }),
      });
      await fetchPrinters();
    } catch (err: any) {
      alert(err?.message || 'Failed to set default printer');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleStatus = async (printer: any) => {
    if (printer.is_default && printer.is_active) {
      alert(t('owner:cannot_disable_default'));
      return;
    }

    setActionLoadingId(printer.id);
    try {
      await apiRequest(`/owner/printers/${printer.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !printer.is_active }),
      });
      await fetchPrinters();
    } catch (err: any) {
      alert(err?.message || 'Failed to change printer status');
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center space-x-2.5">
            <Printer className="w-6 h-6 text-accent" />
            <span>{t('owner:printers')}</span>
          </h1>
          <p className="text-sm text-muted">
            Manage local Windows Win32 spooler devices, default routing, and duplex/color capability sync
          </p>
        </div>

        <button
          onClick={fetchPrinters}
          disabled={loading}
          className="p-2 rounded-xl border border-border bg-surface hover:bg-paper transition-colors text-muted hover:text-ink self-start sm:self-auto"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-status-error/10 border border-status-error/30 text-status-error text-sm flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Fleet Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {printers.map((p) => {
          const isActing = actionLoadingId === p.id;
          const caps = p.capabilities || {};

          return (
            <div
              key={p.id}
              className={`p-6 rounded-2xl bg-surface border transition-all space-y-4 shadow-xs ${
                p.is_default ? 'border-accent ring-2 ring-accent/15' : 'border-border'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-base text-ink">{p.name}</h3>
                    {p.is_default && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent text-white uppercase tracking-wider">
                        Default Spooler
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted font-mono">{p.driver_name || 'Generic / Text Only'}</p>
                </div>

                <button
                  onClick={() => handleToggleStatus(p)}
                  disabled={isActing}
                  className={`p-2 rounded-xl border transition-colors ${
                    p.is_active
                      ? 'border-status-success/30 bg-status-success/10 text-status-success'
                      : 'border-status-error/30 bg-status-error/10 text-status-error'
                  }`}
                  title={p.is_active ? 'Disable Printer' : 'Enable Printer'}
                >
                  <Power className="w-4 h-4" />
                </button>
              </div>

              {/* Capability Tags */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div className="p-2.5 rounded-xl bg-paper border border-border flex items-center space-x-2">
                  <Palette className="w-4 h-4 text-muted shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted block">Color Engine</span>
                    <span className="font-semibold text-ink">
                      {caps.color ? 'Full Color (CMYK)' : 'Monochrome'}
                    </span>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-paper border border-border flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-muted shrink-0" />
                  <div>
                    <span className="text-[10px] text-muted block">Duplex Unit</span>
                    <span className="font-semibold text-ink">
                      {caps.duplex ? 'Hardware Duplex' : 'Manual / Simplex'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tray & Paper sizes */}
              <div className="text-xs text-muted flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1.5">
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Sizes: {(caps.paper_sizes || ['A4']).join(', ')}</span>
                </div>
                <div className="font-mono text-[11px]">
                  Tray 1: {caps.trays?.tray_1 || 'A4'} • Tray 2: {caps.trays?.tray_2 || 'Legal'}
                </div>
              </div>

              {/* Footer actions */}
              <div className="pt-2 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted">
                  Status: <strong className="text-ink uppercase">{p.status}</strong>
                </span>

                {!p.is_default && (
                  <button
                    onClick={() => handleSetDefault(p.id)}
                    disabled={isActing}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-border bg-paper hover:bg-surface text-ink text-xs font-semibold transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                    <span>{t('owner:set_as_default')}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PrintersPage;
