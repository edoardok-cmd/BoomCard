import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Mock integrations data - in production this would come from a database
const availableIntegrations = [
  {
    id: 'stripe',
    name: 'Stripe',
    nameEn: 'Stripe',
    nameBg: 'Stripe',
    description: 'Accept payments online with Stripe. Support for cards, Apple Pay, Google Pay, and more.',
    descriptionEn: 'Accept payments online with Stripe. Support for cards, Apple Pay, Google Pay, and more.',
    descriptionBg: 'Приемайте плащания онлайн със Stripe. Поддръжка за карти, Apple Pay, Google Pay и др.',
    category: 'Payment Gateways',
    categoryEn: 'Payment Gateways',
    categoryBg: 'Платежни шлюзове',
    provider: 'Stripe Inc.',
    logoUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200',
    websiteUrl: 'https://stripe.com',
    documentationUrl: 'https://stripe.com/docs',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'Credit/Debit card payments',
      'Apple Pay & Google Pay',
      'Recurring billing',
      'Multi-currency support',
      'Fraud detection'
    ],
    featuresEn: [
      'Credit/Debit card payments',
      'Apple Pay & Google Pay',
      'Recurring billing',
      'Multi-currency support',
      'Fraud detection'
    ],
    featuresBg: [
      'Плащания с кредитни/дебитни карти',
      'Apple Pay и Google Pay',
      'Периодично фактуриране',
      'Поддръжка на множество валути',
      'Откриване на измами'
    ],
    pricing: {
      type: 'paid',
      description: '2.9% + $0.30 per transaction'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'publishableKey',
        label: 'Publishable Key',
        labelEn: 'Publishable Key',
        labelBg: 'Публичен ключ',
        type: 'text',
        required: true,
        placeholder: 'pk_live_...'
      },
      {
        name: 'secretKey',
        label: 'Secret Key',
        labelEn: 'Secret Key',
        labelBg: 'Таен ключ',
        type: 'password',
        required: true,
        placeholder: 'sk_live_...'
      }
    ]
  },
  {
    id: 'square',
    name: 'Square',
    nameEn: 'Square',
    nameBg: 'Square',
    description: 'Process payments with Square POS and payment processing.',
    descriptionEn: 'Process payments with Square POS and payment processing.',
    descriptionBg: 'Обработвайте плащания със Square POS система.',
    category: 'POS Systems',
    categoryEn: 'POS Systems',
    categoryBg: 'POS Системи',
    provider: 'Square Inc.',
    logoUrl: 'https://images.unsplash.com/photo-1556742111-a301076d9d18?w=200',
    websiteUrl: 'https://squareup.com',
    documentationUrl: 'https://developer.squareup.com',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'POS integration',
      'Inventory management',
      'Employee management',
      'Sales analytics',
      'Customer directory'
    ],
    featuresEn: [
      'POS integration',
      'Inventory management',
      'Employee management',
      'Sales analytics',
      'Customer directory'
    ],
    featuresBg: [
      'POS интеграция',
      'Управление на инвентар',
      'Управление на служители',
      'Анализ на продажбите',
      'Клиентска база данни'
    ],
    pricing: {
      type: 'paid',
      description: '2.6% + $0.10 per transaction'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'applicationId',
        label: 'Application ID',
        labelEn: 'Application ID',
        labelBg: 'Application ID',
        type: 'text',
        required: true,
        placeholder: 'sq0idp-...'
      },
      {
        name: 'accessToken',
        label: 'Access Token',
        labelEn: 'Access Token',
        labelBg: 'Токен за достъп',
        type: 'password',
        required: true,
        placeholder: 'EAA...'
      }
    ]
  },
  {
    id: 'paypal',
    name: 'PayPal',
    nameEn: 'PayPal',
    nameBg: 'PayPal',
    description: 'Accept PayPal payments and manage transactions.',
    descriptionEn: 'Accept PayPal payments and manage transactions.',
    descriptionBg: 'Приемайте PayPal плащания и управлявайте транзакции.',
    category: 'Payment Gateways',
    categoryEn: 'Payment Gateways',
    categoryBg: 'Платежни шлюзове',
    provider: 'PayPal Holdings Inc.',
    logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200',
    websiteUrl: 'https://paypal.com',
    documentationUrl: 'https://developer.paypal.com',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'PayPal checkout',
      'Buyer protection',
      'Multi-currency',
      'Mobile payments',
      'Subscription billing'
    ],
    featuresEn: [
      'PayPal checkout',
      'Buyer protection',
      'Multi-currency',
      'Mobile payments',
      'Subscription billing'
    ],
    featuresBg: [
      'PayPal плащане',
      'Защита на купувача',
      'Множество валути',
      'Мобилни плащания',
      'Абонаментно фактуриране'
    ],
    pricing: {
      type: 'paid',
      description: '3.49% + fixed fee per transaction'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'clientId',
        label: 'Client ID',
        labelEn: 'Client ID',
        labelBg: 'Client ID',
        type: 'text',
        required: true
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        labelEn: 'Client Secret',
        labelBg: 'Client Secret',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    nameEn: 'QuickBooks',
    nameBg: 'QuickBooks',
    description: 'Sync transactions and manage accounting with QuickBooks.',
    descriptionEn: 'Sync transactions and manage accounting with QuickBooks.',
    descriptionBg: 'Синхронизирайте транзакции и управлявайте счетоводството с QuickBooks.',
    category: 'Accounting',
    categoryEn: 'Accounting',
    categoryBg: 'Счетоводство',
    provider: 'Intuit Inc.',
    logoUrl: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=200',
    websiteUrl: 'https://quickbooks.intuit.com',
    documentationUrl: 'https://developer.intuit.com',
    status: 'available',
    isConnected: false,
    isPopular: false,
    features: [
      'Automatic sync',
      'Invoice management',
      'Expense tracking',
      'Financial reports',
      'Tax preparation'
    ],
    featuresEn: [
      'Automatic sync',
      'Invoice management',
      'Expense tracking',
      'Financial reports',
      'Tax preparation'
    ],
    featuresBg: [
      'Автоматична синхронизация',
      'Управление на фактури',
      'Проследяване на разходи',
      'Финансови отчети',
      'Подготовка на данъци'
    ],
    pricing: {
      type: 'freemium',
      description: 'Free for basic features, paid plans available'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'companyId',
        label: 'Company ID',
        labelEn: 'Company ID',
        labelBg: 'Company ID',
        type: 'text',
        required: true
      },
      {
        name: 'accessToken',
        label: 'Access Token',
        labelEn: 'Access Token',
        labelBg: 'Токен за достъп',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    nameEn: 'Google Analytics',
    nameBg: 'Google Analytics',
    description: 'Track customer behavior and campaign performance.',
    descriptionEn: 'Track customer behavior and campaign performance.',
    descriptionBg: 'Проследявайте поведението на клиентите и ефективността на кампаниите.',
    category: 'Analytics',
    categoryEn: 'Analytics',
    categoryBg: 'Аналитика',
    provider: 'Google LLC',
    logoUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200',
    websiteUrl: 'https://analytics.google.com',
    documentationUrl: 'https://developers.google.com/analytics',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'Real-time analytics',
      'Customer insights',
      'Campaign tracking',
      'Custom reports',
      'Event tracking'
    ],
    featuresEn: [
      'Real-time analytics',
      'Customer insights',
      'Campaign tracking',
      'Custom reports',
      'Event tracking'
    ],
    featuresBg: [
      'Анализ в реално време',
      'Прозрения за клиенти',
      'Проследяване на кампании',
      'Персонализирани отчети',
      'Проследяване на събития'
    ],
    pricing: {
      type: 'free',
      description: 'Free to use'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'trackingId',
        label: 'Tracking ID',
        labelEn: 'Tracking ID',
        labelBg: 'Tracking ID',
        type: 'text',
        required: true,
        placeholder: 'UA-XXXXXXXXX-X'
      }
    ]
  },
  {
    id: 'epay-bg',
    name: 'ePay.bg',
    nameEn: 'ePay.bg',
    nameBg: 'ePay.bg',
    description: 'Bulgarian payment gateway for online payments with all major Bulgarian banks.',
    descriptionEn: 'Bulgarian payment gateway for online payments with all major Bulgarian banks.',
    descriptionBg: 'Български платежен портал за онлайн плащания с всички основни български банки.',
    category: 'Payment Gateways',
    categoryEn: 'Payment Gateways',
    categoryBg: 'Платежни портали',
    provider: 'ePay.bg',
    logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200',
    websiteUrl: 'https://epay.bg',
    documentationUrl: 'https://epay.bg/v3main/front?p=docs',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'All Bulgarian banks',
      'Easy Pay terminals',
      'Instant notifications',
      'Recurring payments',
      'Refunds support'
    ],
    featuresEn: [
      'All Bulgarian banks',
      'Easy Pay terminals',
      'Instant notifications',
      'Recurring payments',
      'Refunds support'
    ],
    featuresBg: [
      'Всички български банки',
      'Easy Pay терминали',
      'Моментални известия',
      'Периодични плащания',
      'Поддръжка на връщания'
    ],
    pricing: {
      type: 'paid',
      description: 'Transaction fees apply'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'clientId',
        label: 'Client ID (KIN)',
        labelEn: 'Client ID (KIN)',
        labelBg: 'Client ID (KIN)',
        type: 'text',
        required: true
      },
      {
        name: 'secret',
        label: 'Secret',
        labelEn: 'Secret',
        labelBg: 'Таен ключ',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'borica',
    name: 'Borica',
    nameEn: 'Borica',
    nameBg: 'Борика',
    description: 'Official Bulgarian payment processing network for card payments.',
    descriptionEn: 'Official Bulgarian payment processing network for card payments.',
    descriptionBg: 'Официална българска платежна мрежа за картови плащания.',
    category: 'Payment Gateways',
    categoryEn: 'Payment Gateways',
    categoryBg: 'Платежни портали',
    provider: 'Borica AD',
    logoUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200',
    websiteUrl: 'https://www.borica.bg',
    documentationUrl: 'https://www.borica.bg',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'POS terminals',
      'E-commerce gateway',
      '3D Secure',
      'All Bulgarian banks',
      'Instant settlement'
    ],
    featuresEn: [
      'POS terminals',
      'E-commerce gateway',
      '3D Secure',
      'All Bulgarian banks',
      'Instant settlement'
    ],
    featuresBg: [
      'POS терминали',
      'Портал за електронна търговия',
      '3D Secure',
      'Всички български банки',
      'Моментно сетълване'
    ],
    pricing: {
      type: 'paid',
      description: 'Contact for pricing'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'terminalId',
        label: 'Terminal ID',
        labelEn: 'Terminal ID',
        labelBg: 'Номер на терминал',
        type: 'text',
        required: true
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        labelEn: 'Merchant ID',
        labelBg: 'Номер на търговец',
        type: 'text',
        required: true
      }
    ]
  },
  {
    id: 'mypos',
    name: 'myPOS',
    nameEn: 'myPOS',
    nameBg: 'myPOS',
    description: 'Mobile payment terminal and payment gateway solution.',
    descriptionEn: 'Mobile payment terminal and payment gateway solution.',
    descriptionBg: 'Мобилен платежен терминал и платежен портал.',
    category: 'Payment Terminals',
    categoryEn: 'Payment Terminals',
    categoryBg: 'Платежни терминали',
    provider: 'myPOS',
    logoUrl: 'https://images.unsplash.com/photo-1556742208-999815fca738?w=200',
    websiteUrl: 'https://www.mypos.com',
    documentationUrl: 'https://developers.mypos.com',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'Mobile POS terminals',
      'Online checkout',
      'Instant payouts',
      'Multiple currencies',
      'Business account'
    ],
    featuresEn: [
      'Mobile POS terminals',
      'Online checkout',
      'Instant payouts',
      'Multiple currencies',
      'Business account'
    ],
    featuresBg: [
      'Мобилни POS терминали',
      'Онлайн плащане',
      'Моментални изплащания',
      'Множество валути',
      'Бизнес сметка'
    ],
    pricing: {
      type: 'paid',
      description: '1.5% + €0.05 per transaction'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'clientId',
        label: 'Client ID',
        labelEn: 'Client ID',
        labelBg: 'Client ID',
        type: 'text',
        required: true
      },
      {
        name: 'privateKey',
        label: 'Private Key',
        labelEn: 'Private Key',
        labelBg: 'Частен ключ',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'sumup',
    name: 'SumUp',
    nameEn: 'SumUp',
    nameBg: 'SumUp',
    description: 'Simple card payment solution for small businesses.',
    descriptionEn: 'Simple card payment solution for small businesses.',
    descriptionBg: 'Проста система за картови плащания за малки бизнеси.',
    category: 'Payment Terminals',
    categoryEn: 'Payment Terminals',
    categoryBg: 'Платежни терминали',
    provider: 'SumUp',
    logoUrl: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200',
    websiteUrl: 'https://www.sumup.com',
    documentationUrl: 'https://developer.sumup.com',
    status: 'available',
    isConnected: false,
    isPopular: false,
    features: [
      'Card readers',
      'Mobile app',
      'Online payments',
      'Invoicing',
      'Sales reporting'
    ],
    featuresEn: [
      'Card readers',
      'Mobile app',
      'Online payments',
      'Invoicing',
      'Sales reporting'
    ],
    featuresBg: [
      'Четци на карти',
      'Мобилно приложение',
      'Онлайн плащания',
      'Фактуриране',
      'Отчети за продажби'
    ],
    pricing: {
      type: 'paid',
      description: '1.95% per transaction'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'apiKey',
        label: 'API Key',
        labelEn: 'API Key',
        labelBg: 'API ключ',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'iiko',
    name: 'iiko',
    nameEn: 'iiko',
    nameBg: 'iiko',
    description: 'Complete restaurant management system with POS, inventory, and analytics.',
    descriptionEn: 'Complete restaurant management system with POS, inventory, and analytics.',
    descriptionBg: 'Пълна система за управление на ресторанти с POS, инвентар и аналитика.',
    category: 'POS Systems',
    categoryEn: 'POS Systems',
    categoryBg: 'POS системи',
    provider: 'iiko',
    logoUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=200',
    websiteUrl: 'https://iiko.net',
    documentationUrl: 'https://api-ru.iiko.net',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'Restaurant POS',
      'Order management',
      'Kitchen display',
      'Inventory tracking',
      'Analytics & reports'
    ],
    featuresEn: [
      'Restaurant POS',
      'Order management',
      'Kitchen display',
      'Inventory tracking',
      'Analytics & reports'
    ],
    featuresBg: [
      'Ресторантски POS',
      'Управление на поръчки',
      'Дисплей за кухня',
      'Проследяване на инвентар',
      'Аналитика и отчети'
    ],
    pricing: {
      type: 'paid',
      description: 'Contact for pricing'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'apiLogin',
        label: 'API Login',
        labelEn: 'API Login',
        labelBg: 'API вход',
        type: 'text',
        required: true
      },
      {
        name: 'organizationId',
        label: 'Organization ID',
        labelEn: 'Organization ID',
        labelBg: 'ID на организация',
        type: 'text',
        required: true
      }
    ]
  },
  {
    id: 'rkeeper',
    name: 'R-Keeper',
    nameEn: 'R-Keeper',
    nameBg: 'R-Keeper',
    description: 'Professional restaurant automation system widely used in Eastern Europe.',
    descriptionEn: 'Professional restaurant automation system widely used in Eastern Europe.',
    descriptionBg: 'Професионална система за автоматизация на ресторанти, широко използвана в Източна Европа.',
    category: 'POS Systems',
    categoryEn: 'POS Systems',
    categoryBg: 'POS системи',
    provider: 'UCS',
    logoUrl: 'https://images.unsplash.com/photo-1556742111-a301076d9d18?w=200',
    websiteUrl: 'https://r-keeper.com',
    documentationUrl: 'https://r-keeper.com',
    status: 'available',
    isConnected: false,
    isPopular: true,
    features: [
      'Restaurant management',
      'Table service',
      'Bar & kitchen modules',
      'Delivery integration',
      'Multi-location support'
    ],
    featuresEn: [
      'Restaurant management',
      'Table service',
      'Bar & kitchen modules',
      'Delivery integration',
      'Multi-location support'
    ],
    featuresBg: [
      'Управление на ресторант',
      'Обслужване на маси',
      'Модули за бар и кухня',
      'Интеграция с доставки',
      'Поддръжка на множество локации'
    ],
    pricing: {
      type: 'paid',
      description: 'Contact for pricing'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'serverAddress',
        label: 'Server Address',
        labelEn: 'Server Address',
        labelBg: 'Адрес на сървър',
        type: 'text',
        required: true
      },
      {
        name: 'apiKey',
        label: 'API Key',
        labelEn: 'API Key',
        labelBg: 'API ключ',
        type: 'password',
        required: true
      }
    ]
  },
  {
    id: 'poster-pos',
    name: 'Poster POS',
    nameEn: 'Poster POS',
    nameBg: 'Poster POS',
    description: 'Cloud-based POS system for cafes, restaurants, and bars.',
    descriptionEn: 'Cloud-based POS system for cafes, restaurants, and bars.',
    descriptionBg: 'Облачна POS система за кафенета, ресторанти и барове.',
    category: 'POS Systems',
    categoryEn: 'POS Systems',
    categoryBg: 'POS системи',
    provider: 'Poster',
    logoUrl: 'https://images.unsplash.com/photo-1556742208-999815fca738?w=200',
    websiteUrl: 'https://joinposter.com',
    documentationUrl: 'https://dev.joinposter.com',
    status: 'available',
    isConnected: false,
    isPopular: false,
    features: [
      'Cloud POS',
      'Tablet interface',
      'Online orders',
      'Inventory management',
      'Staff management'
    ],
    featuresEn: [
      'Cloud POS',
      'Tablet interface',
      'Online orders',
      'Inventory management',
      'Staff management'
    ],
    featuresBg: [
      'Облачен POS',
      'Таблет интерфейс',
      'Онлайн поръчки',
      'Управление на инвентар',
      'Управление на персонал'
    ],
    pricing: {
      type: 'paid',
      description: 'Starting from $29/month'
    },
    requiresCredentials: true,
    credentialsFields: [
      {
        name: 'accountName',
        label: 'Account Name',
        labelEn: 'Account Name',
        labelBg: 'Име на акаунт',
        type: 'text',
        required: true
      },
      {
        name: 'applicationId',
        label: 'Application ID',
        labelEn: 'Application ID',
        labelBg: 'Application ID',
        type: 'text',
        required: true
      },
      {
        name: 'applicationSecret',
        label: 'Application Secret',
        labelEn: 'Application Secret',
        labelBg: 'Application Secret',
        type: 'password',
        required: true
      }
    ]
  }
];

