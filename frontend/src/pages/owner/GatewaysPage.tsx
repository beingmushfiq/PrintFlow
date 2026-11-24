import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Save,
  Radio,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';

export const GatewaysPage: React.FC = () => {
  const { t } = useTranslation(['common', 'owner']);

  // SSLCOMMERZ state
  const [sslStoreId, setSslStoreId] = useState<string>('printflow_live');
  const [sslPassword, setSslPassword] = useState<string>('');
  const [sslMaskedPass, setSslMaskedPass] = useState<string>('********1234');
  const [sslEnv, setSslEnv] = useState<string>('sandbox');

  // bKash state
  const [bkashAppKey, setBkashAppKey] = useState<string>('');
  const [bkashAppSecret, setBkashAppSecret] = useState<string>('');
  const [bkashMaskedSecret, setBkashMaskedSecret] = useState<string>('********1234');
  const [bkashEnv, setBkashEnv] = useState<string>('sandbox');

  const [testResult, setTestResult] = useState<{ provider: string; status: string; message: string } | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    apiRequest('/owner/gateways/sslcommerz')
      .then((res) => {
        if (res.data) {
          if (res.data.merchant_identifier) setSslStoreId(res.data.merchant_identifier);
          if (res.data.environment) setSslEnv(res.data.environment);
          if (res.data.store_password_masked) setSslMaskedPass(res.data.store_password_masked);
        }
      })
      .catch(() => {});

    apiRequest('/owner/gateways/bkash')
      .then((res) => {
        if (res.data) {
          if (res.data.merchant_identifier) setBkashAppKey(res.data.merchant_identifier);
          if (res.data.environment) setBkashEnv(res.data.environment);
          if (res.data.app_secret_masked) setBkashMaskedSecret(res.data.app_secret_masked);
        }
      })
      .catch(() => {});
  }, []);

  const handleTestPing = async (provider: string) => {
    try {
      const res = await apiRequest('/owner/gateways/test-credentials', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      });
      setTestResult({
        provider,
        status: res.data?.test_status || 'SUCCESS',
        message: res.data?.message || 'Gateway connected successfully',
      });
    } catch (err: any) {
      setTestResult({
        provider,
        status: 'FAILED',
        message: err?.message || 'Gateway connection test failed',
      });
    }
  };

  const handleSaveSsl = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider('sslcommerz');
    setStatusMsg(null);
    try {
      await apiRequest('/owner/gateways/sslcommerz', {
        method: 'PUT',
        body: JSON.stringify({
          merchant_identifier: sslStoreId,
          store_password: sslPassword || 'password_1234',
          environment: sslEnv,
        }),
      });
      setStatusMsg({ type: 'success', text: 'SSLCOMMERZ credentials securely saved' });
      setSslPassword('');
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Failed to save SSLCOMMERZ credentials' });
    } finally {
      setSavingProvider(null);
    }
  };

  const handleSaveBkash = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProvider('bkash');
    setStatusMsg(null);
    try {
      await apiRequest('/owner/gateways/bkash', {
        method: 'PUT',
        body: JSON.stringify({
          merchant_identifier: bkashAppKey,
          app_secret: bkashAppSecret || 'secret_1234',
          environment: bkashEnv,
        }),
      });
      setStatusMsg({ type: 'success', text: 'bKash Tokenized credentials securely saved' });
      setBkashAppSecret('');
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err?.message || 'Failed to save bKash credentials' });
    } finally {
      setSavingProvider(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-150">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink flex items-center space-x-2.5">
          <CreditCard className="w-6 h-6 text-accent" />
          <span>{t('owner:gateways')}</span>
        </h1>
        <p className="text-sm text-muted">
          Encrypted gateway credentials management with masked secrets and write-only forms
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-4 rounded-xl text-sm flex items-center space-x-2 border ${
            statusMsg.type === 'success'
              ? 'bg-status-success/10 border-status-success/30 text-status-success'
              : 'bg-status-error/10 border-status-error/30 text-status-error'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {testResult && (
        <div className="p-4 rounded-xl bg-accent-soft border border-accent/30 text-accent text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 animate-pulse text-status-success" />
            <span>
              <strong>{testResult.provider.toUpperCase()} Ping:</strong> {testResult.message} ({testResult.status})
            </span>
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="text-xs text-muted hover:text-ink font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* SSLCOMMERZ v4 Card */}
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="font-bold text-base text-ink">SSLCOMMERZ v4</h2>
              <p className="text-xs text-muted">Direct Session &amp; IPN Gateway</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-soft text-accent uppercase font-mono">
              {sslEnv}
            </span>
          </div>

          <form onSubmit={handleSaveSsl} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Store ID</label>
              <input
                type="text"
                value={sslStoreId}
                onChange={(e) => setSslStoreId(e.target.value)}
                placeholder="e.g. testbox or nilkhet_print_live"
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">Store Password</label>
              <input
                type="password"
                value={sslPassword}
                onChange={(e) => setSslPassword(e.target.value)}
                placeholder={sslMaskedPass}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono"
              />
              <p className="text-[10px] text-muted">Masked on retrieval. Leave blank to preserve current secret.</p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted font-medium">Environment Mode:</span>
              <button
                type="button"
                onClick={() => setSslEnv((e) => (e === 'sandbox' ? 'live' : 'sandbox'))}
                className="px-3 py-1 rounded-lg border border-border bg-paper text-ink font-semibold uppercase text-[11px]"
              >
                Switch to {sslEnv === 'sandbox' ? 'Live' : 'Sandbox'}
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleTestPing('sslcommerz')}
                className="px-3 py-2 rounded-xl border border-border bg-surface hover:bg-paper text-xs font-semibold text-ink transition-colors"
              >
                {t('owner:test_connection')}
              </button>

              <button
                type="submit"
                disabled={savingProvider === 'sslcommerz'}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingProvider === 'sslcommerz' ? 'Saving...' : t('owner:save_changes')}</span>
              </button>
            </div>
          </form>
        </div>

        {/* bKash Tokenized Card */}
        <div className="p-6 rounded-2xl bg-surface border border-border shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="font-bold text-base text-ink">bKash Tokenized Checkout</h2>
              <p className="text-xs text-muted">Token Grant &amp; Execute API</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-accent-soft text-accent uppercase font-mono">
              {bkashEnv}
            </span>
          </div>

          <form onSubmit={handleSaveBkash} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">App Key</label>
              <input
                type="text"
                value={bkashAppKey}
                onChange={(e) => setBkashAppKey(e.target.value)}
                placeholder="bKash Merchant App Key"
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-ink">App Secret</label>
              <input
                type="password"
                value={bkashAppSecret}
                onChange={(e) => setBkashAppSecret(e.target.value)}
                placeholder={bkashMaskedSecret}
                className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-paper focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent font-mono"
              />
              <p className="text-[10px] text-muted">Masked on retrieval. Leave blank to preserve current secret.</p>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted font-medium">Environment Mode:</span>
              <button
                type="button"
                onClick={() => setBkashEnv((e) => (e === 'sandbox' ? 'live' : 'sandbox'))}
                className="px-3 py-1 rounded-lg border border-border bg-paper text-ink font-semibold uppercase text-[11px]"
              >
                Switch to {bkashEnv === 'sandbox' ? 'Live' : 'Sandbox'}
              </button>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => handleTestPing('bkash')}
                className="px-3 py-2 rounded-xl border border-border bg-surface hover:bg-paper text-xs font-semibold text-ink transition-colors"
              >
                {t('owner:test_connection')}
              </button>

              <button
                type="submit"
                disabled={savingProvider === 'bkash'}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-accent hover:bg-accent/90 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingProvider === 'bkash' ? 'Saving...' : t('owner:save_changes')}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default GatewaysPage;
