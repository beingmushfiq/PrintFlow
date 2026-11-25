import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Logo } from '../common/Logo';
import { DevCenterPointBadge } from '../common/DevCenterPointBadge';
import { useSmoothScroll } from '../common/SmoothScrollProvider';
import { MotionPage } from '../common/MotionPrimitives';
import { usePageTitle } from '../../hooks/usePageTitle';
import { getAuthToken, removeAuthToken, apiRequest } from '../../lib/api';

const SIDEBAR_STORAGE_KEY = 'printflow_sidebar_collapsed';

export const OwnerLayout: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'owner', 'auth']);
  usePageTitle({ subtitle: 'Owner Console' });
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
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

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const { stopScroll, startScroll } = useSmoothScroll();

  useEffect(() => {
    if (mobileMenuOpen) {
      stopScroll();
    } else {
      startScroll();
    }
    return () => startScroll();
  }, [mobileMenuOpen, stopScroll, startScroll]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

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

  const activeTitle =
    navItems.find((n) => location.pathname.startsWith(n.path))?.label ?? t('owner:dashboard');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col md:flex-row">
      {/* Collapsible Sidebar for Desktop */}
      <aside
        className={`hidden md:flex flex-col border-r border-border bg-surface shrink-0 transition-all duration-200 ease-in-out ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div
          className={`h-16 border-b border-border flex items-center shrink-0 ${
            sidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <div className="flex items-center space-x-3 min-w-0">
            <Logo variant="mark" size={sidebarCollapsed ? 'sm' : 'md'} />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <h1 className="font-bold text-sm leading-tight text-ink truncate">{shopName}</h1>
                <p className="text-[11px] text-muted truncate">{t('owner:owner_operations')}</p>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper transition-colors shrink-0"
              aria-label={t('owner:collapse_sidebar')}
              title={t('owner:collapse_sidebar')}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {sidebarCollapsed && (
          <div className="pt-2 px-2 flex justify-center">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="w-full flex items-center justify-center p-2 rounded-xl text-muted hover:text-ink hover:bg-paper transition-colors"
              aria-label={t('owner:expand_sidebar')}
              title={t('owner:expand_sidebar')}
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          <LayoutGroup id="desktop-owner-nav">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={sidebarCollapsed ? item.label : undefined}
                  className={`relative flex items-center rounded-xl font-medium text-sm transition-colors ${
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'space-x-3 px-3 py-2.5'
                  } ${
                    active ? 'text-white' : 'text-ink/80 hover:bg-paper hover:text-ink'
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="owner-active-nav"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-xl bg-accent shadow-sm"
                      aria-hidden="true"
                    />
                  )}
                  <Icon className={`w-4 h-4 shrink-0 relative z-10 ${active ? 'text-white' : 'text-muted'}`} />
                  {!sidebarCollapsed && <span className="truncate relative z-10">{item.label}</span>}
                </Link>
              );
            })}
          </LayoutGroup>
        </nav>

        <div className="p-3 border-t border-border space-y-2.5">
          <div
            title={`${t('owner:agent_label')}: ${agentOnline ? t('owner:online') : t('owner:offline')}`}
            className={`flex items-center text-xs px-2.5 py-2 rounded-lg bg-paper ${
              sidebarCollapsed ? 'justify-center' : 'justify-between'
            }`}
          >
            <span className="flex items-center space-x-2 text-muted">
              <Radio
                className={`w-3.5 h-3.5 shrink-0 ${
                  agentOnline ? 'text-status-success animate-pulse' : 'text-status-error'
                }`}
              />
              {!sidebarCollapsed && <span>{t('owner:agent_label')}</span>}
            </span>
            {!sidebarCollapsed && (
              <span
                className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                  agentOnline
                    ? 'bg-status-success/15 text-status-success'
                    : 'bg-status-error/15 text-status-error'
                }`}
              >
                {agentOnline ? t('owner:online') : t('owner:offline')}
              </span>
            )}
          </div>

          <button
            onClick={handleLogout}
            title={sidebarCollapsed ? t('auth:logout') : undefined}
            className={`w-full flex items-center justify-center rounded-xl text-sm font-medium text-status-error hover:bg-status-error/10 transition-colors ${
              sidebarCollapsed ? 'p-2.5' : 'space-x-2 px-3 py-2'
            }`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span>{t('auth:logout')}</span>}
          </button>

          {sidebarCollapsed ? (
            <div className="pt-1 flex justify-center">
              <DevCenterPointBadge variant="icon" />
            </div>
          ) : (
            <div className="pt-1 flex justify-center">
              <DevCenterPointBadge variant="sidebar" />
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-surface px-4 md:px-6 flex items-center justify-between gap-3 shrink-0 shadow-sm sticky top-0 z-30">
          <div className="flex items-center space-x-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg border border-border bg-paper text-ink hover:bg-paper-dark transition-colors shrink-0"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="md:hidden flex items-center space-x-2 min-w-0">
              <Logo variant="mark" size="xs" />
              <span className="text-sm font-bold text-ink truncate">{activeTitle}</span>
            </div>
            <div className="hidden md:block text-sm font-semibold text-ink truncate">
              {activeTitle}
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            <span
              className={`md:hidden inline-flex items-center space-x-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                agentOnline
                  ? 'bg-status-success/15 text-status-success'
                  : 'bg-status-error/15 text-status-error'
              }`}
            >
              <Radio className="w-3 h-3" />
              <span>{agentOnline ? t('owner:online') : t('owner:offline')}</span>
            </span>

            <button
              onClick={toggleLanguage}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 rounded-lg border border-border bg-paper hover:bg-paper-dark transition-colors text-xs font-medium"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5 text-accent" />
              <span>{isBengali ? 'English' : 'বাংলা'}</span>
            </button>
          </div>
        </header>

        {/* Slide-Over Mobile Navigation Drawer */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden flex">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-ink/50 backdrop-blur-xs"
                onClick={() => setMobileMenuOpen(false)}
                aria-hidden="true"
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 360, damping: 34 }}
                data-lenis-prevent
                className="relative w-72 max-w-[85vw] bg-surface border-r border-border h-full flex flex-col shadow-2xl"
              >
              <div className="h-16 px-4 border-b border-border flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <Logo variant="mark" size="sm" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-ink truncate">{shopName}</p>
                    <p className="text-[11px] text-muted truncate">{t('owner:owner_operations')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                        active ? 'bg-accent text-white shadow-sm' : 'text-ink hover:bg-paper'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-muted'}`} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-border space-y-3 shrink-0">
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-paper">
                  <span className="flex items-center space-x-2 text-muted">
                    <Radio
                      className={`w-3.5 h-3.5 ${
                        agentOnline ? 'text-status-success animate-pulse' : 'text-status-error'
                      }`}
                    />
                    <span>{t('owner:agent_label')}</span>
                  </span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                      agentOnline
                        ? 'bg-status-success/15 text-status-success'
                        : 'bg-status-error/15 text-status-error'
                    }`}
                  >
                    {agentOnline ? t('owner:online') : t('owner:offline')}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl text-sm font-medium text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{t('auth:logout')}</span>
                </button>

                <div className="flex justify-center pt-1">
                  <DevCenterPointBadge variant="sidebar" />
                </div>
              </div>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Page Content Outlet */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto flex flex-col justify-between gap-8">
          <div className="min-w-0">
            <AnimatePresence mode="wait">
              <MotionPage key={location.pathname}>
                <Outlet />
              </MotionPage>
            </AnimatePresence>
          </div>
          <footer className="pt-4 border-t border-border/60 text-center">
            <DevCenterPointBadge variant="footer" />
          </footer>
        </main>
      </div>
    </div>
  );
};

export default OwnerLayout;
