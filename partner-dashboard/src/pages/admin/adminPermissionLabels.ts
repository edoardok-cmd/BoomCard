// BG localization for the granular RBAC permission catalog (BC-ADMIN-RBAC-ROLES-019-FE).
// The backend catalog ships EN labels + stable keys; the admin UI is Bulgarian, so we map
// every category and permission key to a readable BG label here. Keys not present fall back
// to the catalog's EN label (so a newly-added backend key still renders, untranslated).

export const CATEGORY_LABELS_BG: Record<string, string> = {
  dashboard:     'Табло',
  subscribers:   'Абонати и транзакции',
  partners:      'Партньори',
  finance:       'Финанси',
  control:       'Контрол на риска',
  marketing:     'Маркетинг',
  settings:      'Настройки',
  admins:        'Администратори',
  help:          'Помощ',
  impersonation: 'Представяне (impersonate)',
};

export const PERMISSION_LABELS_BG: Record<string, string> = {
  // dashboard
  'dashboard.read':            'Преглед на таблото',
  // subscribers
  'subscribers.read':          'Преглед на абонати',
  'subscribers.write':         'Редакция на абонати',
  'subscribers.delete':        'Меко изтриване на абонати',
  'subscribers.restore':       'Възстановяване на изтрити абонати',
  'subscriptions.read':        'Преглед на абонаменти',
  'subscriptions.write':       'Редакция на абонаменти',
  'transactions.read':         'Преглед на транзакции',
  'transactions.write':        'Балансови корекции',
  'cashback.read':             'Преглед на кешбек',
  'cashback.write':            'Управление на кешбек',
  // partners
  'partners.read':             'Преглед на партньори',
  'partners.write':            'Редакция на партньори',
  'partners.requests.read':    'Преглед на заявки от партньори',
  'partners.requests.write':   'Обработка на заявки от партньори',
  'partners.onboarding.read':  'Преглед на онбординг',
  'partners.onboarding.write': 'Управление на онбординг',
  'partners.locations.read':   'Преглед на обекти',
  'partners.locations.write':  'Редакция на обекти',
  // finance
  'finance.payouts.read':      'Преглед на изплащания',
  'finance.payouts.write':     'Управление на изплащания',
  'finance.invoices.read':     'Преглед на фактури',
  'finance.invoices.write':    'Редакция на фактури',
  'finance.periods.read':      'Преглед на счетоводни периоди',
  'finance.periods.write':     'Управление на счетоводни периоди',
  'finance.reports.read':      'Преглед на финансови справки',
  // control
  'control.risk.read':            'Преглед на риск',
  'control.risk.write':           'Управление на риск',
  'control.disputes.read':        'Преглед на спорове',
  'control.disputes.write':       'Обработка на спорове',
  'control.rules.read':           'Преглед на правила',
  'control.rules.write':          'Редакция на правила',
  'control.rules.write.bounded':  'Ограничена редакция на правила',
  'control.receipts.read':        'Преглед на касови бележки',
  'control.receipts.write':       'Обработка на касови бележки',
  // marketing
  'marketing.read':            'Преглед на маркетинг',
  'marketing.write':           'Редакция на маркетинг',
  // settings
  'settings.read':             'Преглед на настройки',
  'settings.write':            'Редакция на системни настройки',
  // admins
  'admins.read':               'Преглед на администратори',
  'admins.write':              'Създаване/редакция на администратори',
  'admins.audit.read':         'Преглед на одит лог',
  'admins.roles.write':        'Управление на роли и права',
  'admins.actions.read':       'Преглед на критични действия',
  // help
  'help.read':                 'Преглед на заявки за помощ',
  'help.read.all':             'Преглед на всички заявки за помощ',
  'help.write':                'Обработка на заявки за помощ',
  // impersonation
  'impersonate.partner':       'Представи се като партньор',
  'impersonate.user':          'Представи се като потребител',
};

// Map the assignable role templates to BG "user type" labels (spec §3.3.1).
export const ROLE_TEMPLATE_LABELS_BG: Record<string, string> = {
  ADMIN:           'Нормален администратор',
  SUPPORT:         'Поддръжка',
  FINANCE:         'Счетоводител',
  PARTNER_MANAGER: 'Продажби',
  RISK_REVIEW:     'Контрол на риска',
  SUPER_ADMIN:     'Супер администратор',
};

export const categoryLabel = (category: string): string =>
  CATEGORY_LABELS_BG[category] ?? category;

export const permissionLabel = (key: string, fallback?: string): string =>
  PERMISSION_LABELS_BG[key] ?? fallback ?? key;
