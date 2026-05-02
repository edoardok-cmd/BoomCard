import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import styled from 'styled-components';
import { AdminNavCategory } from './AdminNav';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface CategoryShellProps {
  category: AdminNavCategory;
}

export const CategoryShell: React.FC<CategoryShellProps> = ({ category }) => {
  const { user } = useAuth();
  const { language } = useLanguage();

  const permissions: string[] = user?.permissions ?? [];
  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';

  const visibleTabs = category.subItems.filter(
    (sub) => !sub.permissionKey || isSuperAdmin || permissions.includes(sub.permissionKey)
  );

  const label = language === 'bg' ? category.labelBg : category.labelEn;

  return (
    <Shell>
      <ShellHeader>
        <CategoryTitle>{label}</CategoryTitle>
        {visibleTabs.length > 1 && (
          <TabBar>
            {visibleTabs.map((sub) => (
              <Tab
                key={sub.path}
                to={sub.path}
                end={sub.path === category.path}
              >
                {language === 'bg' ? sub.labelBg : sub.labelEn}
              </Tab>
            ))}
          </TabBar>
        )}
      </ShellHeader>
      <ShellBody>
        <Outlet />
      </ShellBody>
    </Shell>
  );
};

const Shell = styled.div`
  min-height: calc(100vh - 4rem);
  background: #faf9f5;
`;

const ShellHeader = styled.div`
  background: #ffffff;
  border-bottom: 1px solid #e8e5dc;
  padding: 0 1.5rem;
`;

const CategoryTitle = styled.h1`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  padding: 1.25rem 0 0.75rem;
  margin: 0;
`;

const TabBar = styled.nav`
  display: flex;
  gap: 0;
  overflow-x: auto;
`;

const Tab = styled(NavLink)`
  display: inline-block;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  text-decoration: none;
  white-space: nowrap;
  transition: color 150ms, border-color 150ms;

  &:hover {
    color: #374151;
  }

  &.active {
    color: #f97316;
    border-bottom-color: #f97316;
  }
`;

const ShellBody = styled.div``;
