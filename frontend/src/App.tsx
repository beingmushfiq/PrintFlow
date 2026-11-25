import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Globe, ArrowRight, Store, LogIn, UserPlus } from 'lucide-react';
import { Logo } from './components/common/Logo';
import { usePageTitle } from './hooks/usePageTitle';
import { StorefrontPage } from './pages/customer/StorefrontPage';
import { OrderStatusPage } from './pages/customer/OrderStatusPage';
import { OrderReceiptPage } from './pages/customer/OrderReceiptPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterOwnerPage } from './pages/auth/RegisterOwnerPage';
import { OwnerLayout } from './components/owner/OwnerLayout';
import { DashboardPage } from './pages/owner/DashboardPage';
import { QueuePage } from './pages/owner/QueuePage';
import { OrdersPage } from './pages/owner/OrdersPage';
import { PrintersPage } from './pages/owner/PrintersPage';
import { PricingPage } from './pages/owner/PricingPage';
import { GatewaysPage } from './pages/owner/GatewaysPage';
import { ShopProfilePage } from './pages/owner/ShopProfilePage';

export const LandingHome: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'storefront']);
  usePageTitle();

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('bn') ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
  };

  const isBengali = i18n.language.startsWith('bn');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-border bg-surface px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <Logo variant="mark" size="md" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">
              {t('common:app_name')}
            </h1>
            <p className="text-xs text-muted">
              {t('common:tagline')}
            </p>
          </div>
        </div>

        <button
          onClick={toggleLanguage}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-md border border-border bg-paper hover:bg-paper-dark transition-colors text-sm font-medium"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4 text-accent" />
          <span>{isBengali ? 'English' : 'বাংলা'}</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-8 flex flex-col justify-center">
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm space-y-6 text-center max-w-2xl mx-auto">
          <div className="space-y-2">
            <p className="text-sm font-bold uppercase tracking-wider text-accent">
              {t('common:hero_heading')}
            </p>
            <h2 className="text-3xl font-extrabold text-ink tracking-tight">
              {t('common:hero_title')}
            </h2>
          </div>

          <p className="text-sm text-muted max-w-lg mx-auto">
            {t('common:hero_subtitle')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <Link
              to="/s/printflow-main"
              className="flex items-center justify-between p-4 rounded-xl border border-accent bg-accent text-white font-bold text-sm shadow hover:bg-accent/90 transition-all"
            >
              <div className="flex items-center space-x-3">
                <Store className="w-5 h-5" />
                <span className="text-left">{t('common:customer_point')}</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              to="/owner/shop"
              className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface text-ink font-bold text-sm shadow-sm hover:border-accent transition-all"
            >
              <div className="flex items-center space-x-3">
                <LogIn className="w-5 h-5 text-accent" />
                <span className="text-left">{t('common:owner_console_qr')}</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted" />
            </Link>
          </div>

          <div className="pt-4 border-t border-border/60 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-border bg-paper hover:bg-surface hover:border-accent text-ink font-semibold text-xs transition-all shadow-xs"
            >
              <LogIn className="w-3.5 h-3.5 text-accent" />
              <span>{t('common:owner_login')}</span>
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-border bg-paper hover:bg-surface hover:border-accent text-ink font-semibold text-xs transition-all shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5 text-accent" />
              <span>{t('common:register_new_shop')}</span>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface px-6 py-4 text-center text-xs text-muted">
        <p>{t('common:footer_copyright')}</p>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingHome />} />
        <Route path="/s/:slug" element={<StorefrontPage />} />
        <Route path="/order/:token" element={<OrderStatusPage />} />
        <Route path="/order/:token/receipt" element={<OrderReceiptPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterOwnerPage />} />
        
        {/* Owner Operations Console */}
        <Route path="/owner" element={<OwnerLayout />}>
          <Route index element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="queue" element={<QueuePage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="printers" element={<PrintersPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="gateways" element={<GatewaysPage />} />
          <Route path="shop" element={<ShopProfilePage />} />
        </Route>

        {/* Feature 66: Standalone Single-Tenant Lockdown */}
        {/* Guard platform and SaaS routes in standalone mode, redirecting to /owner */}
        <Route path="/platform" element={<Navigate to="/owner" replace />} />
        <Route path="/platform/*" element={<Navigate to="/owner" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