/**
 * GET /api/integrations/available
 * Get all available integrations (optionally filtered by category)
 */
router.get('/available', (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    let filtered = availableIntegrations;

    if (category && typeof category === 'string') {
      filtered = availableIntegrations.filter(
        (integration) => integration.category.toLowerCase() === category.toLowerCase()
      );
    }

    res.json(filtered);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch available integrations',
      error: error.message,
    });
  }
});

/**
 * GET /api/integrations/available/:id
 * Get a specific integration by ID
 */
router.get('/available/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const integration = availableIntegrations.find((int) => int.id === id);

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    res.json(integration);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error.message,
    });
  }
});

/**
 * GET /api/integrations/connected
 * Get partner's connected integrations
 */
router.get('/connected', authenticate, (req: Request, res: Response) => {
  try {
    // In a real app, this would fetch from database
    // For now, return empty array
    res.json([]);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch connected integrations',
      error: error.message,
    });
  }
});

/**
 * POST /api/integrations/connect
 * Connect a new integration
 */
router.post('/connect', authenticate, (req: Request, res: Response) => {
  try {
    const { integrationId, credentials, settings } = req.body;

    if (!integrationId) {
      return res.status(400).json({
        success: false,
        message: 'Integration ID is required',
      });
    }

    const integration = availableIntegrations.find((int) => int.id === integrationId);

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found',
      });
    }

    // In a real app, this would save to database
    // For now, return success
    const connectedIntegration = {
      id: `connected-${Date.now()}`,
      partnerId: (req as any).user?.id || 'partner-1',
      integrationId,
      integration,
      status: 'active',
      credentials,
      settings,
      connectedAt: new Date(),
      updatedAt: new Date(),
    };

    res.json({
      success: true,
      data: connectedIntegration,
      message: 'Integration connected successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to connect integration',
      error: error.message,
    });
  }
});

