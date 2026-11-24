import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Printer,
  Store,
  QrCode,
  Download,
  ExternalLink,
  Save,
  LogOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { PhoneIntake } from '../../components/PhoneIntake';
import { apiRequest, removeAuthToken } from '../../lib/api';

interface ShopDetails {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  public_status: 'active' | 'paused' | 'closed';
  storefront_url: string;
}

export const ShopProfilePage: React.FC = () => {
  const { t } = useTranslation(['common', 'auth']);
  const navigate = useNavigate();

  const [shop, setShop] = useState<ShopDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [publicStatus, setPublicStatus] = useState<'active' | 'paused' | 'closed'>('active');

  useEffect(() => {
    apiRequest<{ shop: ShopDetails }>('/owner/shop')
      .then(res => {
        const s = res.data.shop;
        setShop(s);
        setName(s.name);
        setAddress(s.address || '');
        setPhone(s.phone || '');
        setPublicStatus(s.public_status);
        setError(null);
      })
      .catch(err => {
        if (err.status === 401) {
          removeAuthToken();
          navigate('/login');
        } else {
          setError(err.message || 'Failed to load shop details.');
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || saving) return;

    setSaving(true);
    setSaveSuccess(false);

    try {
      const res = await apiRequest<{ shop: ShopDetails }>('/owner/shop', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          address: address || null,
          phone: phone || null,
          public_status: publicStatus,
        }),
      });

      setShop(res.data.shop);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update shop.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    } finally {
      removeAuthToken();
      navigate('/login');
    }
  };

  const storefrontUrl = shop
    ? `${window.location.origin}/s/${shop.slug}`
    : (shop?.storefront_url || '');

  const copyStorefrontUrl = () => {
    if (!storefrontUrl) return;
    navigator.clipboard.writeText(storefrontUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  const qrBaseUrl = shop?.slug
    ? `/api/v1/public/storefront/${shop.slug}/qr`
    : `/api/v1/owner/shop/qr`;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
      {/* Header */}
      <header className="bg-surface border-b border-border px-6 py-4 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-white shadow-sm">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-ink">PrintFlow Console</h1>
              <p className="text-xs text-muted">Shop Profile &amp; Counter QR Setup</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {shop && (
              <a
                href={storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-paper transition-colors"
              >
                <span>View Storefront</span>
                <ExternalLink className="w-3.5 h-3.5 text-accent" />
              </a>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted hover:text-status-danger hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t('auth:logout', { defaultValue: 'Log Out' })}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-status-danger/20 rounded-xl p-4 flex items-center space-x-2 text-sm text-status-danger">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Shop Profile Settings */}
          <div className="lg:col-span-7 bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center space-x-2">
                <Store className="w-5 h-5 text-accent" />
                <h2 className="text-base font-bold text-ink">Shop Profile</h2>
              </div>
              {saveSuccess && (
                <span className="inline-flex items-center space-x-1 text-xs font-bold text-status-success bg-emerald-50 px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Saved</span>
                </span>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Shop Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="block w-full h-11 px-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Storefront URL Slug
                </label>
                <div className="flex items-center">
                  <span className="inline-flex items-center px-3 h-11 rounded-l-lg border border-r-0 border-border bg-paper text-xs text-muted">
                    /s/
                  </span>
                  <input
                    type="text"
                    disabled
                    value={shop?.slug || ''}
                    className="block w-full h-11 px-3 text-sm rounded-r-lg border border-border bg-paper text-muted cursor-not-allowed font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Physical Address / Counter Location
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 1st Floor, Multiplan Center, Elephant Road, Dhaka"
                  className="block w-full h-11 px-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>

              <PhoneIntake
                value={phone}
                required={false}
                onChange={(val) => setPhone(val)}
              />

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  Public Storefront Status
                </label>
                <select
                  value={publicStatus}
                  onChange={e => setPublicStatus(e.target.value as any)}
                  className="block w-full h-11 px-3 text-sm rounded-lg border border-border bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                >
                  <option value="active">Active (Accepting walk-in uploads)</option>
                  <option value="paused">Paused (Temporarily unavailable)</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full h-11 flex items-center justify-center space-x-2 rounded-xl bg-accent hover:bg-accent/90 text-white font-bold text-sm shadow transition-all cursor-pointer disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Shop Settings</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Right Column: Counter QR Studio */}
          <div className="lg:col-span-5 bg-surface border border-border rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center space-x-2 pb-3 border-b border-border">
              <QrCode className="w-5 h-5 text-accent" />
              <h2 className="text-base font-bold text-ink">Counter QR Studio</h2>
            </div>

            {/* QR Preview Card */}
            <div className="bg-paper border border-border rounded-xl p-4 text-center space-y-3">
              <div className="w-48 h-48 bg-white border border-border rounded-xl p-2 mx-auto flex items-center justify-center shadow-xs">
                <img
                  src={`${qrBaseUrl}?format=png`}
                  alt="Shop Counter QR Code"
                  className="w-44 h-44 object-contain"
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.src.includes('format=svg')) {
                      target.src = `${qrBaseUrl}?format=svg`;
                    }
                  }}
                />
              </div>

              <div className="space-y-1">
                <span className="text-xs font-bold text-ink block truncate">
                  {shop?.name}
                </span>
                <div className="flex items-center justify-center space-x-1 text-[11px] text-muted">
                  <span className="truncate max-w-[200px]">{storefrontUrl}</span>
                  <button
                    onClick={copyStorefrontUrl}
                    className="p-1 hover:text-accent rounded"
                    title="Copy URL"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {copied && <span className="text-[10px] text-status-success font-bold">Copied!</span>}
              </div>
            </div>

            {/* Multi-Format Export Buttons */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-muted block uppercase tracking-wider">
                Export Options
              </span>

              <a
                href={`${qrBaseUrl}?format=pdf&paper=a4`}
                download={`${shop?.slug}-a4-placard.pdf`}
                className="w-full h-11 flex items-center justify-between px-4 rounded-xl border border-border bg-paper hover:bg-paper-dark text-ink font-semibold text-xs shadow-xs transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 text-accent" />
                  <span>Styled A4 Placard (PDF with Bengali/English)</span>
                </div>
                <span className="text-[10px] bg-accent-soft text-accent px-1.5 py-0.5 rounded font-bold">PDF</span>
              </a>

              <a
                href={`${qrBaseUrl}?format=pdf&paper=a5`}
                download={`${shop?.slug}-a5-placard.pdf`}
                className="w-full h-11 flex items-center justify-between px-4 rounded-xl border border-border bg-paper hover:bg-paper-dark text-ink font-semibold text-xs shadow-xs transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Download className="w-4 h-4 text-accent" />
                  <span>Styled A5 Counter Tent (PDF)</span>
                </div>
                <span className="text-[10px] bg-accent-soft text-accent px-1.5 py-0.5 rounded font-bold">PDF</span>
              </a>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <a
                  href={`${qrBaseUrl}?format=png`}
                  download={`${shop?.slug}-qr.png`}
                  className="h-10 flex items-center justify-center space-x-1.5 rounded-lg border border-border bg-paper hover:bg-paper-dark text-ink text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>PNG 300 DPI</span>
                </a>

                <a
                  href={`${qrBaseUrl}?format=svg`}
                  download={`${shop?.slug}-qr.svg`}
                  className="h-10 flex items-center justify-center space-x-1.5 rounded-lg border border-border bg-paper hover:bg-paper-dark text-ink text-xs font-semibold transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-accent" />
                  <span>Vector SVG</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-muted border-t border-border bg-surface">
        <p>PrintFlow • Autonomous Walk-in Print Shop Automation</p>
      </footer>
    </div>
  );
};
