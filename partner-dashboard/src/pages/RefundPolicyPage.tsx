import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const TextContent = styled.div`
  line-height: 1.8;
  color: var(--color-text-secondary);

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 1rem;
    margin-top: 2.5rem;

    &:first-child {
      margin-top: 0;
    }
  }

  h3 {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.75rem;
    margin-top: 1.5rem;
  }

  p {
    margin-bottom: 1rem;
  }

  ul, ol {
    margin-bottom: 1rem;
    padding-left: 1.5rem;
  }

  li {
    margin-bottom: 0.5rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
  }

  th, td {
    border: 1px solid var(--color-border);
    padding: 0.75rem;
    text-align: left;
  }

  th {
    background: var(--color-background-secondary);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  a {
    color: var(--color-primary);
    text-decoration: underline;
  }

  .effective-date {
    background: var(--color-background-secondary);
    border-radius: 8px;
    padding: 1rem 1.5rem;
    margin-bottom: 2rem;
    font-size: 0.9rem;
  }
`;

const RefundPolicyPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Refund & Payment Policy"
      titleBg="Политика за Възстановяване и Плащания"
      subtitleEn="Payment methods, cancellation, and refund procedures"
      subtitleBg="Методи на плащане, отказ и процедури за възстановяване"
    >
      <ContentBlock>
        <TextContent>
          {language === 'bg' ? (
            <>
              <div className="effective-date">
                <strong>Дата на влизане в сила:</strong> 24 февруари 2026 г.<br />
                <strong>Последна актуализация:</strong> 24 февруари 2026 г.<br />
                <strong>Версия:</strong> 1.0
              </div>

              <h2>1. Методи на Плащане</h2>
              <p>BoomCard приема следните методи на плащане за абонаменти и зареждане на портфейла:</p>
              <table>
                <thead>
                  <tr>
                    <th>Метод</th>
                    <th>Доставчик</th>
                    <th>Поддържани карти/методи</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Дебитна/Кредитна карта</td>
                    <td>Paysera / Stripe</td>
                    <td>Visa, Mastercard, Maestro</td>
                  </tr>
                  <tr>
                    <td>Банков превод</td>
                    <td>Paysera</td>
                    <td>SEPA, български банки</td>
                  </tr>
                  <tr>
                    <td>Електронен портфейл</td>
                    <td>Paysera</td>
                    <td>Paysera портфейл</td>
                  </tr>
                </tbody>
              </table>
              <p>
                Всички плащания се обработват чрез сигурни, PCI DSS сертифицирани платежни шлюзове.
                BoomCard не съхранява данни за кредитни/дебитни карти на своите сървъри.
              </p>

              <h2>2. Валути</h2>
              <ul>
                <li><strong>Основна валута:</strong> Български лев (BGN)</li>
                <li><strong>Допълнителна валута:</strong> Евро (EUR)</li>
                <li>Цените се показват в избраната от вас валута. Конвертирането се извършва по текущия курс на платежния доставчик.</li>
                <li>Всички цени включват ДДС, когато е приложимо.</li>
              </ul>

              <h2>3. Автоматично Подновяване</h2>
              <ul>
                <li>Абонаментите PREMIUM и PLATINUM се подновяват автоматично в края на всеки период на фактуриране (седмичен, месечен или годишен).</li>
                <li>Ще получите имейл напомняне 7 дни преди датата на подновяване.</li>
                <li>За да предотвратите следващо таксуване, отменете абонамента преди датата на подновяване от настройките на профила си.</li>
                <li>BoomCard си запазва правото да променя цените с 30-дневно предизвестие по имейл. Ако не сте съгласни с промяната, можете да отмените абонамента преди влизането в сила на новата цена.</li>
              </ul>

              <h2>4. 14-Дневно Право на Отказ</h2>
              <p>
                Съгласно чл. 50-56 от Закона за защита на потребителите (ЗЗП) и Директива 2011/83/ЕС, имате право да се откажете от покупката в рамките на 14 дни:
              </p>
              <ul>
                <li><strong>Срок:</strong> 14 календарни дни от датата на покупка на абонамент.</li>
                <li><strong>Как:</strong> Изпратете заявка за отказ чрез настройките на профила си или по имейл до <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li><strong>Възстановяване:</strong> Пълно възстановяване на заплатената сума по оригиналния метод на плащане.</li>
                <li><strong>Условие:</strong> Ако сте използвали услуги с добавена стойност (кешбек, оферти на Партньори) през 14-те дни, може да бъде приспаднат пропорционален размер на стойността на използваните услуги.</li>
                <li>Не е необходимо да посочвате причина за отказа.</li>
              </ul>

              <h2>5. Отказ След 14-Дневния Период</h2>
              <ul>
                <li>Можете да отмените абонамента си по всяко време от настройките на профила или чрез <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li>Достъпът ви до Premium/Platinum функциите ще продължи до края на текущия период на фактуриране.</li>
                <li>Не се предоставя пропорционално възстановяване на средства за оставащия период.</li>
                <li>След изтичане на периода, акаунтът ви ще бъде преминат към безплатния STANDARD план.</li>
              </ul>

              <h2>6. Процес на Възстановяване на Средства</h2>
              <ol>
                <li><strong>Подаване на заявка:</strong> Чрез настройки на профила или имейл до <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li><strong>Обработка:</strong> Заявката се разглежда в рамките на 5 работни дни.</li>
                <li><strong>Възстановяване:</strong> Средствата се връщат по оригиналния метод на плащане в рамките на 5-10 банкови дни след одобрение.</li>
                <li><strong>Потвърждение:</strong> Ще получите имейл потвърждение за обработеното възстановяване.</li>
              </ol>
              <p>
                <strong>Забележка:</strong> Сроковете за банкови преводи зависят от банката получател и могат да варират.
              </p>

              <h2>7. Средства в Портфейла</h2>
              <table>
                <thead>
                  <tr>
                    <th>Тип средства</th>
                    <th>Възстановяване</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Заредени средства (top-up)</td>
                    <td>Подлежат на възстановяване при закриване на акаунт в рамките на 30 дни</td>
                  </tr>
                  <tr>
                    <td>Кешбек средства</td>
                    <td>Не подлежат на възстановяване при закриване на акаунт</td>
                  </tr>
                  <tr>
                    <td>Бонус средства / Промоции</td>
                    <td>Не подлежат на възстановяване</td>
                  </tr>
                </tbody>
              </table>
              <ul>
                <li>При закриване на акаунт, имате 30 дни да изтеглите заредените средства.</li>
                <li>След 30-дневния период, неизтеглените средства се считат за загубени.</li>
                <li>Кешбек и бонус средствата не могат да бъдат превърнати в налични пари и не подлежат на изтегляне.</li>
              </ul>

              <h2>8. Спорове и Жалби</h2>
              <p>Ако имате спор относно плащане или възстановяване:</p>
              <ol>
                <li><strong>Стъпка 1:</strong> Свържете се с нашия екип за поддръжка: <a href="mailto:support@boomcard.bg">support@boomcard.bg</a></li>
                <li><strong>Стъпка 2:</strong> Ако не получите задоволителен отговор в рамките на 14 дни, можете да подадете жалба до:
                  <ul>
                    <li><strong>Комисия за защита на потребителите (КЗП):</strong> <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a></li>
                  </ul>
                </li>
                <li><strong>Стъпка 3:</strong> Можете също да използвате платформата за онлайн решаване на спорове на ЕС:
                  <ul>
                    <li><strong>EU ODR:</strong> <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a></li>
                  </ul>
                </li>
              </ol>

              <h2>Контакти</h2>
              <p>
                За въпроси относно плащания и възстановявания:<br />
                <strong>Имейл:</strong> <a href="mailto:support@boomcard.bg">support@boomcard.bg</a><br />
                <strong>Уебсайт:</strong> <a href="https://boomcard.bg">boomcard.bg</a>
              </p>
            </>
          ) : (
            <>
              <div className="effective-date">
                <strong>Effective Date:</strong> February 24, 2026<br />
                <strong>Last Updated:</strong> February 24, 2026<br />
                <strong>Version:</strong> 1.0
              </div>

              <h2>1. Payment Methods</h2>
              <p>BoomCard accepts the following payment methods for subscriptions and wallet top-ups:</p>
              <table>
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Provider</th>
                    <th>Supported Cards/Methods</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Debit/Credit Card</td>
                    <td>Paysera / Stripe</td>
                    <td>Visa, Mastercard, Maestro</td>
                  </tr>
                  <tr>
                    <td>Bank Transfer</td>
                    <td>Paysera</td>
                    <td>SEPA, Bulgarian banks</td>
                  </tr>
                  <tr>
                    <td>E-Wallet</td>
                    <td>Paysera</td>
                    <td>Paysera wallet</td>
                  </tr>
                </tbody>
              </table>
              <p>
                All payments are processed through secure, PCI DSS certified payment gateways.
                BoomCard does not store credit/debit card data on its servers.
              </p>

              <h2>2. Currencies</h2>
              <ul>
                <li><strong>Primary currency:</strong> Bulgarian Lev (BGN)</li>
                <li><strong>Additional currency:</strong> Euro (EUR)</li>
                <li>Prices are displayed in your chosen currency. Conversion is performed at the payment provider's current exchange rate.</li>
                <li>All prices include VAT where applicable.</li>
              </ul>

              <h2>3. Auto-Renewal</h2>
              <ul>
                <li>PREMIUM and PLATINUM subscriptions auto-renew at the end of each billing period (weekly, monthly, or annual).</li>
                <li>You will receive an email reminder 7 days before the renewal date.</li>
                <li>To prevent the next charge, cancel your subscription before the renewal date from your profile settings.</li>
                <li>BoomCard reserves the right to change prices with 30 days' email notice. If you disagree with the change, you may cancel before the new price takes effect.</li>
              </ul>

              <h2>4. 14-Day Withdrawal Right</h2>
              <p>
                In accordance with Article 50-56 of the Bulgarian Consumer Protection Act and EU Directive 2011/83/EU, you have the right to withdraw from your purchase within 14 days:
              </p>
              <ul>
                <li><strong>Period:</strong> 14 calendar days from the date of subscription purchase.</li>
                <li><strong>How:</strong> Submit a withdrawal request through your profile settings or by email to <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li><strong>Refund:</strong> Full refund of the amount paid to the original payment method.</li>
                <li><strong>Condition:</strong> If you used value-added services (cashback, Partner offers) during the 14 days, a proportional amount for the services used may be deducted.</li>
                <li>You do not need to provide a reason for withdrawal.</li>
              </ul>

              <h2>5. Cancellation After the 14-Day Period</h2>
              <ul>
                <li>You may cancel your subscription at any time from your profile settings or via <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li>Your access to Premium/Platinum features will continue until the end of the current billing period.</li>
                <li>No prorated refund is provided for the remaining period.</li>
                <li>After the period expires, your account will revert to the free STANDARD plan.</li>
              </ul>

              <h2>6. Refund Process</h2>
              <ol>
                <li><strong>Submit request:</strong> Through profile settings or email to <a href="mailto:support@boomcard.bg">support@boomcard.bg</a>.</li>
                <li><strong>Processing:</strong> The request is reviewed within 5 business days.</li>
                <li><strong>Refund:</strong> Funds are returned to the original payment method within 5-10 banking days after approval.</li>
                <li><strong>Confirmation:</strong> You will receive an email confirmation for the processed refund.</li>
              </ol>
              <p>
                <strong>Note:</strong> Bank transfer timelines depend on the receiving bank and may vary.
              </p>

              <h2>7. Wallet Funds</h2>
              <table>
                <thead>
                  <tr>
                    <th>Fund Type</th>
                    <th>Refundability</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Top-up funds</td>
                    <td>Refundable upon account closure within 30 days</td>
                  </tr>
                  <tr>
                    <td>Cashback funds</td>
                    <td>Non-refundable upon account closure</td>
                  </tr>
                  <tr>
                    <td>Bonus funds / Promotions</td>
                    <td>Non-refundable</td>
                  </tr>
                </tbody>
              </table>
              <ul>
                <li>Upon account closure, you have 30 days to withdraw top-up funds.</li>
                <li>After the 30-day period, unclaimed funds are forfeited.</li>
                <li>Cashback and bonus funds cannot be converted to cash and are not withdrawable.</li>
              </ul>

              <h2>8. Disputes & Complaints</h2>
              <p>If you have a dispute regarding a payment or refund:</p>
              <ol>
                <li><strong>Step 1:</strong> Contact our support team: <a href="mailto:support@boomcard.bg">support@boomcard.bg</a></li>
                <li><strong>Step 2:</strong> If you do not receive a satisfactory response within 14 days, you may file a complaint with:
                  <ul>
                    <li><strong>Commission for Consumer Protection (KZP):</strong> <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a></li>
                  </ul>
                </li>
                <li><strong>Step 3:</strong> You may also use the EU's Online Dispute Resolution platform:
                  <ul>
                    <li><strong>EU ODR:</strong> <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a></li>
                  </ul>
                </li>
              </ol>

              <h2>Contact</h2>
              <p>
                For questions about payments and refunds:<br />
                <strong>Email:</strong> <a href="mailto:support@boomcard.bg">support@boomcard.bg</a><br />
                <strong>Website:</strong> <a href="https://boomcard.bg">boomcard.bg</a>
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default RefundPolicyPage;
