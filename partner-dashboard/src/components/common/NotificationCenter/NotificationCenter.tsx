import React, { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check, Info, AlertCircle, Gift } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  useNotifications,
  useUnreadCount,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
} from '../../../hooks/useNotifications';
import type {
  Notification as ApiNotification,
  NotificationType,
} from '../../../services/notifications.service';

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

const LoadingText = styled.div`
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
  font-size: 0.875rem;
`;

interface NotificationCenterProps {
  className?: string;
}

/**
 * Map a backend notification type → an icon "bucket" used by the styled
 * components above. Keeps the visual taxonomy (success/info/warning/offer)
 * stable while the API model uses a much wider type union.
 */
function bucketForType(type: NotificationType | string): 'success' | 'info' | 'warning' | 'offer' {
  switch (type) {
    case 'booking_confirmed':
    case 'payment_received':
    case 'payment_success':
    case 'cashback_credited':
    case 'receipt_approved':
    case 'sticker_scan_approved':
    case 'reward_available':
    case 'loyalty_points':
      return 'success';
    case 'booking_cancelled':
    case 'payment_failed':
    case 'receipt_rejected':
    case 'fraud_alert':
    case 'offer_expiring':
      return 'warning';
    case 'new_offer':
    case 'promotion':
      return 'offer';
    default:
      return 'info';
  }
}

function getIcon(bucket: 'success' | 'info' | 'warning' | 'offer') {
  switch (bucket) {
    case 'success': return <Check />;
    case 'warning': return <AlertCircle />;
    case 'offer': return <Gift />;
    case 'info':
    default: return <Info />;
  }
}

/**
 * Render a notification's createdAt as a short relative string ("5m ago").
 * Avoids pulling in date-fns just for one component — the partner-dashboard
 * already depends on date-fns but TanStack-Query-driven re-renders mean we'd
 * recompute on every poll, so a tiny inline formatter is cheaper.
 */
function formatRelative(iso: string, language: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(1, Math.floor((now - then) / 1000));

  const units: Array<[number, string, string]> = [
    [60, 'sec ago', 'сек'],
    [60, 'min ago', 'мин'],
    [24, 'h ago', 'ч'],
    [7, 'd ago', 'д'],
    [4, 'w ago', 'седм'],
    [12, 'mo ago', 'мес'],
    [Number.POSITIVE_INFINITY, 'y ago', 'г'],
  ];

  let value = diffSec;
  let suffix = units[0];
  for (const unit of units) {
    if (value < unit[0]) {
      suffix = unit;
      break;
    }
    value = Math.floor(value / unit[0]);
    suffix = unit;
  }

  return language === 'bg' ? `преди ${value} ${suffix[2]}` : `${value} ${suffix[1]}`;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className }) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Only fetch the list when the panel is open — the badge count drives the
  // closed-state UI and is cheap.
  const { data: countData } = useUnreadCount();
  const { data: listData, isLoading } = useNotifications(
    isOpen ? { page: 1, limit: 20 } : undefined
  );

  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const deleteOne = useDeleteNotification();

  const notifications = useMemo<ApiNotification[]>(
    () => listData?.data ?? [],
    [listData]
  );
  const unreadCount = countData ?? 0;

  // Click-outside to dismiss — without it the panel stays open when the
  // user clicks elsewhere in the dropdown menu.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const content = {
    en: {
      title: 'Notifications',
      markAllRead: 'Mark all read',
      empty: 'No notifications',
      loading: 'Loading…',
    },
    bg: {
      title: 'Известия',
      markAllRead: 'Маркирай всички',
      empty: 'Няма известия',
      loading: 'Зареждане…',
    },
  };
  const t = content[language as keyof typeof content];

  const handleNotificationClick = (notification: ApiNotification) => {
    if (notification.status === 'unread') {
      markAsRead.mutate(notification.id);
    }
    if (notification.actionUrl) {
      // location.assign satisfies the react-hooks/immutability lint rule that
      // forbids assigning to window.location.href; behavior is identical.
      window.location.assign(notification.actionUrl);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteOne.mutate(id);
  };

  return (
    <div ref={containerRef} className={className} style={{ position: 'relative' }}>
      <NotificationButton onClick={() => setIsOpen(prev => !prev)}>
        <Bell />
        {unreadCount > 0 && (
          <Badge
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
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
                <MarkAllButton
                  onClick={() => markAllAsRead.mutate()}
                  disabled={markAllAsRead.isPending}
                >
                  {t.markAllRead}
                </MarkAllButton>
              )}
            </PanelHeader>

            {isLoading ? (
              <LoadingText>{t.loading}</LoadingText>
            ) : notifications.length === 0 ? (
              <EmptyState>
                <EmptyIcon>
                  <Bell />
                </EmptyIcon>
                <EmptyText>{t.empty}</EmptyText>
              </EmptyState>
            ) : (
              <NotificationList>
                {notifications.map((notification) => {
                  const bucket = bucketForType(notification.type);
                  const isRead = notification.status !== 'unread';
                  return (
                    <NotificationItem
                      key={notification.id}
                      $read={isRead}
                      onClick={() => handleNotificationClick(notification)}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                    >
                      <NotificationIcon $type={bucket}>
                        {getIcon(bucket)}
                      </NotificationIcon>
                      <NotificationContent>
                        <NotificationTitle $read={isRead}>
                          {language === 'bg' ? notification.titleBg : notification.title}
                        </NotificationTitle>
                        <NotificationMessage>
                          {language === 'bg' ? notification.messageBg : notification.message}
                        </NotificationMessage>
                        <NotificationTime>
                          {formatRelative(notification.createdAt, language)}
                        </NotificationTime>
                      </NotificationContent>
                      <DeleteButton onClick={(e) => handleDelete(notification.id, e)}>
                        <X />
                      </DeleteButton>
                    </NotificationItem>
                  );
                })}
              </NotificationList>
            )}
          </NotificationPanel>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationCenter;
