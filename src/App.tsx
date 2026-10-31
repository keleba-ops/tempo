import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SiteHeader } from './components/SiteHeader';
import { Footer } from './components/Footer';
import { DashboardLayout } from './components/DashboardLayout';
import { PageLoader } from './components/Loading';
import { Landing } from './pages/Landing';
import { Explore } from './pages/Explore';
import { BusinessProfile } from './pages/BusinessProfile';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { NotFound } from './pages/NotFound';
import { GetApp } from './pages/GetApp';
import { InstallPrompt } from './components/InstallPrompt';
import { AccountOverview } from './pages/account/AccountOverview';
import { AccountBookings } from './pages/account/AccountBookings';
import { AccountFavorites } from './pages/account/AccountFavorites';
import { AccountSettings } from './pages/account/AccountSettings';
import { NotificationsPage } from './pages/NotificationsPage';
import { MessagesPage } from './pages/MessagesPage';
import { OwnerOverview } from './pages/owner/OwnerOverview';
import { OwnerCalendar } from './pages/owner/OwnerCalendar';
import { OwnerBookings } from './pages/owner/OwnerBookings';
import { OwnerServices } from './pages/owner/OwnerServices';
import { OwnerAvailability } from './pages/owner/OwnerAvailability';
import { OwnerSettings } from './pages/owner/OwnerSettings';

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const timer = window.setTimeout(() => {
        const element = document.querySelector(hash);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
      return () => window.clearTimeout(timer);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
  return null;
}

function PublicLayout() {
  return (
    <>
      <SiteHeader />
      <main>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}

function RequireAuth({ role }: { role: 'owner' | 'customer' }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="full-page-loader">
        <PageLoader label="Opening Tempo" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (user.role !== role) {
    return <Navigate to={user.role === 'owner' ? '/owner' : '/account'} replace />;
  }
  return <Outlet />;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="full-page-loader"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'owner' ? '/owner' : '/account'} replace />;
}

export default function App() {
  return (
    <>
      <ScrollManager />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/b/:slug" element={<BusinessProfile />} />
          <Route path="/get-app" element={<GetApp />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<RequireAuth role="customer" />}>
          <Route element={<DashboardLayout variant="customer" />}>
            <Route path="/account" element={<AccountOverview />} />
            <Route path="/account/bookings" element={<AccountBookings />} />
            <Route path="/account/messages" element={<MessagesPage />} />
            <Route path="/account/favorites" element={<AccountFavorites />} />
            <Route path="/account/notifications" element={<NotificationsPage />} />
            <Route path="/account/settings" element={<AccountSettings />} />
          </Route>
        </Route>

        <Route element={<RequireAuth role="owner" />}>
          <Route element={<DashboardLayout variant="owner" />}>
            <Route path="/owner" element={<OwnerOverview />} />
            <Route path="/owner/calendar" element={<OwnerCalendar />} />
            <Route path="/owner/bookings" element={<OwnerBookings />} />
            <Route path="/owner/messages" element={<MessagesPage />} />
            <Route path="/owner/services" element={<OwnerServices />} />
            <Route path="/owner/availability" element={<OwnerAvailability />} />
            <Route path="/owner/settings" element={<OwnerSettings />} />
            <Route path="/owner/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route path="/dashboard" element={<HomeRedirect />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
      </Routes>
      <InstallPrompt />
    </>
  );
}
