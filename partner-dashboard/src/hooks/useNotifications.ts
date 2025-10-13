import { useEffect, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsService, Notification, NotificationFilters, NotificationType, NotificationPreferences } from '../services/notifications.service';
import toast from 'react-hot-toast';

/**
 * Hook to manage WebSocket connection
 */
export function useNotificationConnection(userId?: string) {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Connect WebSocket
    notificationsService.connectWebSocket(userId);

    // Subscribe to connection status
    const unsubscribe = notificationsService.onConnectionChange(setIsConnected);

    return () => {
      unsubscribe();
      notificationsService.disconnectWebSocket();
    };
  }, [userId]);

  return isConnected;
}

/**
 * Hook to subscribe to real-time notifications
 */
export function useNotificationSubscription(
  type: NotificationType | '*',
  onNotification: (notification: Notification) => void
) {
  useEffect(() => {
    const unsubscribe = notificationsService.subscribe(type, onNotification);
    return unsubscribe;
  }, [type, onNotification]);
}

/**
 * Hook to fetch notifications
 */
export function useNotifications(filters?: NotificationFilters) {
  return useQuery({
    queryKey: ['notifications', filters],
    queryFn: () => notificationsService.getNotifications(filters),
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Hook to fetch a single notification
 */
export function useNotification(id: string | undefined) {
  return useQuery({
    queryKey: ['notification', id],
    queryFn: () => notificationsService.getNotificationById(id!),
    enabled: !!id,
  });
}

/**
 * Hook to get unread count
 */
export function useUnreadCount() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsService.getUnreadCount(),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // Subscribe to real-time updates
  useNotificationSubscription('*', () => {
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
  });

  return query;
}

/**
 * Hook to mark notification as read
 */
export function useMarkAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsService.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

/**
 * Hook to mark all as read
 */
export function useMarkAllAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsService.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      toast.success('All notifications marked as read');
    },
  });
}

/**
 * Hook to archive notification
 */
export function useArchiveNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsService.archiveNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Hook to delete notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => notificationsService.deleteNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });
}

/**
 * Hook to delete all notifications
 */
export function useDeleteAllNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsService.deleteAllNotifications(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
      toast.success('All notifications deleted');
    },
  });
}

/**
 * Hook to get notification preferences
 */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => notificationsService.getPreferences(),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update notification preferences
 */
export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (preferences: Partial<NotificationPreferences>) =>
      notificationsService.updatePreferences(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      toast.success('Preferences updated successfully');
    },
    onError: () => {
      toast.error('Failed to update preferences');
    },
  });
}

/**
 * Hook to request push permission
 */
export function useRequestPushPermission() {
  return useMutation({
    mutationFn: () => notificationsService.requestPushPermission(),
    onSuccess: (granted) => {
      if (granted) {
        toast.success('Push notifications enabled');
      } else {
        toast.error('Push notifications denied');
      }
    },
  });
}

/**
 * Hook to show toast notifications for real-time updates
 */
export function useNotificationToasts(userId?: string) {
  const queryClient = useQueryClient();

  useNotificationSubscription('*', (notification) => {
    // Update cache
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });

    // Show toast based on priority
    const message = notification.title;

    switch (notification.priority) {
      case 'urgent':
        toast.error(message, {
          duration: 10000,
          icon: '🚨',
        });
        break;
      case 'high':
        toast(message, {
          duration: 6000,
          icon: '⚠️',
        });
        break;
      case 'medium':
        toast(message, {
          duration: 4000,
          icon: '📢',
        });
        break;
      case 'low':
        toast(message, {
          duration: 3000,
          icon: 'ℹ️',
        });
        break;
    }
  });
}

/**
 * Hook for notification center state management
 */
export function useNotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'unread' | 'archived'>('all');

  const filters: NotificationFilters = {
    status: selectedTab === 'unread' ? 'unread' : selectedTab === 'archived' ? 'archived' : undefined,
    page: 1,
    limit: 20,
  };

  const { data, isLoading, refetch } = useNotifications(filters);
  const { data: unreadCount } = useUnreadCount();
  const markAsReadMutation = useMarkAsRead();
  const markAllAsReadMutation = useMarkAllAsRead();
  const deleteMutation = useDeleteNotification();

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleToggle = useCallback(() => setIsOpen(prev => !prev), []);

  const handleMarkAsRead = useCallback(async (id: string) => {
    await markAsReadMutation.mutateAsync(id);
  }, [markAsReadMutation]);

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsReadMutation.mutateAsync();
  }, [markAllAsReadMutation]);

  const handleDelete = useCallback(async (id: string) => {
    await deleteMutation.mutateAsync(id);
  }, [deleteMutation]);

  return {
    isOpen,
    selectedTab,
    setSelectedTab,
    notifications: data?.data || [],
    total: data?.total || 0,
    unreadCount: unreadCount || 0,
    isLoading,
    handleOpen,
    handleClose,
    handleToggle,
    handleMarkAsRead,
    handleMarkAllAsRead,
    handleDelete,
    refetch,
  };
}

/**
 * Hook to get notification statistics
 */
export function useNotificationStatistics(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ['notifications', 'statistics', startDate, endDate],
    queryFn: () => notificationsService.getStatistics(startDate, endDate),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to handle notification actions
 */
export function useNotificationActions() {
  const markAsRead = useMarkAsRead();
  const deleteNotification = useDeleteNotification();
  const archiveNotification = useArchiveNotification();

  const handleNotificationClick = useCallback(async (notification: Notification) => {
    // Mark as read
    if (notification.status === 'unread') {
      await markAsRead.mutateAsync(notification.id);
    }

    // Navigate to action URL if provided
    if (notification.actionUrl) {
      window.location.href = notification.actionUrl;
    }
  }, [markAsRead]);

  return {
    handleNotificationClick,
    markAsRead: markAsRead.mutateAsync,
    deleteNotification: deleteNotification.mutateAsync,
    archiveNotification: archiveNotification.mutateAsync,
  };
}
