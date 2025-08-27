import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './layout/Header/Header';
import Sidebar from './layout/Sidebar/Sidebar';
import Footer from './layout/Footer/Footer';

const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
};

export default Layout;