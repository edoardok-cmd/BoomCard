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

const TermsPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="Terms & Conditions"
      titleBg="Общи Условия"
      subtitleEn="Please read these terms carefully before using BoomCard"
      subtitleBg="Моля, прочетете внимателно тези условия преди да използвате BoomCard"
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

              <h2>1. Дефиниции</h2>
              <p>За целите на настоящите Общи условия, следните термини имат посоченото значение:</p>
              <ul>
                <li><strong>Платформа</strong> — уебсайтът boomcard.bg, мобилното приложение BoomCard и всички свързани услуги, предоставяни от BoomCard.</li>
                <li><strong>Потребител</strong> — физическо лице, навършило 18 години, което е регистрирано в Платформата и използва услугите на BoomCard.</li>
                <li><strong>Партньор</strong> — търговски обект (ресторант, хотел, магазин или друг търговец), регистриран в Платформата и предлагащ отстъпки и кешбек на Потребителите.</li>
                <li><strong>BoomCard карта</strong> — виртуална карта за лоялност, генерирана при регистрация, с уникален QR код.</li>
                <li><strong>BOOM стикер</strong> — физически NFC/QR стикер, поставен на определено място в обект на Партньор, чрез който Потребителите инициират транзакции.</li>
                <li><strong>Кешбек (Cashback)</strong> — парично възстановяване (в проценти от сумата на покупка), кредитирано в електронния портфейл на Потребителя след валидирана покупка.</li>
                <li><strong>Портфейл (Wallet)</strong> — виртуална сметка в Платформата, в която се съхраняват кешбек средства и потребителски заредени суми.</li>
                <li><strong>Абонаментен план</strong> — платен план (Basic, Premium Седмичен, Premium Месечен), определящ нивото на кешбек и достъп до функционалности.</li>
              </ul>

              <h2>2. Регистрация и Акаунт</h2>
              <p>За да използвате услугите на BoomCard, трябва да създадете акаунт.</p>
              <ul>
                <li>Трябва да сте навършили 18 години, за да се регистрирате.</li>
                <li>Всяко лице има право на един акаунт. Създаването на множество акаунти е забранено и може да доведе до спиране на всички свързани акаунти.</li>
                <li>Вие сте отговорни за поддържането на поверителността на вашата парола и за всички действия, извършени чрез вашия акаунт.</li>
                <li>Предоставената при регистрация информация трябва да е вярна, пълна и актуална.</li>
                <li>BoomCard си запазва правото да откаже регистрация или да прекрати акаунт по своя преценка.</li>
              </ul>

              <h2>3. Абонаментни Планове и Плащания</h2>
              <p>BoomCard предлага следните абонаментни планове:</p>
              <table>
                <thead>
                  <tr>
                    <th>План</th>
                    <th>Кешбек</th>
                    <th>Цена</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Basic</td>
                    <td>До 10%</td>
                    <td>€8.99/месец</td>
                  </tr>
                  <tr>
                    <td>Premium Седмичен</td>
                    <td>До 20%</td>
                    <td>€6.99/седмица</td>
                  </tr>
                  <tr>
                    <td>Premium Месечен</td>
                    <td>До 20%</td>
                    <td>€13.99/месец</td>
                  </tr>
                </tbody>
              </table>
              <ul>
                <li>Плащанията се обработват чрез Paysera и/или Stripe. BoomCard не съхранява данни за кредитни/дебитни карти.</li>
                <li>Абонаментите се подновяват автоматично в края на всеки период на фактуриране, освен ако не бъдат отменени.</li>
                <li>Цените са в български лева (BGN) или евро (EUR) и включват ДДС, когато е приложимо.</li>
                <li>BoomCard си запазва правото да променя цените с 30-дневно предизвестие.</li>
              </ul>

              <h2>4. Отказ и Възстановяване на Средства</h2>
              <p>Съгласно чл. 50-56 от Закона за защита на потребителите (ЗЗП) и Директива 2011/83/ЕС:</p>
              <ul>
                <li><strong>14-дневно право на отказ:</strong> Имате право да се откажете от абонамента в рамките на 14 дни от датата на покупка, без да посочвате причина, и да получите пълно възстановяване на средствата.</li>
                <li><strong>Отказ след 14 дни:</strong> Можете да отмените абонамента си по всяко време. Достъпът ви ще продължи до края на текущия период на фактуриране, но не се предоставя пропорционално възстановяване.</li>
                <li><strong>Процес на възстановяване:</strong> Заявките се обработват в рамките на 5 работни дни. Средствата се възстановяват по оригиналния метод на плащане в рамките на 5-10 банкови дни.</li>
              </ul>
              <p>За пълни подробности вижте нашата <a href="/refund-policy">Политика за Възстановяване на Средства</a>.</p>

              <h2>5. Система на Портфейла</h2>
              <ul>
                <li><strong>Зареждане:</strong> Можете да заредите портфейла си чрез банков превод, карта или електронен портфейл.</li>
                <li><strong>Кешбек:</strong> Кешбек средствата се кредитират автоматично след валидиране на покупка чрез BOOM стикер или касова бележка.</li>
                <li><strong>Процентът на кешбек зависи от:</strong> вашия абонаментен план и отстъпката, предлагана от конкретния Партньор (фиксирана матрица). Basic план: до 10%; Premium планове: до 20%.</li>
                <li><strong>Минимален праг за изплащане:</strong> €10 за Premium Седмичен, €15 за Premium Месечен, €20 за Basic. Изплащането се обработва по регистрираната карта в рамките на 3–5 работни дни след достигане на прага.</li>
                <li><strong>Валидност на кешбека:</strong> Всяка одобрена транзакция носи 60-дневен период на валидност от датата на одобрение. Кешбекът изтича на каскаден принцип — най-старите суми изтичат първи.</li>
                <li><strong>Надграждане на план:</strong> При надграждане от Premium Седмичен към Premium Месечен се приспада 100% от остатъчната стойност на седмичния план. При надграждане от Basic към Premium се приспада 60% от остатъчната стойност.</li>
                <li><strong>Лимити:</strong> BoomCard може да определи максимален дневен/месечен лимит за кешбек транзакции, за да осигури целостта на системата.</li>
                <li><strong>Средствата в портфейла не генерират лихва</strong> и не представляват банков депозит.</li>
              </ul>

              <h2>6. BOOM Стикери и Касови Бележки</h2>
              <ul>
                <li><strong>Сканиране:</strong> Потребителите сканират BOOM стикер в обект на Партньор, за да инициират транзакция за кешбек.</li>
                <li><strong>GPS валидация:</strong> Платформата може да провери GPS локацията ви, за да потвърди присъствието ви в обекта.</li>
                <li><strong>Касова бележка:</strong> Може да се изиска качване на снимка на касовата бележка за валидиране на сумата и търговеца.</li>
                <li><strong>Срок за качване:</strong> Касовата бележка трябва да бъде качена преди напускане на заведението или малко след плащането. Прозорецът за качване се затваря в 6:00 ч. на следващия ден. Бележки, качени повече от 1 час след издаването им, може да бъдат насочени към ръчен преглед.</li>
                <li><strong>OCR обработка:</strong> Касовите бележки се обработват чрез автоматично разпознаване на текст (OCR) и проверка за измами.</li>
                <li><strong>Анти-фрод:</strong> Опити за злоупотреба (фалшиви бележки, множество сканирания, манипулиране на данни) могат да доведат до незабавно спиране на акаунта и загуба на натрупания кешбек.</li>
              </ul>

              <h2>7. Оферти и Партньори</h2>
              <ul>
                <li>BoomCard действа като посредник между Потребителите и Партньорите. BoomCard не е страна по договорите за покупко-продажба между Потребител и Партньор.</li>
                <li>Отговорността за качеството на стоките и услугите е изцяло на съответния Партньор.</li>
                <li>Офертите са обект на наличност и могат да бъдат променяни или прекратявани от Партньора по всяко време.</li>
                <li>BoomCard не гарантира минимална отстъпка или кешбек процент от конкретен Партньор.</li>
              </ul>

              <h2>8. Интелектуална Собственост</h2>
              <ul>
                <li>Всички права върху Платформата, включително дизайн, лого, търговски марки, софтуер и съдържание, са собственост на BoomCard или са лицензирани от трети страни.</li>
                <li>Потребителите получават ограничен, неизключителен, непрехвърляем лиценз за лична употреба на Платформата.</li>
                <li>Съдържание, качено от Потребителя (ревюта, снимки на бележки), остава собственост на Потребителя, но с предоставяне на BoomCard неизключително право за използване за целите на Платформата.</li>
                <li>Забранено е копиране, модифициране, обратен инженеринг или разпространение на компоненти на Платформата без писмено разрешение.</li>
              </ul>

              <h2>9. Ограничаване на Отговорността</h2>
              <ul>
                <li>Платформата се предоставя "както е" (as-is) и "при наличност" (as-available), без гаранции за непрекъснатост или безгрешност.</li>
                <li>BoomCard не носи отговорност за загуби, причинени от неоторизиран достъп до акаунта ви поради ваша небрежност.</li>
                <li>Максималната отговорност на BoomCard при какъвто и да е иск е ограничена до сумата на абонаментните такси, платени от Потребителя през последните 12 месеца.</li>
                <li>BoomCard не носи отговорност за действия или бездействия на Партньори, включително качеството на техните стоки или услуги.</li>
                <li>Това ограничение не засяга задължителните права на потребителите съгласно приложимото право на ЕС и българското законодателство.</li>
              </ul>

              <h2>10. Прекратяване</h2>
              <ul>
                <li><strong>От Потребителя:</strong> Можете да изтриете акаунта си по всяко време от настройките на профила или чрез заявка до office@boomcard.bg.</li>
                <li><strong>От BoomCard:</strong> BoomCard може да спре или прекрати акаунта ви при нарушение на тези условия, подозрение за измама, неактивност над 12 месеца или по искане на компетентен орган.</li>
                <li><strong>Последици:</strong> При прекратяване губите достъп до Платформата. Средствата от заредения портфейл (без кешбек) могат да бъдат изтеглени в рамките на 30 дни. Кешбек средствата не подлежат на възстановяване.</li>
              </ul>

              <h2>11. Приложимо Право и Спорове</h2>
              <ul>
                <li>Настоящите Общи условия се уреждат от законодателството на Република България.</li>
                <li>Споровете ще бъдат решавани чрез преговори. При непостигане на съгласие, потребителите могат да се обърнат към:</li>
                <li><strong>Комисия за защита на потребителите (КЗП):</strong> <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a></li>
                <li><strong>Платформа за онлайн решаване на спорове на ЕС (ODR):</strong> <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a></li>
                <li>За неуредени спорове, компетентният съд е Софийски районен съд, освен ако приложимото право не предвижда друго.</li>
              </ul>

              <h2>12. Промени в Общите Условия</h2>
              <ul>
                <li>BoomCard си запазва правото да актуализира тези Общи условия.</li>
                <li>При съществени промени, ще бъдете уведомени чрез имейл и/или известие в Платформата поне 30 дни преди влизането им в сила.</li>
                <li>Продължаването на използването на Платформата след влизането в сила на промените означава вашето съгласие с актуализираните условия.</li>
                <li>Ако не сте съгласни с промените, можете да прекратите акаунта си преди влизането им в сила.</li>
              </ul>

              <h2>Контакти</h2>
              <p>
                За въпроси относно тези Общи условия:<br />
                <strong>Имейл:</strong> <a href="mailto:office@boomcard.bg">office@boomcard.bg</a><br />
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

              <h2>1. Definitions</h2>
              <p>For the purposes of these Terms & Conditions, the following terms have the meanings set out below:</p>
              <ul>
                <li><strong>Platform</strong> — the website boomcard.bg, the BoomCard mobile application, and all related services provided by BoomCard.</li>
                <li><strong>User</strong> — a natural person aged 18 or above who has registered on the Platform and uses BoomCard services.</li>
                <li><strong>Partner</strong> — a commercial establishment (restaurant, hotel, shop, or other merchant) registered on the Platform and offering discounts and cashback to Users.</li>
                <li><strong>BoomCard Card</strong> — a virtual loyalty card generated upon registration, with a unique QR code.</li>
                <li><strong>BOOM Sticker</strong> — a physical NFC/QR sticker placed at a designated location in a Partner's venue, through which Users initiate transactions.</li>
                <li><strong>Cashback</strong> — a monetary return (as a percentage of the purchase amount) credited to the User's electronic wallet after a validated purchase.</li>
                <li><strong>Wallet</strong> — a virtual account on the Platform where cashback funds and user-loaded balances are stored.</li>
                <li><strong>Subscription Plan</strong> — a paid plan (Basic, Premium Weekly, Premium Monthly) determining the cashback rate and feature access.</li>
              </ul>

              <h2>2. Registration & Account</h2>
              <p>To use BoomCard services, you must create an account.</p>
              <ul>
                <li>You must be at least 18 years of age to register.</li>
                <li>Each person is entitled to one account only. Creating multiple accounts is prohibited and may result in suspension of all associated accounts.</li>
                <li>You are responsible for maintaining the confidentiality of your password and for all activities conducted through your account.</li>
                <li>Information provided at registration must be truthful, complete, and up-to-date.</li>
                <li>BoomCard reserves the right to refuse registration or terminate an account at its discretion.</li>
              </ul>

              <h2>3. Subscription Plans & Payments</h2>
              <p>BoomCard offers the following subscription plans:</p>
              <table>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Cashback</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Basic</td>
                    <td>Up to 10%</td>
                    <td>€8.99/month</td>
                  </tr>
                  <tr>
                    <td>Premium Weekly</td>
                    <td>Up to 20%</td>
                    <td>€6.99/week</td>
                  </tr>
                  <tr>
                    <td>Premium Monthly</td>
                    <td>Up to 20%</td>
                    <td>€13.99/month</td>
                  </tr>
                </tbody>
              </table>
              <ul>
                <li>Payments are processed through Paysera and/or Stripe. BoomCard does not store credit/debit card data.</li>
                <li>Subscriptions auto-renew at the end of each billing period unless cancelled.</li>
                <li>Prices are in Bulgarian Lev (BGN) or Euro (EUR) and include VAT where applicable.</li>
                <li>BoomCard reserves the right to change prices with 30 days' prior notice.</li>
              </ul>

              <h2>4. Cancellation & Refunds</h2>
              <p>In accordance with Article 50-56 of the Bulgarian Consumer Protection Act and EU Directive 2011/83/EU:</p>
              <ul>
                <li><strong>14-day withdrawal right:</strong> You have the right to withdraw from your subscription within 14 days of purchase, without giving a reason, and receive a full refund.</li>
                <li><strong>Cancellation after 14 days:</strong> You may cancel your subscription at any time. Your access will continue until the end of the current billing period, but no prorated refund will be provided.</li>
                <li><strong>Refund process:</strong> Requests are processed within 5 business days. Funds are returned to the original payment method within 5-10 banking days.</li>
              </ul>
              <p>For full details, see our <a href="/refund-policy">Refund & Payment Policy</a>.</p>

              <h2>5. Wallet System</h2>
              <ul>
                <li><strong>Top-up:</strong> You can top up your wallet via bank transfer, card, or e-wallet.</li>
                <li><strong>Cashback:</strong> Cashback is automatically credited after a purchase is validated through a BOOM sticker or receipt scan.</li>
                <li><strong>The cashback rate depends on:</strong> your subscription plan and the discount offered by the specific Partner (fixed matrix). Basic plan: up to 10%; Premium plans: up to 20%.</li>
                <li><strong>Minimum payout threshold:</strong> €10 for Premium Weekly, €15 for Premium Monthly, €20 for Basic. Payouts are processed to your registered card within 3–5 business days of reaching the threshold.</li>
                <li><strong>Cashback validity:</strong> Each approved transaction carries a 60-day validity window from the date of approval. Cashback expires on a cascading basis — the oldest amounts expire first.</li>
                <li><strong>Plan upgrades:</strong> Upgrading from Premium Weekly to Premium Monthly credits 100% of the remaining weekly value. Upgrading from Basic to Premium credits 60% of the remaining Basic value.</li>
                <li><strong>Limits:</strong> BoomCard may set maximum daily/monthly limits on cashback transactions to ensure system integrity.</li>
                <li><strong>Wallet funds do not accrue interest</strong> and do not constitute a bank deposit.</li>
              </ul>

              <h2>6. BOOM Stickers & Receipts</h2>
              <ul>
                <li><strong>Scanning:</strong> Users scan a BOOM sticker at a Partner's venue to initiate a cashback transaction.</li>
                <li><strong>GPS validation:</strong> The Platform may verify your GPS location to confirm your presence at the venue.</li>
                <li><strong>Receipt:</strong> You may be required to upload a photo of your receipt to validate the amount and merchant.</li>
                <li><strong>Upload window:</strong> Receipts must be uploaded before leaving the venue or shortly after paying. The upload window closes at 6am the following day. Receipts uploaded more than 1 hour after issuance may be flagged for manual review.</li>
                <li><strong>OCR processing:</strong> Receipts are processed through automated text recognition (OCR) and fraud checks.</li>
                <li><strong>Anti-fraud:</strong> Attempts at abuse (fake receipts, multiple scans, data manipulation) may result in immediate account suspension and loss of accumulated cashback.</li>
              </ul>

              <h2>7. Offers & Partners</h2>
              <ul>
                <li>BoomCard acts as an intermediary between Users and Partners. BoomCard is not a party to purchase agreements between a User and a Partner.</li>
                <li>Responsibility for the quality of goods and services lies solely with the respective Partner.</li>
                <li>Offers are subject to availability and may be modified or discontinued by the Partner at any time.</li>
                <li>BoomCard does not guarantee a minimum discount or cashback rate from any specific Partner.</li>
              </ul>

              <h2>8. Intellectual Property</h2>
              <ul>
                <li>All rights to the Platform, including design, logos, trademarks, software, and content, are owned by BoomCard or licensed from third parties.</li>
                <li>Users are granted a limited, non-exclusive, non-transferable license for personal use of the Platform.</li>
                <li>Content uploaded by Users (reviews, receipt photos) remains the User's property, but with a non-exclusive license granted to BoomCard for Platform purposes.</li>
                <li>Copying, modifying, reverse engineering, or distributing components of the Platform without written permission is prohibited.</li>
              </ul>

              <h2>9. Limitation of Liability</h2>
              <ul>
                <li>The Platform is provided "as-is" and "as-available," without warranties of uninterrupted or error-free operation.</li>
                <li>BoomCard is not liable for losses caused by unauthorized access to your account due to your negligence.</li>
                <li>BoomCard's maximum liability for any claim is limited to the subscription fees paid by the User in the preceding 12 months.</li>
                <li>BoomCard is not liable for the actions or omissions of Partners, including the quality of their goods or services.</li>
                <li>This limitation does not affect mandatory consumer rights under applicable EU and Bulgarian law.</li>
              </ul>

              <h2>10. Termination</h2>
              <ul>
                <li><strong>By User:</strong> You may delete your account at any time from profile settings or by contacting office@boomcard.bg.</li>
                <li><strong>By BoomCard:</strong> BoomCard may suspend or terminate your account for violation of these terms, suspected fraud, inactivity exceeding 12 months, or upon request from a competent authority.</li>
                <li><strong>Consequences:</strong> Upon termination, you lose access to the Platform. Loaded wallet funds (excluding cashback) may be withdrawn within 30 days. Cashback funds are non-refundable.</li>
              </ul>

              <h2>11. Governing Law & Disputes</h2>
              <ul>
                <li>These Terms & Conditions are governed by the laws of the Republic of Bulgaria.</li>
                <li>Disputes shall be resolved through negotiation. If no agreement is reached, consumers may contact:</li>
                <li><strong>Commission for Consumer Protection (KZP):</strong> <a href="https://kzp.bg" target="_blank" rel="noopener noreferrer">kzp.bg</a></li>
                <li><strong>EU Online Dispute Resolution (ODR) Platform:</strong> <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a></li>
                <li>For unresolved disputes, the competent court is the Sofia District Court, unless applicable law provides otherwise.</li>
              </ul>

              <h2>12. Changes to Terms</h2>
              <ul>
                <li>BoomCard reserves the right to update these Terms & Conditions.</li>
                <li>For material changes, you will be notified by email and/or Platform notification at least 30 days before they take effect.</li>
                <li>Continued use of the Platform after changes take effect constitutes acceptance of the updated terms.</li>
                <li>If you disagree with the changes, you may terminate your account before they take effect.</li>
              </ul>

              <h2>Contact</h2>
              <p>
                For questions about these Terms & Conditions:<br />
                <strong>Email:</strong> <a href="mailto:office@boomcard.bg">office@boomcard.bg</a><br />
                <strong>Website:</strong> <a href="https://boomcard.bg">boomcard.bg</a>
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default TermsPage;
