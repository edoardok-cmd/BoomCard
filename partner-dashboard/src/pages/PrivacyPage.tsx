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

const PrivacyPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Privacy Policy"
      titleBg="Политика за Поверителност"
      subtitleEn="How we collect, use, and protect your personal data under GDPR"
      subtitleBg="Как събираме, използваме и защитаваме личните ви данни съгласно GDPR"
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

              <h2>1. Администратор на Лични Данни</h2>
              <p>
                Администратор на вашите лични данни е BoomCard, със седалище в София, България.
              </p>
              <p>
                <strong>Длъжностно лице по защита на данните (DPO):</strong><br />
                Имейл: <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a><br />
                Адрес: София, България
              </p>

              <h2>2. Данни, Които Събираме</h2>

              <h3>2.1. Данни, предоставени от вас</h3>
              <ul>
                <li><strong>Регистрационни данни:</strong> име, фамилия, имейл адрес, телефонен номер, парола (съхранявана криптирана)</li>
                <li><strong>Данни за профила:</strong> профилна снимка, предпочитания за език</li>
                <li><strong>Данни за плащане:</strong> обработват се от Paysera (Литва, ЕС) и Stripe (САЩ, чрез EU-US Data Privacy Framework). BoomCard не съхранява номера на карти.</li>
                <li><strong>Потребителско съдържание:</strong> ревюта, снимки на касови бележки, оценки</li>
              </ul>

              <h3>2.2. Данни, събирани автоматично</h3>
              <ul>
                <li><strong>Данни за използване:</strong> страници, посетени в Платформата, действия, време на посещение</li>
                <li><strong>GPS данни:</strong> при сканиране на BOOM стикер (само с ваше разрешение)</li>
                <li><strong>Данни за устройството:</strong> тип браузър, операционна система, IP адрес, идентификатор на устройството</li>
                <li><strong>Бисквитки:</strong> вижте нашата <a href="/cookies">Политика за Бисквитки</a></li>
              </ul>

              <h2>3. Правно Основание за Обработка (чл. 6 GDPR)</h2>
              <table>
                <thead>
                  <tr>
                    <th>Правно основание</th>
                    <th>Цел на обработка</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Изпълнение на договор</strong> (чл. 6(1)(б))</td>
                    <td>Предоставяне на услугите: регистрация, акаунт, портфейл, кешбек, абонаменти, резервации</td>
                  </tr>
                  <tr>
                    <td><strong>Законен интерес</strong> (чл. 6(1)(е))</td>
                    <td>Предотвратяване на измами, сигурност на системата, подобряване на услугите, анализ на използването</td>
                  </tr>
                  <tr>
                    <td><strong>Съгласие</strong> (чл. 6(1)(а))</td>
                    <td>Маркетингови комуникации, бисквитки за анализ и маркетинг, GPS проследяване</td>
                  </tr>
                  <tr>
                    <td><strong>Законово задължение</strong> (чл. 6(1)(в))</td>
                    <td>Данъчна документация, счетоводни записи, отговор на официални искания</td>
                  </tr>
                </tbody>
              </table>

              <h2>4. Цели на Обработката</h2>
              <ul>
                <li>Предоставяне и управление на услугите на Платформата</li>
                <li>Обработка на плащания и абонаменти</li>
                <li>Изчисляване и кредитиране на кешбек</li>
                <li>Предотвратяване на измами и злоупотреби (анти-фрод проверки, OCR валидация, GPS верификация)</li>
                <li>Комуникация относно вашия акаунт (потвърждения, известия, промени в услугите)</li>
                <li>Маркетингови комуникации (само с ваше съгласие)</li>
                <li>Анализ и подобряване на Платформата</li>
                <li>Изпълнение на законови задължения</li>
              </ul>

              <h2>5. Споделяне с Трети Страни</h2>
              <p>Ние споделяме вашите данни само с доверени доставчици на услуги:</p>
              <table>
                <thead>
                  <tr>
                    <th>Доставчик</th>
                    <th>Цел</th>
                    <th>Местоположение</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Paysera</td>
                    <td>Обработка на плащания</td>
                    <td>Литва (ЕС)</td>
                  </tr>
                  <tr>
                    <td>Stripe</td>
                    <td>Обработка на плащания</td>
                    <td>САЩ (EU-US Data Privacy Framework)</td>
                  </tr>
                  <tr>
                    <td>Amazon Web Services (AWS)</td>
                    <td>Хостинг, съхранение на файлове (S3)</td>
                    <td>ЕС (Франкфурт, eu-central-1)</td>
                  </tr>
                  <tr>
                    <td>Resend</td>
                    <td>Изпращане на имейли</td>
                    <td>САЩ (Стандартни договорни клаузи)</td>
                  </tr>
                  <tr>
                    <td>Sentry</td>
                    <td>Наблюдение на грешки</td>
                    <td>САЩ (Стандартни договорни клаузи)</td>
                  </tr>
                  <tr>
                    <td>Google Analytics</td>
                    <td>Уеб анализ (само с ваше съгласие)</td>
                    <td>САЩ (EU-US Data Privacy Framework)</td>
                  </tr>
                </tbody>
              </table>
              <p>Ние не продаваме вашите лични данни на трети страни.</p>

              <h2>6. Международно Предаване на Данни</h2>
              <p>
                Когато данните ви се предават извън Европейското икономическо пространство (ЕИП), ние осигуряваме адекватна защита чрез:
              </p>
              <ul>
                <li><strong>EU-US Data Privacy Framework</strong> — за доставчици, сертифицирани по рамката (Stripe, Google)</li>
                <li><strong>Стандартни договорни клаузи (SCC)</strong> — одобрени от Европейската комисия (Resend, Sentry)</li>
              </ul>

              <h2>7. Срокове за Съхранение</h2>
              <table>
                <thead>
                  <tr>
                    <th>Категория данни</th>
                    <th>Срок на съхранение</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Данни за акаунт</td>
                    <td>Докато акаунтът е активен + 30 дни след изтриване</td>
                  </tr>
                  <tr>
                    <td>Данни за транзакции</td>
                    <td>5 години (законово изискване за счетоводство)</td>
                  </tr>
                  <tr>
                    <td>Касови бележки и OCR данни</td>
                    <td>2 години след обработка</td>
                  </tr>
                  <tr>
                    <td>Логове за сигурност</td>
                    <td>1 година</td>
                  </tr>
                  <tr>
                    <td>Маркетингови съгласия</td>
                    <td>До оттегляне на съгласието</td>
                  </tr>
                  <tr>
                    <td>Данни за бисквитки</td>
                    <td>Според Политиката за бисквитки (до 1 година)</td>
                  </tr>
                </tbody>
              </table>

              <h2>8. Вашите Права по GDPR</h2>
              <p>Съгласно Общия регламент за защита на данните (Регламент (ЕС) 2016/679), имате следните права:</p>
              <ul>
                <li><strong>Право на достъп (чл. 15):</strong> Да получите копие на вашите лични данни. Използвайте функцията "Експорт на данни" в настройките на профила ви.</li>
                <li><strong>Право на коригиране (чл. 16):</strong> Да коригирате неточни данни чрез настройките на профила си.</li>
                <li><strong>Право на изтриване (чл. 17):</strong> Да поискате изтриване на акаунта и данните си. Използвайте функцията "Изтриване на акаунт" в настройките.</li>
                <li><strong>Право на ограничаване (чл. 18):</strong> Да ограничите обработката на данните си при определени обстоятелства.</li>
                <li><strong>Право на преносимост (чл. 20):</strong> Да получите данните си в структуриран, машинно-четим формат (JSON).</li>
                <li><strong>Право на възражение (чл. 21):</strong> Да възразите срещу обработката на данните ви за маркетингови цели или на база законен интерес.</li>
                <li><strong>Право на оттегляне на съгласие:</strong> Да оттеглите съгласието си по всяко време, без това да засяга законността на обработката, извършена преди оттеглянето.</li>
              </ul>
              <p>
                <strong>Как да упражните правата си:</strong> Изпратете заявка до <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a> или използвайте вградените функции в настройките на профила ви. Ще отговорим в рамките на 30 дни.
              </p>

              <h2>9. Сигурност на Данните</h2>
              <p>Прилагаме следните технически и организационни мерки за защита на данните ви:</p>
              <ul>
                <li><strong>Криптиране при пренос:</strong> TLS 1.2+ за всички комуникации</li>
                <li><strong>Хеширане на пароли:</strong> bcrypt с 12 salt rounds</li>
                <li><strong>HTTP заглавки за сигурност:</strong> Helmet.js (CSP, HSTS, X-Frame-Options)</li>
                <li><strong>JWT токени:</strong> Кратък живот (15 мин. достъп, 7 дни обновяване)</li>
                <li><strong>Ограничаване на заявки:</strong> Rate limiting за предотвратяване на brute-force атаки</li>
                <li><strong>Мониторинг:</strong> Sentry за наблюдение на грешки и инциденти</li>
              </ul>

              <h2>10. Надзорен Орган</h2>
              <p>
                Ако считате, че обработката на вашите лични данни нарушава GDPR, имате право да подадете жалба до:
              </p>
              <p>
                <strong>Комисия за защита на личните данни (КЗЛД)</strong><br />
                Адрес: бул. "Проф. Цветан Лазаров" 2, 1592 София, България<br />
                Уебсайт: <a href="https://cpdp.bg" target="_blank" rel="noopener noreferrer">cpdp.bg</a><br />
                Имейл: <a href="mailto:kzld@cpdp.bg">kzld@cpdp.bg</a><br />
                Тел: +359 2 915 3580
              </p>

              <h2>Лица под 18 години</h2>
              <p>
                BoomCard не е предназначен за лица под 18 години. Ние съзнателно не събираме лични данни от деца. Ако установим, че сме събрали данни от лице под 18 години, ще ги изтрием незабавно.
              </p>

              <h2>Контакти</h2>
              <p>
                За въпроси относно тази Политика за поверителност:<br />
                <strong>DPO имейл:</strong> <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a><br />
                <strong>Поддръжка:</strong> <a href="mailto:office@boomcard.bg">office@boomcard.bg</a><br />
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

              <h2>1. Data Controller</h2>
              <p>
                The controller of your personal data is BoomCard, with registered office in Sofia, Bulgaria.
              </p>
              <p>
                <strong>Data Protection Officer (DPO):</strong><br />
                Email: <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a><br />
                Address: Sofia, Bulgaria
              </p>

              <h2>2. Data We Collect</h2>

              <h3>2.1. Data you provide</h3>
              <ul>
                <li><strong>Registration data:</strong> first name, last name, email address, phone number, password (stored encrypted)</li>
                <li><strong>Profile data:</strong> profile photo, language preferences</li>
                <li><strong>Payment data:</strong> processed by Paysera (Lithuania, EU) and Stripe (USA, via EU-US Data Privacy Framework). BoomCard does not store card numbers.</li>
                <li><strong>User content:</strong> reviews, receipt photos, ratings</li>
              </ul>

              <h3>2.2. Automatically collected data</h3>
              <ul>
                <li><strong>Usage data:</strong> pages visited on the Platform, actions taken, visit times</li>
                <li><strong>GPS data:</strong> when scanning a BOOM sticker (only with your permission)</li>
                <li><strong>Device data:</strong> browser type, operating system, IP address, device identifier</li>
                <li><strong>Cookies:</strong> see our <a href="/cookies">Cookie Policy</a></li>
              </ul>

              <h2>3. Legal Basis for Processing (Art. 6 GDPR)</h2>
              <table>
                <thead>
                  <tr>
                    <th>Legal Basis</th>
                    <th>Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Performance of contract</strong> (Art. 6(1)(b))</td>
                    <td>Providing services: registration, account, wallet, cashback, subscriptions, bookings</td>
                  </tr>
                  <tr>
                    <td><strong>Legitimate interest</strong> (Art. 6(1)(f))</td>
                    <td>Fraud prevention, system security, service improvement, usage analysis</td>
                  </tr>
                  <tr>
                    <td><strong>Consent</strong> (Art. 6(1)(a))</td>
                    <td>Marketing communications, analytics and marketing cookies, GPS tracking</td>
                  </tr>
                  <tr>
                    <td><strong>Legal obligation</strong> (Art. 6(1)(c))</td>
                    <td>Tax documentation, accounting records, responding to official requests</td>
                  </tr>
                </tbody>
              </table>

              <h2>4. Purpose of Processing</h2>
              <ul>
                <li>Providing and managing Platform services</li>
                <li>Processing payments and subscriptions</li>
                <li>Calculating and crediting cashback</li>
                <li>Fraud prevention and abuse detection (anti-fraud checks, OCR validation, GPS verification)</li>
                <li>Communication about your account (confirmations, notifications, service changes)</li>
                <li>Marketing communications (only with your consent)</li>
                <li>Platform analysis and improvement</li>
                <li>Fulfilling legal obligations</li>
              </ul>

              <h2>5. Third-Party Sharing</h2>
              <p>We share your data only with trusted service providers:</p>
              <table>
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th>Purpose</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Paysera</td>
                    <td>Payment processing</td>
                    <td>Lithuania (EU)</td>
                  </tr>
                  <tr>
                    <td>Stripe</td>
                    <td>Payment processing</td>
                    <td>USA (EU-US Data Privacy Framework)</td>
                  </tr>
                  <tr>
                    <td>Amazon Web Services (AWS)</td>
                    <td>Hosting, file storage (S3)</td>
                    <td>EU (Frankfurt, eu-central-1)</td>
                  </tr>
                  <tr>
                    <td>Resend</td>
                    <td>Email delivery</td>
                    <td>USA (Standard Contractual Clauses)</td>
                  </tr>
                  <tr>
                    <td>Sentry</td>
                    <td>Error monitoring</td>
                    <td>USA (Standard Contractual Clauses)</td>
                  </tr>
                  <tr>
                    <td>Google Analytics</td>
                    <td>Web analytics (only with your consent)</td>
                    <td>USA (EU-US Data Privacy Framework)</td>
                  </tr>
                </tbody>
              </table>
              <p>We do not sell your personal data to third parties.</p>

              <h2>6. International Data Transfers</h2>
              <p>
                When your data is transferred outside the European Economic Area (EEA), we ensure adequate protection through:
              </p>
              <ul>
                <li><strong>EU-US Data Privacy Framework</strong> — for providers certified under the framework (Stripe, Google)</li>
                <li><strong>Standard Contractual Clauses (SCC)</strong> — approved by the European Commission (Resend, Sentry)</li>
              </ul>

              <h2>7. Retention Periods</h2>
              <table>
                <thead>
                  <tr>
                    <th>Data Category</th>
                    <th>Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Account data</td>
                    <td>While account is active + 30 days after deletion</td>
                  </tr>
                  <tr>
                    <td>Transaction data</td>
                    <td>5 years (legal accounting requirement)</td>
                  </tr>
                  <tr>
                    <td>Receipts and OCR data</td>
                    <td>2 years after processing</td>
                  </tr>
                  <tr>
                    <td>Security logs</td>
                    <td>1 year</td>
                  </tr>
                  <tr>
                    <td>Marketing consents</td>
                    <td>Until consent is withdrawn</td>
                  </tr>
                  <tr>
                    <td>Cookie data</td>
                    <td>Per Cookie Policy (up to 1 year)</td>
                  </tr>
                </tbody>
              </table>

              <h2>8. Your Rights Under GDPR</h2>
              <p>Under the General Data Protection Regulation (Regulation (EU) 2016/679), you have the following rights:</p>
              <ul>
                <li><strong>Right of access (Art. 15):</strong> Obtain a copy of your personal data. Use the "Data Export" feature in your profile settings.</li>
                <li><strong>Right to rectification (Art. 16):</strong> Correct inaccurate data through your profile settings.</li>
                <li><strong>Right to erasure (Art. 17):</strong> Request deletion of your account and data. Use the "Delete Account" feature in settings.</li>
                <li><strong>Right to restriction (Art. 18):</strong> Restrict processing of your data under certain circumstances.</li>
                <li><strong>Right to data portability (Art. 20):</strong> Receive your data in a structured, machine-readable format (JSON).</li>
                <li><strong>Right to object (Art. 21):</strong> Object to processing of your data for marketing purposes or based on legitimate interest.</li>
                <li><strong>Right to withdraw consent:</strong> Withdraw your consent at any time, without affecting the lawfulness of processing carried out before withdrawal.</li>
              </ul>
              <p>
                <strong>How to exercise your rights:</strong> Send a request to <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a> or use the built-in features in your profile settings. We will respond within 30 days.
              </p>

              <h2>9. Data Security</h2>
              <p>We implement the following technical and organizational measures to protect your data:</p>
              <ul>
                <li><strong>Encryption in transit:</strong> TLS 1.2+ for all communications</li>
                <li><strong>Password hashing:</strong> bcrypt with 12 salt rounds</li>
                <li><strong>HTTP security headers:</strong> Helmet.js (CSP, HSTS, X-Frame-Options)</li>
                <li><strong>JWT tokens:</strong> Short-lived (15 min access, 7 days refresh)</li>
                <li><strong>Rate limiting:</strong> To prevent brute-force attacks</li>
                <li><strong>Monitoring:</strong> Sentry for error and incident monitoring</li>
              </ul>

              <h2>10. Supervisory Authority</h2>
              <p>
                If you believe the processing of your personal data violates GDPR, you have the right to lodge a complaint with:
              </p>
              <p>
                <strong>Commission for Personal Data Protection (CPDP)</strong><br />
                Address: 2 Prof. Tsvetan Lazarov Blvd., 1592 Sofia, Bulgaria<br />
                Website: <a href="https://cpdp.bg" target="_blank" rel="noopener noreferrer">cpdp.bg</a><br />
                Email: <a href="mailto:kzld@cpdp.bg">kzld@cpdp.bg</a><br />
                Phone: +359 2 915 3580
              </p>

              <h2>Children's Privacy</h2>
              <p>
                BoomCard is not intended for persons under 18 years of age. We do not knowingly collect personal data from children. If we learn that we have collected data from a person under 18, we will delete it immediately.
              </p>

              <h2>Contact</h2>
              <p>
                For questions about this Privacy Policy:<br />
                <strong>DPO Email:</strong> <a href="mailto:privacy@boomcard.bg">privacy@boomcard.bg</a><br />
                <strong>Support:</strong> <a href="mailto:office@boomcard.bg">office@boomcard.bg</a><br />
                <strong>Website:</strong> <a href="https://boomcard.bg">boomcard.bg</a>
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default PrivacyPage;
