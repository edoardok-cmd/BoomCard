export interface AdminSubItem {
  labelBg: string;
  labelEn: string;
  path: string;
  permissionKey?: string;
}

export interface AdminNavCategory {
  key: string;
  labelBg: string;
  labelEn: string;
  path: string;
  icon: string; // heroicon path data (24-outline)
  permissionKey: string;
  subItems: AdminSubItem[];
}

// Single source of truth for the 10-category admin IA.
// Order matches the spec: Табло · Абонати · Партньори · Финанси · Контрол ·
// Маркетинг · Настройки · Администратори · Помощ · Профил
export const ADMIN_NAV: AdminNavCategory[] = [
  {
    key: 'dashboard',
    labelBg: 'Табло',
    labelEn: 'Dashboard',
    path: '/admin/dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    permissionKey: 'dashboard.read',
    subItems: [
      { labelBg: 'Обзор', labelEn: 'Overview', path: '/admin/dashboard', permissionKey: 'dashboard.read' },
      { labelBg: 'Сигнали', labelEn: 'Alerts', path: '/admin/dashboard/alerts', permissionKey: 'dashboard.read' },
    ],
  },
  {
    key: 'subscribers',
    labelBg: 'Абонати',
    labelEn: 'Subscribers',
    path: '/admin/subscribers',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    permissionKey: 'subscribers.read',
    subItems: [
      { labelBg: 'Всички', labelEn: 'All', path: '/admin/subscribers/all', permissionKey: 'subscribers.read' },
      { labelBg: 'Абонаменти', labelEn: 'Subscriptions', path: '/admin/subscribers/subscriptions', permissionKey: 'subscriptions.read' },
      { labelBg: 'Транзакции', labelEn: 'Transactions', path: '/admin/subscribers/transactions', permissionKey: 'transactions.read' },
      { labelBg: 'Кешбек', labelEn: 'Cashback', path: '/admin/subscribers/cashback', permissionKey: 'cashback.read' },
    ],
  },
  {
    key: 'partners',
    labelBg: 'Партньори',
    labelEn: 'Partners',
    path: '/admin/partners',
    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    permissionKey: 'partners.read',
    subItems: [
      { labelBg: 'Заявки', labelEn: 'Requests', path: '/admin/partners/requests', permissionKey: 'partners.requests.read' },
      { labelBg: 'Комуникация и онбординг', labelEn: 'Communication & Onboarding', path: '/admin/partners/onboarding', permissionKey: 'partners.onboarding.read' },
      { labelBg: 'Активни', labelEn: 'Active', path: '/admin/partners/active', permissionKey: 'partners.read' },
      { labelBg: 'Локации & QR', labelEn: 'Locations & QR', path: '/admin/partners/locations', permissionKey: 'partners.locations.read' },
      { labelBg: 'Профили на бележки', labelEn: 'Receipt Profiles', path: '/admin/partners/receipt-profiles', permissionKey: 'partners.receipts.read' },
    ],
  },
  {
    key: 'finance',
    labelBg: 'Финанси',
    labelEn: 'Finance',
    path: '/admin/finance',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    permissionKey: 'finance.payouts.read',
    subItems: [
      { labelBg: 'Плащания абонати', labelEn: 'Subscriber Payouts', path: '/admin/finance/payouts', permissionKey: 'finance.payouts.read' },
      { labelBg: 'Фактури партньори', labelEn: 'Partner Invoices', path: '/admin/finance/invoices', permissionKey: 'finance.invoices.read' },
      { labelBg: 'Периоди', labelEn: 'Reporting Periods', path: '/admin/finance/periods', permissionKey: 'finance.periods.read' },
      { labelBg: 'Справки', labelEn: 'Reports', path: '/admin/finance/reports', permissionKey: 'finance.reports.read' },
    ],
  },
  {
    key: 'control',
    labelBg: 'Контрол',
    labelEn: 'Control',
    path: '/admin/control',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    permissionKey: 'control.risk.read',
    subItems: [
      { labelBg: 'Риск и сигурност', labelEn: 'Risk & Security', path: '/admin/control/risk', permissionKey: 'control.risk.read' },
      { labelBg: 'Одит лог', labelEn: 'Audit Log', path: '/admin/control/security', permissionKey: 'admins.audit.read' },
      { labelBg: 'Спорове', labelEn: 'Disputes', path: '/admin/control/disputes', permissionKey: 'control.disputes.read' },
      { labelBg: 'Лимити и правила', labelEn: 'Limits & Rules', path: '/admin/control/rules', permissionKey: 'control.rules.read' },
      { labelBg: 'Конфигурация по обект', labelEn: 'Venue Config', path: '/admin/control/venue-config', permissionKey: 'control.rules.read' },
    ],
  },
  {
    key: 'marketing',
    labelBg: 'Маркетинг',
    labelEn: 'Marketing',
    path: '/admin/marketing',
    icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
    permissionKey: 'marketing.read',
    subItems: [
      { labelBg: 'Кампании', labelEn: 'Campaigns', path: '/admin/marketing/campaigns', permissionKey: 'marketing.read' },
      { labelBg: 'Шаблони', labelEn: 'Templates', path: '/admin/marketing/templates', permissionKey: 'marketing.read' },
      { labelBg: 'Автоматизации', labelEn: 'Automations', path: '/admin/marketing/automations', permissionKey: 'marketing.read' },
      { labelBg: 'Списъци', labelEn: 'Lists', path: '/admin/marketing/lists', permissionKey: 'marketing.read' },
    ],
  },
  {
    key: 'settings',
    labelBg: 'Настройки',
    labelEn: 'Settings',
    path: '/admin/settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    permissionKey: 'settings.read',
    subItems: [
      { labelBg: 'Прагове', labelEn: 'Thresholds', path: '/admin/settings/thresholds', permissionKey: 'settings.read' },
      { labelBg: 'Проценти', labelEn: 'Percentages', path: '/admin/settings/percentages', permissionKey: 'settings.read' },
      { labelBg: 'Валидност', labelEn: 'Validity', path: '/admin/settings/validity', permissionKey: 'settings.read' },
      { labelBg: 'Мобилно приложение', labelEn: 'Mobile App', path: '/admin/settings/mobile', permissionKey: 'settings.read' },
      { labelBg: 'Система', labelEn: 'System', path: '/admin/settings/system', permissionKey: 'settings.write' },
    ],
  },
  {
    key: 'admins',
    labelBg: 'Администратори',
    labelEn: 'Admins',
    path: '/admin/admins',
    icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    permissionKey: 'admins.read',
    subItems: [
      { labelBg: 'Всички', labelEn: 'All Admins', path: '/admin/admins/all', permissionKey: 'admins.read' },
      { labelBg: 'Нов администратор', labelEn: 'Create Admin', path: '/admin/admins/create', permissionKey: 'admins.write' },
      { labelBg: 'Очакващи одобрение', labelEn: 'Pending Approvals', path: '/admin/admins/pending', permissionKey: 'admins.write' },
      { labelBg: 'История на действията', labelEn: 'Action History', path: '/admin/admins/audit', permissionKey: 'admins.audit.read' },
    ],
  },
  {
    key: 'help',
    labelBg: 'Помощ',
    labelEn: 'Help',
    path: '/admin/help',
    icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    permissionKey: 'help.read',
    subItems: [
      { labelBg: 'Нов тикет', labelEn: 'New Ticket', path: '/admin/help/new', permissionKey: 'help.read' },
      { labelBg: 'Моите тикети', labelEn: 'My Tickets', path: '/admin/help/mine', permissionKey: 'help.read' },
      { labelBg: 'Всички тикети', labelEn: 'All Tickets', path: '/admin/help/all', permissionKey: 'help.read' },
    ],
  },
  {
    key: 'profile',
    labelBg: 'Профил',
    labelEn: 'Profile',
    path: '/admin/profile',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    permissionKey: 'dashboard.read', // always visible
    subItems: [
      { labelBg: 'Моите данни', labelEn: 'My Data', path: '/admin/profile/my-data', permissionKey: 'dashboard.read' },
      { labelBg: 'Сигурност', labelEn: 'Security', path: '/admin/profile/security', permissionKey: 'dashboard.read' },
      { labelBg: 'Изход', labelEn: 'Logout', path: '/admin/profile/logout', permissionKey: 'dashboard.read' },
    ],
  },
];
