import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './layout/Header/Header';
import Footer from './layout/Footer/Footer';
import MobileBottomNav from './layout/MobileBottomNav/MobileBottomNav';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1" style={{ paddingTop: '65px', paddingBottom: '80px' }}>
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default Layout;