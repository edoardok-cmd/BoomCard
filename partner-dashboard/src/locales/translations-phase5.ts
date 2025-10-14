/**
 * Phase 5 Translations
 * Complete bilingual support for Payments, Loyalty, and Messaging
 *
 * IMPORTANT: Merge these translations into your existing locale files:
 * - src/locales/en.ts
 * - src/locales/bg.ts
 */

export const phase5TranslationsEN = {
  // ===== PAYMENTS =====
  payments: {
    // General
    title: 'Payments',
    subtitle: 'Manage transactions and payment methods',

    // Transactions
    transactions: 'Transactions',
    transactionId: 'Transaction ID',
    transactionHistory: 'Transaction History',
    recentTransactions: 'Recent Transactions',
    allTransactions: 'All Transactions',
    viewTransaction: 'View Transaction',
    transactionDetails: 'Transaction Details',

    // Payment Actions
    createPayment: 'Create Payment',
    confirmPayment: 'Confirm Payment',
    cancelPayment: 'Cancel Payment',
    payNow: 'Pay Now',
    processingAction: 'Processing...',

    // Payment Methods
    paymentMethods: 'Payment Methods',
    savedCards: 'Saved Cards',
    addPaymentMethod: 'Add Payment Method',
    addCard: 'Add Card',
    removeCard: 'Remove Card',
    setDefaultCard: 'Set as Default',
    defaultCard: 'Default',
    cardNumber: 'Card Number',
    expiryDate: 'Expiry Date',
    cvv: 'CVV',
    cardholderName: 'Cardholder Name',

    // Payment Types
    card: 'Card',
    paypal: 'PayPal',
    applePay: 'Apple Pay',
    googlePay: 'Google Pay',
    bankTransfer: 'Bank Transfer',
    wallet: 'Wallet',

    // Transaction Types
    booking: 'Booking',
    offerRedemption: 'Offer Redemption',
    subscription: 'Subscription',
    refund: 'Refund',
    payout: 'Payout',
    commission: 'Commission',

    // Status
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    partiallyRefunded: 'Partially Refunded',
    disputed: 'Disputed',

    // Amounts
    amount: 'Amount',
    total: 'Total',
    subtotal: 'Subtotal',
    fee: 'Fee',
    tax: 'Tax',
    netAmount: 'Net Amount',

    // Refunds
    requestRefund: 'Request Refund',
    processRefund: 'Process Refund',
    refundAmount: 'Refund Amount',
    refundReason: 'Refund Reason',
    approveRefund: 'Approve Refund',
    rejectRefund: 'Reject Refund',
    refundRequested: 'Refund Requested',
    refundApproved: 'Refund Approved',
    refundRejected: 'Refund Rejected',

    // Invoices
    invoices: 'Invoices',
    invoice: 'Invoice',
    invoiceNumber: 'Invoice #',
    downloadInvoice: 'Download Invoice',
    viewInvoice: 'View Invoice',
    issueDate: 'Issue Date',
    dueDate: 'Due Date',

    // Wallet
    walletBalance: 'Wallet Balance',
    availableBalance: 'Available Balance',
    pendingBalance: 'Pending Balance',
    addFunds: 'Add Funds',
    transferFunds: 'Transfer Funds',
    withdrawFunds: 'Withdraw Funds',

    // Subscriptions
    subscriptions: 'Subscriptions',
    activeSubscription: 'Active Subscription',
    cancelSubscription: 'Cancel Subscription',
    renewSubscription: 'Renew Subscription',
    subscriptionDetails: 'Subscription Details',
    billingCycle: 'Billing Cycle',
    nextBillingDate: 'Next Billing Date',

    // Payouts
    payouts: 'Payouts',
    requestPayout: 'Request Payout',
    payoutAmount: 'Payout Amount',
    payoutMethod: 'Payout Method',
    payoutStatus: 'Payout Status',

    // Statistics
    statistics: 'Statistics',
    totalRevenue: 'Total Revenue',
    totalTransactions: 'Total Transactions',
    successRate: 'Success Rate',
    averageTransaction: 'Average Transaction',
    totalRefunds: 'Total Refunds',

    // Export
    exportTransactions: 'Export Transactions',
    exportAs: 'Export as',
    csv: 'CSV',
    xlsx: 'Excel',
    pdf: 'PDF',

    // Messages
    paymentSuccess: 'Payment completed successfully',
    paymentFailed: 'Payment failed',
    paymentCancelled: 'Payment cancelled',
    cardAdded: 'Card added successfully',
    cardRemoved: 'Card removed',
    defaultCardSet: 'Default card set',
    refundRequestSubmitted: 'Refund request submitted',
    invoiceDownloaded: 'Invoice downloaded',
    fundsAdded: 'Funds added to wallet',
    transferCompleted: 'Transfer completed',
    subscriptionCreated: 'Subscription created',
    subscriptionCancelled: 'Subscription cancelled',
  },

  // ===== LOYALTY & REWARDS =====
  loyalty: {
    // General
    title: 'Loyalty & Rewards',
    subtitle: 'Earn points, unlock rewards, and level up',

    // Points
    points: 'Points',
    availablePoints: 'Available Points',
    totalPoints: 'Total Points',
    earnPoints: 'Earn Points',
    redeemPoints: 'Redeem Points',
    pointsBalance: 'Points Balance',
    lifetimeEarned: 'Lifetime Earned',
    lifetimeRedeemed: 'Lifetime Redeemed',
    pointsExpiring: 'Points Expiring',
    expiresOn: 'Expires on',

    // Tiers
    tier: 'Tier',
    currentTier: 'Current Tier',
    nextTier: 'Next Tier',
    tierProgress: 'Tier Progress',
    tierBenefits: 'Tier Benefits',
    pointsToNextTier: 'Points to Next Tier',
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    diamond: 'Diamond',

    // Rewards
    rewards: 'Rewards',
    rewardsCatalog: 'Rewards Catalog',
    myRewards: 'My Rewards',
    featuredRewards: 'Featured Rewards',
    recommendedRewards: 'Recommended Rewards',
    redeemReward: 'Redeem Reward',
    rewardDetails: 'Reward Details',
    pointsCost: 'Points Cost',
    stockAvailable: 'Stock Available',
    unlimited: 'Unlimited',

    // Reward Types
    discount: 'Discount',
    freeItem: 'Free Item',
    upgrade: 'Upgrade',
    voucher: 'Voucher',
    experience: 'Experience',
    cashback: 'Cashback',
    giftCard: 'Gift Card',

    // Redemptions
    redemptions: 'Redemptions',
    myRedemptions: 'My Redemptions',
    activeRedemptions: 'Active Redemptions',
    redemptionCode: 'Redemption Code',
    useRedemption: 'Use Redemption',
    validUntil: 'Valid Until',
    used: 'Used',
    expired: 'Expired',

    // Badges
    badges: 'Badges',
    myBadges: 'My Badges',
    allBadges: 'All Badges',
    badgeCollection: 'Badge Collection',
    unlockBadge: 'Unlock Badge',
    badgeProgress: 'Badge Progress',
    rareBadge: 'Rare Badge',
    epicBadge: 'Epic Badge',
    legendaryBadge: 'Legendary Badge',

    // Badge Categories
    experienceBadge: 'Experience',
    socialBadge: 'Social',
    loyaltyBadge: 'Loyalty',
    specialBadge: 'Special',
    seasonalBadge: 'Seasonal',
    achievementBadge: 'Achievement',

    // Referrals
    referrals: 'Referrals',
    referralProgram: 'Referral Program',
    referralCode: 'Referral Code',
    myReferralCode: 'My Referral Code',
    inviteFriends: 'Invite Friends',
    shareReferralLink: 'Share Referral Link',
    referralReward: 'Referral Reward',
    totalReferrals: 'Total Referrals',
    successfulReferrals: 'Successful Referrals',
    pendingReferrals: 'Pending Referrals',

    // Leaderboard
    leaderboard: 'Leaderboard',
    myRank: 'My Rank',
    topEarners: 'Top Earners',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    thisYear: 'This Year',
    allTime: 'All Time',
    rank: 'Rank',

    // Milestones
    milestones: 'Milestones',
    nextMilestone: 'Next Milestone',
    milestonesAchieved: 'Milestones Achieved',

    // Earning Opportunities
    earningOpportunities: 'Earning Opportunities',
    howToEarn: 'How to Earn Points',
    earnByBooking: 'Earn by Booking',
    earnByReview: 'Earn by Review',
    earnByReferral: 'Earn by Referral',
    earnByPurchase: 'Earn by Purchase',

    // Messages
    pointsEarned: 'You earned {points} points!',
    rewardRedeemed: 'Reward redeemed successfully!',
    badgeUnlocked: 'Badge unlocked!',
    tierUpgraded: 'Congratulations! You reached {tier} tier!',
    referralCodeCopied: 'Referral code copied to clipboard',
    referralApplied: 'Referral code applied successfully',
    pointsTransferred: 'Points transferred successfully',
    notEnoughPoints: 'Not enough points',
    rewardNotAvailable: 'Reward not available',
    maxRedemptionsReached: 'Maximum redemptions reached',
  },

  // ===== MESSAGING =====
  messaging: {
    // General
    title: 'Messages',
    subtitle: 'Chat with customers and partners',

    // Conversations
    conversations: 'Conversations',
    allConversations: 'All Conversations',
    activeConversations: 'Active Conversations',
    archivedConversations: 'Archived Conversations',
    newConversation: 'New Conversation',
    startConversation: 'Start Conversation',
    conversationWith: 'Conversation with {name}',

    // Messages
    messages: 'Messages',
    newMessage: 'New Message',
    sendMessage: 'Send Message',
    typeMessage: 'Type a message...',
    noMessages: 'No messages yet',
    loadMore: 'Load More Messages',

    // Actions
    send: 'Send',
    edit: 'Edit',
    delete: 'Delete',
    reply: 'Reply',
    forward: 'Forward',
    copy: 'Copy',

    // Conversation Actions
    archive: 'Archive',
    unarchive: 'Unarchive',
    pin: 'Pin',
    unpin: 'Unpin',
    mute: 'Mute',
    unmute: 'Unmute',
    leave: 'Leave Conversation',

    // Status
    online: 'Online',
    offline: 'Offline',
    away: 'Away',
    typing: 'typing...',
    lastSeen: 'Last seen {time}',

    // Read Status
    read: 'Read',
    delivered: 'Delivered',
    sent: 'Sent',
    sending: 'Sending...',
    markAsRead: 'Mark as Read',
    markAllAsRead: 'Mark All as Read',
    unreadMessages: 'Unread Messages',
    unreadCount: '{count} unread',

    // Search
    search: 'Search messages',
    searchResults: 'Search Results',
    noResults: 'No results found',

    // Attachments
    attachFile: 'Attach File',
    attachImage: 'Attach Image',
    attachments: 'Attachments',
    file: 'File',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    download: 'Download',

    // Templates
    templates: 'Templates',
    messageTemplates: 'Message Templates',
    quickReplies: 'Quick Replies',
    useTemplate: 'Use Template',
    createTemplate: 'Create Template',
    editTemplate: 'Edit Template',
    deleteTemplate: 'Delete Template',
    templateName: 'Template Name',
    templateContent: 'Template Content',
    templateCategory: 'Template Category',

    // Participants
    participants: 'Participants',
    addParticipant: 'Add Participant',
    removeParticipant: 'Remove Participant',
    you: 'You',

    // Conversation Types
    direct: 'Direct Message',
    group: 'Group Chat',
    support: 'Support',

    // Moderation
    blockUser: 'Block User',
    unblockUser: 'Unblock User',
    blockedUsers: 'Blocked Users',
    reportMessage: 'Report Message',
    reportReason: 'Report Reason',
    spam: 'Spam',
    inappropriate: 'Inappropriate',
    harassment: 'Harassment',
    other: 'Other',

    // Export
    exportConversation: 'Export Conversation',
    exportAsPDF: 'Export as PDF',
    exportAsText: 'Export as Text',

    // Statistics
    statistics: 'Messaging Statistics',
    totalConversations: 'Total Conversations',
    activeChats: 'Active Chats',
    averageResponseTime: 'Average Response Time',
    responseRate: 'Response Rate',
    messagesThisMonth: 'Messages This Month',

    // Messages
    conversationCreated: 'Conversation created',
    messageSent: 'Message sent',
    messageEdited: 'Message edited',
    messageDeleted: 'Message deleted',
    conversationArchived: 'Conversation archived',
    conversationUnarchived: 'Conversation unarchived',
    conversationPinned: 'Conversation pinned',
    conversationUnpinned: 'Conversation unpinned',
    conversationMuted: 'Conversation muted',
    conversationUnmuted: 'Conversation unmuted',
    userBlocked: 'User blocked',
    userUnblocked: 'User unblocked',
    messageReported: 'Message reported',
    conversationExported: 'Conversation exported',
    participantAdded: 'Participant added',
    participantRemoved: 'Participant removed',
    templateCreated: 'Template created',
    templateUpdated: 'Template updated',
    templateDeleted: 'Template deleted',
    allMarkedAsRead: 'All messages marked as read',

    // Errors
    failedToSend: 'Failed to send message',
    failedToLoad: 'Failed to load messages',
    connectionLost: 'Connection lost. Reconnecting...',
    reconnected: 'Reconnected',
  },
};

