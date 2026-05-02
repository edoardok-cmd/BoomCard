export const AUDIT_ACTION_LABEL: Record<string, string> = {
  // Auth
  'auth.login':                    'Вход',
  'auth.logout':                   'Изход',
  'auth.login.failed':             'Неуспешен вход',
  'auth.password.reset':           'Смяна на парола',
  'auth.2fa.enable':               'Активиране на 2FA',
  'auth.2fa.disable':              'Деактивиране на 2FA',
  // User / Subscriber
  'user.create':                   'Създаден потребител',
  'user.update':                   'Промяна на потребител',
  'user.delete':                   'Изтрит потребител',
  'user.status.update':            'Промяна на статус на потребител',
  'subscriber.view':               'Преглед на абонат',
  'subscriber.create':             'Създаден абонат',
  'subscriber.update':             'Промяна на абонат',
  'subscriber.delete':             'Изтрит абонат',
  'subscriber.cashback.view':      'Преглед на кешбек на абонат',
  // Admin
  'admin.create':                  'Създаден администратор',
  'admin.update':                  'Промяна на администратор',
  'admin.delete':                  'Изтрит администратор',
  'admin.approve':                 'Одобрен администратор',
  'admin.status':                  'Промяна на статус на администратор',
  'admin.roles.delete':            'Премахната роля',
  'admin.role.add':                'Добавена роля',
  'admin.role.remove':             'Премахната роля',
  'admin.super.request':           'Заявка за Супер администратор',
  'admin.super.approve':           'Одобрена заявка за Супер администратор',
  'admin.super.reject':            'Отхвърлена заявка за Супер администратор',
  // Partner
  'partner.create':                'Създаден партньор',
  'partner.update':                'Промяна на партньор',
  'partner.approve':               'Одобрен партньор',
  'partner.reject':                'Отхвърлен партньор',
  'partner.status':                'Промяна на статус на партньор',
  // Location / QR
  'location.create':               'Създадена локация',
  'location.update':               'Промяна на локация',
  'location.delete':               'Изтрита локация',
  // Subscriber mutations
  'subscriber.cancel':             'Отменен абонамент',
  'subscriber.plan':               'Смяна на план',
  'subscriber.status':             'Промяна на статус на абонат',
  'subscriber.refund':             'Издадено възстановяване',
  'subscriber.sessions':           'Принудителен изход',
  'subscriber.account':            'Изтрит акаунт',
  'subscriber.restore':            'Възстановен акаунт',
  // Subscription mutations
  'subscription.create':           'Създаден абонамент',
  'subscription.update':           'Промяна на абонамент',
  'subscription.cancel':           'Отменен абонамент',
  'subscription.reactivate':       'Реактивиран абонамент',
  'subscription.resume':           'Подновен абонамент',
  'subscription.auto-renewal':     'Промяна на авт. подновяване',
  // Transaction
  'transaction.create':            'Създадена транзакция',
  'transaction.update':            'Промяна на транзакция',
  'transaction.approve':           'Одобрена транзакция',
  'transaction.reject':            'Отхвърлена транзакция',
  'transaction.wallet-adjust':     'Ръчна корекция в портфейл',
  // Receipt
  'receipt.create':                'Качена касова бележка',
  'receipt.update':                'Промяна на касова бележка',
  'receipt.approve':               'Одобрена касова бележка',
  'receipt.reject':                'Отхвърлена касова бележка',
  // Cashback
  'cashback.approve':              'Одобрен кешбек запис',
  'cashback.lock':                 'Заключен кешбек запис',
  'cashback.expire':               'Изтекъл кешбек запис',
  'cashback.pay':                  'Изплатен кешбек запис',
  'cashback.rate.update':          'Промяна на кешбек процент',
  'cashback.rate.delete':          'Изтрита бъдеща кешбек ставка',
  'cashback.rates.create':         'Нов набор от кешбек ставки',
  'cashback.mark-paid':            'Отбелязан като платен',
  'cashback.remind':               'Изпратен напомнителен имейл',
  'cashback.backfill-expiry':      'Попълване на изтичания',
  // Payout
  'payout.create':                 'Създадено плащане',
  'payout.update':                 'Промяна на плащане',
  'payout.approve':                'Одобрено плащане',
  'payout.reject':                 'Отхвърлено плащане',
  // Dispute cases
  'dispute.approve':               'Одобрен спор',
  'dispute.reject':                'Отхвърлен спор',
  'dispute.create':                'Открит спор',
  'dispute.update':                'Промяна на спор',
  'dispute.resolve':               'Разрешен спор',
  'dispute.close':                 'Затворен спор',
  'dispute.notes':                 'Бележка към спор',
  // Risk queue
  'risk.approve':                  'Одобрено от риск опашка',
  'risk.reject':                   'Отхвърлено от риск опашка',
  'risk.update':                   'Промяна на риск',
  'risk.flag':                     'Маркиран риск',
  // Receipt templates
  'receipt-template.create':       'Нов шаблон на касова бележка',
  'receipt-template.update':       'Промяна на шаблон на касова бележка',
  'receipt-template.delete':       'Деактивиран шаблон на касова бележка',
  // Limits / rules
  'limit.create':                  'Нов лимит',
  'limit.update':                  'Промяна на лимит',
  'limit.delete':                  'Изтрит лимит',
  // Reporting periods
  'period.lock':                   'Заключен отчетен период',
  'period.create':                 'Нов отчетен период',
  // System / Settings
  'system.put':                    'Промяна на системна настройка',
  'system.update':                 'Обновяване на системни настройки',
  'settings.update':               'Промяна на настройки',
  // Marketing
  'marketing.campaign.create':     'Създадена кампания',
  'marketing.campaign.update':     'Промяна на кампания',
  'marketing.template.create':     'Създаден шаблон',
  'marketing.template.update':     'Промяна на шаблон',
  'campaign.create':               'Създадена кампания',
  'campaign.update':               'Промяна на кампания',
  'template.create':               'Създаден шаблон',
  'template.update':               'Промяна на шаблон',
  // Help tickets
  'help.create':                   'Нова вътрешна заявка',
  'help.assign':                   'Присвоена вътрешна заявка',
  'help.update':                   'Промяна на вътрешна заявка',
  'help.reply':                    'Отговор на вътрешна заявка',
  // Legacy pre-normalisation strings
  'dispute-cases.create':          'Открит спор',
  'dispute-cases.update':          'Промяна на спор',
  'dispute-cases.notes':           'Бележка към спор',
  'risk-queue.approve':            'Одобрено от риск опашка',
  'risk-queue.reject':             'Отхвърлено от риск опашка',
  'receipt-templates.create':      'Нов шаблон на касова бележка',
  'receipt-templates.update':      'Промяна на шаблон на касова бележка',
  'receipt-templates.delete':      'Деактивиран шаблон на касова бележка',
  // Legacy method-based codes
  'pending-super.post':            'Заявка за Супер администратор',
  'pending-super.delete':          'Изтрита заявка за Супер администратор',
  'rates.post':                    'Нов набор от кешбек ставки',
  'rates.create':                  'Нов набор от кешбек ставки',
  'rates.delete':                  'Изтрит кешбек набор',
  'cashback.post':                 'Кешбек операция',
  'mark-paid.post':                'Отбелязан като платен',
  'admin.post':                    'Създаден администратор',
  'admin.patch':                   'Промяна на администратор',
  'partner.post':                  'Създаден партньор',
  'partner.patch':                 'Промяна на партньор',
  'system.post':                   'Промяна на системна настройка',
  'system.patch':                  'Промяна на системна настройка',
  'settings.post':                 'Промяна на настройки',
  'settings.patch':                'Промяна на настройки',
};

export function labelForAction(action: string): string {
  if (AUDIT_ACTION_LABEL[action]) return AUDIT_ACTION_LABEL[action];
  return action
    .split('.')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' → ');
}
