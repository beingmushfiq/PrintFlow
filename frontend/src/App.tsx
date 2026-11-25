import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { SmoothScrollProvider } from './components/common/SmoothScrollProvider';
import { PageSkeleton } from './components/common/PageSkeleton';
import { LandingHome } from './pages/public/LandingPage';

export { LandingHome };

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
