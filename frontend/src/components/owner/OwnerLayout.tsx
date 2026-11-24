import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Printer,
  LayoutDashboard,
  ListOrdered,
  FileText,
  DollarSign,
  CreditCard,
  QrCode,
  LogOut,
  Globe,
  Radio,
  Menu,
  X,
} from 'lucide-react';
import { Logo } from '../common/Logo';
import { usePageTitle } from '../../hooks/usePageTitle';
import { getAuthToken, removeAuthToken, apiRequest } from '../../lib/api';

export const OwnerLayout: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'owner']);
  usePageTitle({ subtitle: 'Owner Console' });
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [agentOnline, setAgentOnline] = useState<boolean>(true);
  const [shopName, setShopName] = useState<string>('PrintFlow Counter');

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    apiRequest('/owner/shop')
      .then((res) => {
        if (res.data?.shop?.name) {
          setShopName(res.data.shop.name);
        }
      })
      .catch(() => {});

    apiRequest('/owner/dashboard/metrics')
      .then((res) => {
        if (res.data) {
          setAgentOnline((res.data.connected_agents_count ?? 0) > 0);
        }
      })
      .catch(() => {});
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      removeAuthToken();
      navigate('/login', { replace: true });
    }
  };

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('bn') ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
  };

  const isBengali = i18n.language.startsWith('bn');

  const navItems = [
    { path: '/owner/dashboard', label: t('owner:dashboard'), icon: LayoutDashboard },
    { path: '/owner/queue', label: t('owner:live_queue'), icon: ListOrdered },
    { path: '/owner/orders', label: t('owner:orders'), icon: FileText },
    { path: '/owner/printers', label: t('owner:printers'), icon: Printer },
    { path: '/owner/pricing', label: t('owner:pricing'), icon: DollarSign },
    { path: '/owner/gateways', label: t('owner:gateways'), icon: CreditCard },
    { path: '/owner/shop', label: t('owner:qr_studio'), icon: QrCode },
  ];

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col md:flex-row">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-surface shrink-0">
        <div className="p-5 border-b border-border flex items-center space-x-3">
          <Logo variant="mark" size="md" />
          <div className="min-w-0">
            <h1 className="font-bold text-base leading-tight text-ink truncate">{shopName}</h1>
            <p className="text-xs text-muted">Owner Operations</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                  active
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-ink/80 hover:bg-paper hover:text-ink'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-muted'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-paper">
            <span className="flex items-center space-x-2 text-muted">
              <Radio className={`w-3.5 h-3.5 ${agentOnline ? 'text-status-success animate-pulse' : 'text-status-error'}`} />
              <span>Agent</span>
            </span>
            <span
              className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                agentOnline ? 'bg-status-success/15 text-status-success' : 'bg-status-error/15 text-status-error'
              }`}
            >
              {agentOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-xl text-sm font-medium text-status-error hover:bg-status-error/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('auth:logout')}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-surface px-4 md:px-6 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg border border-border bg-paper text-ink"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="hidden md:block text-sm font-semibold text-ink">
              {navItems.find((n) => location.pathname.startsWith(n.path))?.label ?? t('owner:dashboard')}
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-border bg-paper hover:bg-paper-dark transition-colors text-xs font-medium"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5 text-accent" />
              <span>{isBengali ? 'English' : 'বাংলা'}</span>
            </button>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-surface p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm ${
                    active ? 'bg-accent text-white' : 'text-ink hover:bg-paper'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-sm font-medium text-status-error hover:bg-status-error/10"
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth:logout')}</span>
            </button>
          </div>
        )}

        {/* Page Content Outlet */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default OwnerLayout;
