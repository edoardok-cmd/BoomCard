import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './layout/Header/Header';
import Footer from './layout/Footer/Footer';
import MobileBottomNav from './layout/MobileBottomNav/MobileBottomNav';
import ImpersonationBanner from './common/ImpersonationBanner/ImpersonationBanner';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <Header />
      <main
        className="flex-1"
        style={{
          // Account for the fixed Header (65px) + the impersonation banner
          // when it's mounted. ImpersonationBanner publishes its height via
          // --imp-banner-h; the fallback of 0 keeps non-impersonation users
          // at the original 65px.
          paddingTop: 'calc(65px + var(--imp-banner-h, 0px))',
          paddingBottom: '1px',
        }}
      >
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default Layout;