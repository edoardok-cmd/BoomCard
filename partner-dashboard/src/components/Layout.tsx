import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './layout/Header/Header';
import Footer from './layout/Footer/Footer';
import MobileBottomNav from './layout/MobileBottomNav/MobileBottomNav';
import ImpersonationBanner from './common/ImpersonationBanner/ImpersonationBanner';
import PartnerStatusBanner from './common/PartnerStatusBanner/PartnerStatusBanner';

const Layout: React.FC = () => {
  const { pathname } = useLocation();
  const isAdminRoute = pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <PartnerStatusBanner />
      <Header />
      <main
        className="flex-1"
        style={{
          // Account for fixed Header (65px) + impersonation banner + partner
          // restriction banner. Each banner publishes its height as a CSS var;
          // fallback of 0 keeps layout correct when the banner is absent.
          paddingTop: 'calc(65px + var(--imp-banner-h, 0px) + var(--partner-restriction-h, 0px))',
          paddingBottom: 'calc(1px + var(--cookie-banner-h, 0px))',
        }}
      >
        <Outlet />
      </main>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <MobileBottomNav />}
    </div>
  );
};

export default Layout;