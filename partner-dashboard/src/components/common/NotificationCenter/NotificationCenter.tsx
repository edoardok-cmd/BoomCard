import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, Info, AlertCircle, Gift, CreditCard, TrendingUp } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';

const NotificationButton = styled.button`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  color: #374151;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    color: #111827;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const Badge = styled(motion.span)`
  position: absolute;
  top: 6px;
  right: 6px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: #ef4444;
  color: white;
  border-radius: 9px;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid white;
`;

const NotificationPanel = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  width: 400px;
  max-width: calc(100vw - 2rem);
  background: white;
  border-radius: 1rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;

  @media (max-width: 640px) {
    width: calc(100vw - 2rem);
  }
`;

const PanelHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e5e7eb;
`;

const PanelTitle = styled.h3`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const MarkAllButton = styled.button`
  font-size: 0.875rem;
  color: #667eea;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  transition: all 0.2s;

  &:hover {
    background: #667eea10;
  }
`;

const NotificationList = styled.div`
  max-height: 400px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f3f4f6;
  }

  &::-webkit-scrollbar-thumb {
    background: #d1d5db;
    border-radius: 3px;
  }
`;

const NotificationItem = styled(motion.div)<{ $read: boolean }>`
  display: flex;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer;
  background: ${props => props.$read ? 'white' : '#f9fafb'};
  transition: background 0.2s;

  &:hover {
    background: #f3f4f6;
  }

  &:last-child {
    border-bottom: none;
  }
`;

const NotificationIcon = styled.div<{ $type: string }>`
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => {
    switch (props.$type) {
      case 'success': return '#10b98110';
      case 'info': return '#3b82f610';
      case 'warning': return '#f59e0b10';
      case 'offer': return '#667eea10';
      default: return '#f3f4f6';
    }
  }};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => {
      switch (props.$type) {
        case 'success': return '#10b981';
        case 'info': return '#3b82f6';
        case 'warning': return '#f59e0b';
        case 'offer': return '#667eea';
        default: return '#6b7280';
      }
    }};
  }
`;

const NotificationContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const NotificationTitle = styled.div<{ $read: boolean }>`
  font-size: 0.875rem;
  font-weight: ${props => props.$read ? '500' : '600'};
  color: #111827;
  margin-bottom: 0.25rem;
`;

const NotificationMessage = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
`;

const NotificationTime = styled.div`
  font-size: 0.75rem;
  color: #9ca3af;
  margin-top: 0.25rem;
`;

const DeleteButton = styled.button`
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #9ca3af;
  border-radius: 0.375rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.2s;

  ${NotificationItem}:hover & {
    opacity: 1;
  }

  &:hover {
    background: #fee2e2;
    color: #ef4444;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1.5rem;
`;

const EmptyIcon = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  border-radius: 50%;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 32px;
    height: 32px;
    color: #9ca3af;
  }
`;

const EmptyText = styled.div`
  color: #6b7280;
  font-size: 0.875rem;
`;

interface Notification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'offer';
  title: string;
  titleBg: string;
  message: string;
  messageBg: string;
  time: string;
  read: boolean;
}

interface NotificationCenterProps {
  className?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className }) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'offer',
      title: 'New Offer Available',
      titleBg: 'Нова оферта налична',
      message: '50% off at Sense Hotel Sofia this weekend!',
      messageBg: '50% отстъпка в Sense Hotel Sofia този уикенд!',
      time: '5 min ago',
      read: false,
    },
    {
      id: '2',
      type: 'success',
      title: 'Card Activated',
      titleBg: 'Карта активирана',
      message: 'Your Premium BoomCard has been activated successfully.',
      messageBg: 'Вашата Premium BoomCard беше активирана успешно.',
      time: '1 hour ago',
      read: false,
    },
    {
      id: '3',
      type: 'info',
      title: 'Savings Milestone',
      titleBg: 'Постижение при спестявания',
      message: 'Congratulations! You have saved 1000 BGN with BoomCard.',
      messageBg: 'Поздравления! Спестили сте 1000 лв с BoomCard.',
      time: '2 hours ago',
      read: true,
    },
    {
      id: '4',
      type: 'warning',
      title: 'Card Expiring Soon',
      titleBg: 'Картата изтича скоро',
      message: 'Your BoomCard expires in 7 days. Renew now to keep saving.',
      messageBg: 'Вашата BoomCard изтича след 7 дни. Подновете сега.',
      time: '1 day ago',
      read: true,
    },
  ]);

  const content = {
    en: {
      title: 'Notifications',
      markAllRead: 'Mark all read',
      empty: 'No notifications',
    },
    bg: {
      title: 'Известия',
      markAllRead: 'Маркирай всички',
      empty: 'Няма известия',
    },
  };

  const t = content[language as keyof typeof content];
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const handleNotificationClick = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <Check />;
      case 'info': return <Info />;
      case 'warning': return <AlertCircle />;
      case 'offer': return <Gift />;
      default: return <Bell />;
    }
  };

  return (
    <div className={className} style={{ position: 'relative' }}>
      <NotificationButton onClick={() => setIsOpen(!isOpen)}>
        <Bell />
        {unreadCount > 0 && (
          <Badge
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {unreadCount}
          </Badge>
        )}
      </NotificationButton>

      <AnimatePresence>
        {isOpen && (
          <NotificationPanel
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <PanelHeader>
              <PanelTitle>{t.title}</PanelTitle>
              {unreadCount > 0 && (
                <MarkAllButton onClick={handleMarkAllRead}>
                  {t.markAllRead}
                </MarkAllButton>
              )}
            </PanelHeader>

            {notifications.length === 0 ? (
              <EmptyState>
                <EmptyIcon>
                  <Bell />
                </EmptyIcon>
                <EmptyText>{t.empty}</EmptyText>
              </EmptyState>
            ) : (
              <NotificationList>
                {notifications.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    $read={notification.read}
                    onClick={() => handleNotificationClick(notification.id)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <NotificationIcon $type={notification.type}>
                      {getIcon(notification.type)}
                    </NotificationIcon>
                    <NotificationContent>
                      <NotificationTitle $read={notification.read}>
                        {language === 'bg' ? notification.titleBg : notification.title}
                      </NotificationTitle>
                      <NotificationMessage>
                        {language === 'bg' ? notification.messageBg : notification.message}
                      </NotificationMessage>
                      <NotificationTime>{notification.time}</NotificationTime>
                    </NotificationContent>
                    <DeleteButton onClick={(e) => handleDelete(notification.id, e)}>
                      <X />
                    </DeleteButton>
                  </NotificationItem>
                ))}
              </NotificationList>
            )}
          </NotificationPanel>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