/**
 * DELETE /api/integrations/connected/:id
 * Disconnect an integration
 */
router.delete('/connected/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // In a real app, this would delete from database
    res.json({
      success: true,
      message: 'Integration disconnected successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect integration',
      error: error.message,
    });
  }
});

/**
 * POST /api/integrations/test/:id
 * Test an integration connection
 */
router.post('/test/:id', authenticate, (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { credentials } = req.body;

    // In a real app, this would test the actual connection
    // For now, simulate success
    res.json({
      success: true,
      message: 'Connection test successful',
      data: {
        status: 'success',
        latency: Math.floor(Math.random() * 500) + 100,
        timestamp: new Date(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Connection test failed',
      error: error.message,
    });
  }
});

/**
 * GET /api/integrations/stats
 * Get integration statistics
 * Requires authentication
 */
router.get('/stats', authenticate, (req: Request, res: Response) => {
  try {
    // In a real app, this would fetch actual stats from database
    res.json({
      success: true,
      data: {
        totalIntegrations: availableIntegrations.length,
        activeIntegrations: 0, // Would count from user's connected integrations
        categoryCounts: {
          'POS Systems': availableIntegrations.filter(i => i.category === 'POS Systems').length,
          'Payment Gateways': availableIntegrations.filter(i => i.category === 'Payment Gateways').length,
          'Analytics': availableIntegrations.filter(i => i.category === 'Analytics').length,
          'Accounting': availableIntegrations.filter(i => i.category === 'Accounting').length,
        },
        lastSyncAt: new Date(),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration statistics',
      error: error.message,
    });
  }
});

/**
 * GET /api/integrations/categories
 * Get integration categories
 * Public endpoint - no authentication required
 */
router.get('/categories', (req: Request, res: Response) => {
  try {
    const categories = Array.from(new Set(availableIntegrations.map(i => i.category)));
    res.json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message,
    });
  }
});

export default router;
