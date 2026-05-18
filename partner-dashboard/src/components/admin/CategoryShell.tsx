import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { AdminNavCategory, ADMIN_NAV } from './AdminNav';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { adminHelpService } from '../../services/adminHelp.service';

interface CategoryShellProps {
  category: AdminNavCategory;
}

export const CategoryShell: React.FC<CategoryShellProps> = ({ category }) => {
  const { user, logout } = useAuth();
  const { language } = useLanguage();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [logoutConfirm, setLogoutConfirm] = useState(false);

  const permissions: string[] = user?.permissions ?? [];
  const isSuperAdmin = user?.rawRole === 'SUPER_ADMIN';

  const canSeeHelp = isSuperAdmin || permissions.includes('help.read');
  const { data: helpCountData } = useQuery({
    queryKey: ['admin-help-new-count'],
    queryFn: () => adminHelpService.getNewCount(),
    enabled: !!user && canSeeHelp,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const helpNewCount = helpCountData?.count ?? 0;

  const visibleTabs = category.subItems.filter((sub) => {
    if (sub.superAdminOnly && !isSuperAdmin) return false;
    return !sub.permissionKey || isSuperAdmin || permissions.includes(sub.permissionKey);
  });

  const visibleNavCategories = ADMIN_NAV.filter(
    (cat) => !cat.permissionKey || isSuperAdmin || permissions.includes(cat.permissionKey)
  );

  const label = language === 'bg' ? category.labelBg : category.labelEn;

  return (
    <Shell>
      <SideNav>
        {visibleNavCategories.map((cat) => {
          const isActive = pathname.startsWith(cat.path);
          const catLabel = language === 'bg' ? cat.labelBg : cat.labelEn;
          return (
            <SideNavItem key={cat.key} to={cat.path} $active={isActive}>
              <SideNavIcon viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                <path d={cat.icon} />
              </SideNavIcon>
              <SideNavLabel>{catLabel}</SideNavLabel>
              {cat.key === 'help' && helpNewCount > 0 && (
                <NavBadge>{helpNewCount > 99 ? '99+' : helpNewCount}</NavBadge>
              )}
            </SideNavItem>
          );
        })}
      </SideNav>
      <MainArea>
        <ShellHeader>
          <CategoryTitle>{label}</CategoryTitle>
          {visibleTabs.length > 1 && (
            <TabBar>
              {visibleTabs.map((sub) =>
                sub.logoutAction ? (
                  <LogoutTab key={sub.path} type="button" onClick={() => setLogoutConfirm(true)}>
                    {language === 'bg' ? sub.labelBg : sub.labelEn}
                  </LogoutTab>
                ) : (
                  <Tab
                    key={sub.path}
                    to={sub.path}
                    end={sub.path === category.path}
                  >
                    {language === 'bg' ? sub.labelBg : sub.labelEn}
                  </Tab>
                )
              )}
            </TabBar>
          )}
          {logoutConfirm && (
            <LogoutOverlay onClick={() => setLogoutConfirm(false)}>
              <LogoutBox onClick={(e) => e.stopPropagation()}>
                <LogoutBoxTitle>Излизане от акаунта</LogoutBoxTitle>
                <LogoutBoxBody>Сигурни ли сте, че искате да излезете от администраторския панел?</LogoutBoxBody>
                <LogoutBoxActions>
                  <LogoutConfirmBtn onClick={() => { setLogoutConfirm(false); logout(); navigate('/login', { replace: true }); }}>
                    Изход
                  </LogoutConfirmBtn>
                  <LogoutCancelBtn onClick={() => setLogoutConfirm(false)}>Отказ</LogoutCancelBtn>
                </LogoutBoxActions>
              </LogoutBox>
            </LogoutOverlay>
          )}
        </ShellHeader>
        <ShellBody>
          <Outlet />
        </ShellBody>
      </MainArea>
    </Shell>
  );
};

const Shell = styled.div`
  display: flex;
  min-height: calc(100vh - 4rem);
  background: #faf9f5;
`;

const SideNav = styled.nav`
  width: 13rem;
  flex-shrink: 0;
  background: #ffffff;
  border-right: 1px solid #e8e5dc;
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow-y: auto;
`;

const SideNavItem = styled(NavLink)<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  font-size: 0.8125rem;
  font-weight: ${({ $active }) => ($active ? '700' : '500')};
  color: ${({ $active }) => ($active ? '#f97316' : '#374151')};
  background: ${({ $active }) => ($active ? '#fff7ed' : 'transparent')};
  border-left: 3px solid ${({ $active }) => ($active ? '#f97316' : 'transparent')};
  text-decoration: none;
  transition: background 120ms, color 120ms, border-color 120ms;
  &:hover {
    background: #f9fafb;
    color: #111827;
  }
`;

const SideNavIcon = styled.svg`
  width: 1.125rem;
  height: 1.125rem;
  flex-shrink: 0;
`;

const SideNavLabel = styled.span`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
`;

const NavBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3rem;
  border-radius: 9999px;
  background: #ef4444;
  color: #fff;
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
`;

const MainArea = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
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

const LogoutTab = styled.button`
  display: inline-block;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #b54327;
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms, border-color 150ms;
  &:hover {
    color: #903021;
    border-bottom-color: #b54327;
  }
`;
const LogoutOverlay = styled.div`
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
`;
const LogoutBox = styled.div`
  background: #ffffff;
  border: 1px solid #e8e5dc;
  border-radius: 0.875rem;
  padding: 2rem;
  width: 100%; max-width: 26rem;
  display: flex; flex-direction: column; gap: 1rem;
  box-shadow: 0 8px 32px rgba(0,0,0,0.12);
`;
const LogoutBoxTitle = styled.h3`font-size: 1rem; font-weight: 700; color: #141413; margin: 0;`;
const LogoutBoxBody = styled.p`font-size: 0.9375rem; color: #605a50; margin: 0; line-height: 1.5;`;
const LogoutBoxActions = styled.div`display: flex; gap: 0.5rem; margin-top: 0.25rem;`;
const LogoutConfirmBtn = styled.button`
  background: #b54327; color: white; border: 0;
  padding: 0.625rem 1.25rem; border-radius: 0.5rem;
  font-size: 0.9375rem; font-weight: 600; cursor: pointer;
  &:hover { background: #903021; }
`;
const LogoutCancelBtn = styled.button`
  background: #faf9f5; color: #141413; border: 1px solid #e8e5dc;
  padding: 0.625rem 1.25rem; border-radius: 0.5rem;
  font-size: 0.9375rem; font-weight: 600; cursor: pointer;
  &:hover { background: #f3e8de; border-color: #c96442; }
`;
