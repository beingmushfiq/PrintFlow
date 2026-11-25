import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, MotionConfig } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Globe, ArrowRight, Store, LogIn, UserPlus, ChevronDown } from 'lucide-react';
import { Logo } from './components/common/Logo';
import { DevCenterPointBadge } from './components/common/DevCenterPointBadge';
import { SmoothScrollProvider } from './components/common/SmoothScrollProvider';
import { PageSkeleton } from './components/common/PageSkeleton';
import { usePageTitle } from './hooks/usePageTitle';
import { apiRequest } from './lib/api';

gsap.registerPlugin(useGSAP);

// Lazy-loaded feature routes for fast initial paint & clean bundle splitting
const StorefrontPage = lazy(() =>
  import('./pages/customer/StorefrontPage').then((m) => ({ default: m.StorefrontPage }))
);
const OrderStatusPage = lazy(() =>
  import('./pages/customer/OrderStatusPage').then((m) => ({ default: m.OrderStatusPage }))
);
const OrderReceiptPage = lazy(() =>
  import('./pages/customer/OrderReceiptPage').then((m) => ({ default: m.OrderReceiptPage }))
);
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const RegisterOwnerPage = lazy(() =>
  import('./pages/auth/RegisterOwnerPage').then((m) => ({ default: m.RegisterOwnerPage }))
);
const OwnerLayout = lazy(() =>
  import('./components/owner/OwnerLayout').then((m) => ({ default: m.OwnerLayout }))
);
const DashboardPage = lazy(() =>
  import('./pages/owner/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const QueuePage = lazy(() =>
  import('./pages/owner/QueuePage').then((m) => ({ default: m.QueuePage }))
);
const OrdersPage = lazy(() =>
  import('./pages/owner/OrdersPage').then((m) => ({ default: m.OrdersPage }))
);
const PrintersPage = lazy(() =>
  import('./pages/owner/PrintersPage').then((m) => ({ default: m.PrintersPage }))
);
const PricingPage = lazy(() =>
  import('./pages/owner/PricingPage').then((m) => ({ default: m.PricingPage }))
);
const GatewaysPage = lazy(() =>
  import('./pages/owner/GatewaysPage').then((m) => ({ default: m.GatewaysPage }))
);
const ShopProfilePage = lazy(() =>
  import('./pages/owner/ShopProfilePage').then((m) => ({ default: m.ShopProfilePage }))
);

interface PublicShopSummary {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
}

export const LandingHome: React.FC = () => {
  const { t, i18n } = useTranslation(['common', 'storefront']);
  usePageTitle();
  const [shops, setShops] = useState<PublicShopSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('printflow-main');
  const heroContainerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const isJsdom =
        typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('jsdom');
      if (isJsdom) return;

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero-stagger', {
          y: 16,
          opacity: 0,
          duration: 0.45,
          stagger: 0.06,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        });
      });

      return () => mm.revert();
    },
    { scope: heroContainerRef }
  );

  useEffect(() => {
    let active = true;
    apiRequest<{ shops: PublicShopSummary[] }>('/public/shops')
      .then((res) => {
        if (!active || !res.data?.shops?.length) return;
        const list = res.data.shops;
        setShops(list);
        const hasDefault = list.some((s) => s.slug === 'printflow-main');
        setSelectedSlug(hasDefault ? 'printflow-main' : list[0].slug);
      })
      .catch(() => {
        // Fallback silently to default printflow-main
      });
    return () => {
      active = false;
    };
  }, []);

  const toggleLanguage = () => {
    const nextLang = i18n.language.startsWith('bn') ? 'en' : 'bn';
    i18n.changeLanguage(nextLang);
  };

  const isBengali = i18n.language.startsWith('bn');

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-border bg-surface/95 backdrop-blur px-4 sm:px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center space-x-3 min-w-0">
          <Logo variant="mark" size="md" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-ink truncate">
              {t('common:app_name')}
            </h1>
            <p className="text-xs text-muted truncate">
              {t('common:tagline')}
            </p>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={toggleLanguage}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-md border border-border bg-paper hover:bg-paper-dark transition-colors text-sm font-medium shrink-0"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4 text-accent" />
          <span>{isBengali ? 'English' : 'বাংলা'}</span>
        </motion.button>
      </header>

      {/* Main Content */}
      <main
        ref={heroContainerRef}
        className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-8 flex flex-col justify-center"
      >
        <div className="bg-surface border border-border rounded-2xl p-6 sm:p-8 shadow-sm space-y-6 text-center max-w-2xl w-full mx-auto">
          <div className="hero-stagger space-y-2">
            <p className="text-sm font-bold uppercase tracking-wider text-accent">
              {t('common:hero_heading')}
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {t('common:hero_title')}
            </h2>
          </div>

          <p className="hero-stagger text-sm text-muted max-w-lg mx-auto">
            {t('common:hero_subtitle')}
          </p>

          {shops.length > 1 && (
            <div className="hero-stagger max-w-sm mx-auto text-left space-y-1.5">
              <label htmlFor="landing-shop-select" className="block text-xs font-semibold text-muted">
                {t('common:select_shop')}
              </label>
              <div className="relative">
                <select
                  id="landing-shop-select"
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="w-full h-10 pl-3 pr-9 text-xs font-semibold rounded-lg border border-border bg-paper text-ink appearance-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent cursor-pointer"
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.name}{s.address ? ` — ${s.address}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="hero-stagger grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ type: 'spring', stiffness: 450, damping: 30 }}>
              <Link
                to={`/s/${selectedSlug}`}
                className="flex items-center justify-between p-4 rounded-xl border border-accent bg-accent text-white font-bold text-sm shadow hover:bg-accent/90 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <Store className="w-5 h-5 shrink-0" />
                  <span className="text-left">{t('common:customer_point')}</span>
                </div>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </Link>
            </motion.div>

            <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.985 }} transition={{ type: 'spring', stiffness: 450, damping: 30 }}>
              <Link
                to="/owner/shop"
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface text-ink font-bold text-sm shadow-sm hover:border-accent transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <LogIn className="w-5 h-5 text-accent shrink-0" />
                  <span className="text-left">{t('common:owner_console_qr')}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-muted shrink-0" />
              </Link>
            </motion.div>
          </div>

          <div className="hero-stagger pt-4 border-t border-border/60 flex flex-wrap items-center justify-center gap-3">
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/login"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-border bg-paper hover:bg-surface hover:border-accent text-ink font-semibold text-xs transition-colors shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5 text-accent" />
                <span>{t('common:owner_login')}</span>
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/register"
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg border border-border bg-paper hover:bg-surface hover:border-accent text-ink font-semibold text-xs transition-colors shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5 text-accent" />
                <span>{t('common:register_new_shop')}</span>
              </Link>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-surface px-6 py-4 text-center">
        <DevCenterPointBadge variant="footer" />
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <MotionConfig reducedMotion="user">
      <SmoothScrollProvider>
        <BrowserRouter>
          <Suspense fallback={<PageSkeleton />}>
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
              <Route path="/platform" element={<Navigate to="/owner" replace />} />
              <Route path="/platform/*" element={<Navigate to="/owner" replace />} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </SmoothScrollProvider>
    </MotionConfig>
  );
};

export default App;
