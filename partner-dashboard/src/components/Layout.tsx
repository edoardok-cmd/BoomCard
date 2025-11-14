import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './layout/Header/Header';
import Footer from './layout/Footer/Footer';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1" style={{ paddingTop: '0' }}>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;