export const phase5TranslationsBG = {
  // ===== ПЛАЩАНИЯ =====
  payments: {
    // Общи
    title: 'Плащания',
    subtitle: 'Управление на транзакции и методи за плащане',

    // Транзакции
    transactions: 'Транзакции',
    transactionId: 'ID на транзакция',
    transactionHistory: 'История на транзакциите',
    recentTransactions: 'Последни транзакции',
    allTransactions: 'Всички транзакции',
    viewTransaction: 'Преглед на транзакция',
    transactionDetails: 'Детайли на транзакция',

    // Действия с плащания
    createPayment: 'Създай плащане',
    confirmPayment: 'Потвърди плащане',
    cancelPayment: 'Отмени плащане',
    payNow: 'Плати сега',
    processingAction: 'Обработка...',

    // Методи за плащане
    paymentMethods: 'Методи за плащане',
    savedCards: 'Запазени карти',
    addPaymentMethod: 'Добави метод за плащане',
    addCard: 'Добави карта',
    removeCard: 'Премахни карта',
    setDefaultCard: 'Задай като основна',
    defaultCard: 'Основна',
    cardNumber: 'Номер на карта',
    expiryDate: 'Дата на валидност',
    cvv: 'CVV',
    cardholderName: 'Име на картодържател',

    // Видове плащания
    card: 'Карта',
    paypal: 'PayPal',
    applePay: 'Apple Pay',
    googlePay: 'Google Pay',
    bankTransfer: 'Банков превод',
    wallet: 'Портфейл',

    // Видове транзакции
    booking: 'Резервация',
    offerRedemption: 'Активиране на оферта',
    subscription: 'Абонамент',
    refund: 'Връщане',
    payout: 'Изплащане',
    commission: 'Комисионна',

    // Статус
    pending: 'Изчакващо',
    processing: 'В процес',
    completed: 'Завършено',
    failed: 'Неуспешно',
    cancelled: 'Отменено',
    refunded: 'Върнато',
    partiallyRefunded: 'Частично върнато',
    disputed: 'Оспорено',

    // Суми
    amount: 'Сума',
    total: 'Общо',
    subtotal: 'Междинна сума',
    fee: 'Такса',
    tax: 'Данък',
    netAmount: 'Нетна сума',

    // Връщания
    requestRefund: 'Заявка за връщане',
    processRefund: 'Обработи връщане',
    refundAmount: 'Сума за връщане',
    refundReason: 'Причина за връщане',
    approveRefund: 'Одобри връщане',
    rejectRefund: 'Отхвърли връщане',
    refundRequested: 'Заявено връщане',
    refundApproved: 'Одобрено връщане',
    refundRejected: 'Отхвърлено връщане',

    // Фактури
    invoices: 'Фактури',
    invoice: 'Фактура',
    invoiceNumber: 'Фактура №',
    downloadInvoice: 'Изтегли фактура',
    viewInvoice: 'Преглед на фактура',
    issueDate: 'Дата на издаване',
    dueDate: 'Дата на падеж',

    // Портфейл
    walletBalance: 'Баланс в портфейла',
    availableBalance: 'Наличен баланс',
    pendingBalance: 'Чакащ баланс',
    addFunds: 'Добави средства',
    transferFunds: 'Прехвърли средства',
    withdrawFunds: 'Изтегли средства',

    // Абонаменти
    subscriptions: 'Абонаменти',
    activeSubscription: 'Активен абонамент',
    cancelSubscription: 'Отмени абонамент',
    renewSubscription: 'Поднови абонамент',
    subscriptionDetails: 'Детайли на абонамент',
    billingCycle: 'Цикъл на фактуриране',
    nextBillingDate: 'Следваща дата на фактуриране',

    // Изплащания
    payouts: 'Изплащания',
    requestPayout: 'Заявка за изплащане',
    payoutAmount: 'Сума за изплащане',
    payoutMethod: 'Метод на изплащане',
    payoutStatus: 'Статус на изплащане',

    // Статистика
    statistics: 'Статистика',
    totalRevenue: 'Общи приходи',
    totalTransactions: 'Общо транзакции',
    successRate: 'Процент на успеваемост',
    averageTransaction: 'Средна транзакция',
    totalRefunds: 'Общо връщания',

    // Експорт
    exportTransactions: 'Експортирай транзакции',
    exportAs: 'Експортирай като',
    csv: 'CSV',
    xlsx: 'Excel',
    pdf: 'PDF',

    // Съобщения
    paymentSuccess: 'Плащането е завършено успешно',
    paymentFailed: 'Плащането е неуспешно',
    paymentCancelled: 'Плащането е отменено',
    cardAdded: 'Картата е добавена успешно',
    cardRemoved: 'Картата е премахната',
    defaultCardSet: 'Основната карта е зададена',
    refundRequestSubmitted: 'Заявката за връщане е изпратена',
    invoiceDownloaded: 'Фактурата е изтеглена',
    fundsAdded: 'Средствата са добавени към портфейла',
    transferCompleted: 'Преводът е завършен',
    subscriptionCreated: 'Абонаментът е създаден',
    subscriptionCancelled: 'Абонаментът е отменен',
  },

  // ===== ЛОЯЛНОСТ И НАГРАДИ =====
  loyalty: {
    // Общи
    title: 'Лоялност и Награди',
    subtitle: 'Спечелете точки, отключете награди и повишете нивото си',

    // Точки
    points: 'Точки',
    availablePoints: 'Налични точки',
    totalPoints: 'Общо точки',
    earnPoints: 'Спечели точки',
    redeemPoints: 'Използвай точки',
    pointsBalance: 'Баланс точки',
    lifetimeEarned: 'Спечелени за цял живот',
    lifetimeRedeemed: 'Използвани за цял живот',
    pointsExpiring: 'Точки с изтичащ срок',
    expiresOn: 'Изтича на',

    // Нива
    tier: 'Ниво',
    currentTier: 'Текущо ниво',
    nextTier: 'Следващо ниво',
    tierProgress: 'Прогрес към ниво',
    tierBenefits: 'Придобивки на нивото',
    pointsToNextTier: 'Точки до следващо ниво',
    bronze: 'Бронзово',
    silver: 'Сребърно',
    gold: 'Златно',
    platinum: 'Платинено',
    diamond: 'Диамантено',

    // Награди
    rewards: 'Награди',
    rewardsCatalog: 'Каталог награди',
    myRewards: 'Моите награди',
    featuredRewards: 'Препоръчани награди',
    recommendedRewards: 'Предложени награди',
    redeemReward: 'Активирай награда',
    rewardDetails: 'Детайли на наградата',
    pointsCost: 'Цена в точки',
    stockAvailable: 'Наличен брой',
    unlimited: 'Неограничен',

    // Видове награди
    discount: 'Отстъпка',
    freeItem: 'Безплатен продукт',
    upgrade: 'Надграждане',
    voucher: 'Ваучер',
    experience: 'Преживяване',
    cashback: 'Кешбек',
    giftCard: 'Подарък карта',

    // Активирани награди
    redemptions: 'Активирани награди',
    myRedemptions: 'Моите активирани награди',
    activeRedemptions: 'Активни награди',
    redemptionCode: 'Код за активиране',
    useRedemption: 'Използвай наградата',
    validUntil: 'Валидно до',
    used: 'Използвано',
    expired: 'Изтекло',

    // Значки
    badges: 'Значки',
    myBadges: 'Моите значки',
    allBadges: 'Всички значки',
    badgeCollection: 'Колекция значки',
    unlockBadge: 'Отключи значка',
    badgeProgress: 'Прогрес на значката',
    rareBadge: 'Рядка значка',
    epicBadge: 'Епична значка',
    legendaryBadge: 'Легендарна значка',

    // Категории значки
    experienceBadge: 'Преживяване',
    socialBadge: 'Социална',
    loyaltyBadge: 'Лоялност',
    specialBadge: 'Специална',
    seasonalBadge: 'Сезонна',
    achievementBadge: 'Постижение',

    // Референции
    referrals: 'Референции',
    referralProgram: 'Програма за референции',
    referralCode: 'Референтен код',
    myReferralCode: 'Моят референтен код',
    inviteFriends: 'Покани приятели',
    shareReferralLink: 'Сподели референтна връзка',
    referralReward: 'Награда за референция',
    totalReferrals: 'Общо референции',
    successfulReferrals: 'Успешни референции',
    pendingReferrals: 'Чакащи референции',

    // Класация
    leaderboard: 'Класация',
    myRank: 'Моята позиция',
    topEarners: 'Топ спечелители',
    thisWeek: 'Тази седмица',
    thisMonth: 'Този месец',
    thisYear: 'Тази година',
    allTime: 'За всички времена',
    rank: 'Позиция',

    // Постижения
    milestones: 'Постижения',
    nextMilestone: 'Следващо постижение',
    milestonesAchieved: 'Постигнати постижения',

    // Възможности за спечелване
    earningOpportunities: 'Възможности за спечелване',
    howToEarn: 'Как да спечелите точки',
    earnByBooking: 'Спечелете с резервация',
    earnByReview: 'Спечелете с отзив',
    earnByReferral: 'Спечелете с референция',
    earnByPurchase: 'Спечелете с покупка',

    // Съобщения
    pointsEarned: 'Спечелихте {points} точки!',
    rewardRedeemed: 'Наградата е активирана успешно!',
    badgeUnlocked: 'Значката е отключена!',
    tierUpgraded: 'Поздравления! Достигнахте {tier} ниво!',
    referralCodeCopied: 'Референтният код е копиран',
    referralApplied: 'Референтният код е приложен успешно',
    pointsTransferred: 'Точките са прехвърлени успешно',
    notEnoughPoints: 'Недостатъчно точки',
    rewardNotAvailable: 'Наградата не е налична',
    maxRedemptionsReached: 'Достигнат максимален брой активирания',
  },

  // ===== СЪОБЩЕНИЯ =====
  messaging: {
    // Общи
    title: 'Съобщения',
    subtitle: 'Чат с клиенти и партньори',

    // Разговори
    conversations: 'Разговори',
    allConversations: 'Всички разговори',
    activeConversations: 'Активни разговори',
    archivedConversations: 'Архивирани разговори',
    newConversation: 'Нов разговор',
    startConversation: 'Започни разговор',
    conversationWith: 'Разговор с {name}',

    // Съобщения
    messages: 'Съобщения',
    newMessage: 'Ново съобщение',
    sendMessage: 'Изпрати съобщение',
    typeMessage: 'Напишете съобщение...',
    noMessages: 'Все още няма съобщения',
    loadMore: 'Зареди още съобщения',

    // Действия
    send: 'Изпрати',
    edit: 'Редактирай',
    delete: 'Изтрий',
    reply: 'Отговори',
    forward: 'Препрати',
    copy: 'Копирай',

    // Действия с разговори
    archive: 'Архивирай',
    unarchive: 'Разархивирай',
    pin: 'Закачи',
    unpin: 'Откачи',
    mute: 'Заглуши',
    unmute: 'Включи звук',
    leave: 'Напусни разговора',

    // Статус
    online: 'На линия',
    offline: 'Извън линия',
    away: 'Отсъства',
    typing: 'пише...',
    lastSeen: 'Последно видян преди {time}',

    // Статус на прочитане
    read: 'Прочетено',
    delivered: 'Доставено',
    sent: 'Изпратено',
    sending: 'Изпращане...',
    markAsRead: 'Маркирай като прочетено',
    markAllAsRead: 'Маркирай всички като прочетени',
    unreadMessages: 'Непрочетени съобщения',
    unreadCount: '{count} непрочетени',

    // Търсене
    search: 'Търси съобщения',
    searchResults: 'Резултати от търсенето',
    noResults: 'Няма намерени резултати',

    // Прикачени файлове
    attachFile: 'Прикачи файл',
    attachImage: 'Прикачи изображение',
    attachments: 'Прикачени файлове',
    file: 'Файл',
    image: 'Изображение',
    video: 'Видео',
    audio: 'Аудио',
    download: 'Изтегли',

    // Шаблони
    templates: 'Шаблони',
    messageTemplates: 'Шаблони за съобщения',
    quickReplies: 'Бързи отговори',
    useTemplate: 'Използвай шаблон',
    createTemplate: 'Създай шаблон',
    editTemplate: 'Редактирай шаблон',
    deleteTemplate: 'Изтрий шаблон',
    templateName: 'Име на шаблон',
    templateContent: 'Съдържание на шаблон',
    templateCategory: 'Категория на шаблон',

    // Участници
    participants: 'Участници',
    addParticipant: 'Добави участник',
    removeParticipant: 'Премахни участник',
    you: 'Вие',

    // Видове разговори
    direct: 'Директно съобщение',
    group: 'Групов чат',
    support: 'Поддръжка',

    // Модерация
    blockUser: 'Блокирай потребител',
    unblockUser: 'Разблокирай потребител',
    blockedUsers: 'Блокирани потребители',
    reportMessage: 'Докладвай съобщение',
    reportReason: 'Причина за докладване',
    spam: 'Спам',
    inappropriate: 'Неуместно',
    harassment: 'Тормоз',
    other: 'Друго',

    // Експорт
    exportConversation: 'Експортирай разговор',
    exportAsPDF: 'Експортирай като PDF',
    exportAsText: 'Експортирай като текст',

    // Статистика
    statistics: 'Статистика на съобщенията',
    totalConversations: 'Общо разговори',
    activeChats: 'Активни чатове',
    averageResponseTime: 'Средно време за отговор',
    responseRate: 'Процент на отговори',
    messagesThisMonth: 'Съобщения този месец',

    // Съобщения
    conversationCreated: 'Разговорът е създаден',
    messageSent: 'Съобщението е изпратено',
    messageEdited: 'Съобщението е редактирано',
    messageDeleted: 'Съобщението е изтрито',
    conversationArchived: 'Разговорът е архивиран',
    conversationUnarchived: 'Разговорът е разархивиран',
    conversationPinned: 'Разговорът е закачен',
    conversationUnpinned: 'Разговорът е откачен',
    conversationMuted: 'Разговорът е заглушен',
    conversationUnmuted: 'Звукът на разговора е включен',
    userBlocked: 'Потребителят е блокиран',
    userUnblocked: 'Потребителят е разблокиран',
    messageReported: 'Съобщението е докладвано',
    conversationExported: 'Разговорът е експортиран',
    participantAdded: 'Участникът е добавен',
    participantRemoved: 'Участникът е премахнат',
    templateCreated: 'Шаблонът е създаден',
    templateUpdated: 'Шаблонът е актуализиран',
    templateDeleted: 'Шаблонът е изтрит',
    allMarkedAsRead: 'Всички съобщения са маркирани като прочетени',

    // Грешки
    failedToSend: 'Неуспешно изпращане на съобщение',
    failedToLoad: 'Неуспешно зареждане на съобщения',
    connectionLost: 'Връзката е прекъсната. Повторно свързване...',
    reconnected: 'Връзката е възстановена',
  },
};
