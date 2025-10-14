import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  AlertTriangle,
  CreditCard,
  Tag,
  Settings as SettingsIcon,
  X,
  Check,
  Trash2,
} from 'lucide-react';
import { getNotificationManager, Notification, NotificationType } from '../../lib/notifications/NotificationManager';

const Container = styled.div`
  position: relative;
`;

const IconButton = styled.button`
  position: relative;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #6b7280;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;

    [data-theme="dark"] & {
      background: #374151;
    }
    color: #111827;
  }

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const Badge = styled.div`
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
  color: white;
  border-radius: 9999px;
  font-size: 0.6875rem;
  font-weight: 700;
  border: 2px solid white;
`;

const Dropdown = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 420px;
  max-height: 600px;
  background: white;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  }
  border-radius: 1rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid #e5e7eb;
  overflow: hidden;
  z-index: 1000;

  @media (max-width: 768px) {
    width: 90vw;
    max-width: 420px;
  }
`;

const Header = styled.div`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const Title = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const SmallButton = styled.button`
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.375rem;

  &.primary {
    background: #000000;
    color: white;
    &:hover {
      background: #374151;
    }
  }

  &.secondary {
    background: #f3f4f6;

    [data-theme="dark"] & {
      background: #374151;
    }
    color: #6b7280;
    &:hover {
      background: #e5e7eb;
      color: #111827;
    }
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const NotificationList = styled.div`
  max-height: 450px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f9fafb;

    [data-theme="dark"] & {
      background: #111827;
    }
  }

  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
`;

const NotificationItem = styled(motion.div)<{ $read: boolean }>`
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  transition: background 0.2s;
  opacity: ${props => props.$read ? 0.6 : 1};

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }

  &:hover {
    background: #f9fafb;

    [data-theme="dark"] & {
      background: #111827;
    }
  }

  &:last-child {
    border-bottom: none;
  }
`;

const NotificationHeader = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
`;

const NotificationIcon = styled.div<{ $type: NotificationType }>`
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: ${props => {
    switch (props.$type) {
      case 'success': return '#d1fae5';
      case 'error': return '#fee2e2';
      case 'warning': return '#fef3c7';
      case 'info': return '#dbeafe';
      case 'transaction': return '#e0e7ff';
      case 'offer': return '#fce7f3';
      default: return '#f3f4f6';
    }
  }};

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: ${props => {
      switch (props.$type) {
        case 'success': return '#065f46';
        case 'error': return '#991b1b';
        case 'warning': return '#92400e';
        case 'info': return '#1e40af';
        case 'transaction': return '#4338ca';
        case 'offer': return '#9f1239';
        default: return '#6b7280';
      }
    }};
  }
`;

const NotificationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const NotificationTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const NotificationMessage = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.4;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const NotificationTime = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.375rem;

  [data-theme="dark"] & {
    color: #6b7280;
  }
`;

const NotificationActions = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
`;

const ActionButton = styled.button`
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  color: #9ca3af;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;

    [data-theme="dark"] & {
      background: #374151;
    }
    color: #111827;
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const EmptyState = styled.div`
  padding: 3rem 1.5rem;
  text-align: center;
  color: #9ca3af;
`;

const EmptyIcon = styled.div`
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;

  [data-theme="dark"] & {
    background: #111827;
  }
  border-radius: 50%;

  svg {
    width: 2rem;
    height: 2rem;
    color: #d1d5db;
  }
`;

const EmptyText = styled.p`
  font-size: 0.9375rem;
`;

interface NotificationCenterProps {
  language?: 'en' | 'bg';
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ language = 'en' }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const manager = getNotificationManager();

  const updateNotifications = () => {
    setNotifications(manager.getAll());
    setUnreadCount(manager.getUnreadCount());
  };

  useEffect(() => {
    // Load initial notifications
    updateNotifications();

    // Subscribe to new notifications
    const unsubscribe = manager.subscribe((notification: Notification) => {
      updateNotifications();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkAsRead = (id: string) => {
    manager.markAsRead(id);
    updateNotifications();
  };

  const handleMarkAllAsRead = () => {
    manager.markAllAsRead();
    updateNotifications();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    manager.delete(id);
    updateNotifications();
  };

  const handleClearAll = () => {
    manager.clearRead();
    updateNotifications();
  };

  const getIcon = (type: NotificationType) => {
    switch (type) {
      case 'success': return <CheckCircle />;
      case 'error': return <AlertCircle />;
      case 'warning': return <AlertTriangle />;
      case 'info': return <Info />;
      case 'transaction': return <CreditCard />;
      case 'offer': return <Tag />;
      default: return <Bell />;
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return t('common.justNow');
    if (minutes < 60) return `${minutes}${language === 'bg' ? 'м' : 'm'}`;
    if (hours < 24) return `${hours}${language === 'bg' ? 'ч' : 'h'}`;
    if (days < 7) return `${days}${language === 'bg' ? 'д' : 'd'}`;
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US');
  };

  return (
    <Container>
      <IconButton onClick={() => setIsOpen(!isOpen)} aria-label="Notifications">
        <Bell />
        {unreadCount > 0 && <Badge>{unreadCount > 99 ? '99+' : unreadCount}</Badge>}
      </IconButton>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 999,
              }}
              onClick={() => setIsOpen(false)}
            />
            <Dropdown
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Header>
                <Title>{t('common.notifications')}</Title>
                <HeaderActions>
                  {unreadCount > 0 && (
                    <SmallButton className="secondary" onClick={handleMarkAllAsRead}>
                      <Check />
                      {t('common.markAllRead')}
                    </SmallButton>
                  )}
                  {notifications.length > 0 && (
                    <SmallButton className="secondary" onClick={handleClearAll}>
                      <Trash2 />
                      {t('common.clear')}
                    </SmallButton>
                  )}
                </HeaderActions>
              </Header>

              <NotificationList>
                {notifications.length === 0 ? (
                  <EmptyState>
                    <EmptyIcon>
                      <Bell />
                    </EmptyIcon>
                    <EmptyText>
                      {t('common.noNotifications')}
                    </EmptyText>
                  </EmptyState>
                ) : (
                  <AnimatePresence>
                    {notifications.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        $read={notification.read}
                        onClick={() => handleMarkAsRead(notification.id)}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        layout
                      >
                        <NotificationHeader>
                          <NotificationIcon $type={notification.type}>
                            {getIcon(notification.type)}
                          </NotificationIcon>
                          <NotificationContent>
                            <NotificationTitle>{notification.title}</NotificationTitle>
                            <NotificationMessage>{notification.message}</NotificationMessage>
                            <NotificationTime>{formatTime(notification.timestamp)}</NotificationTime>
                          </NotificationContent>
                          <NotificationActions>
                            <ActionButton onClick={(e) => handleDelete(notification.id, e)}>
                              <X />
                            </ActionButton>
                          </NotificationActions>
                        </NotificationHeader>
                      </NotificationItem>
                    ))}
                  </AnimatePresence>
                )}
              </NotificationList>
            </Dropdown>
          </>
        )}
      </AnimatePresence>
    </Container>
  );
};

export default NotificationCenter;
