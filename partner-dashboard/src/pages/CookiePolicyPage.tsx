import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import { useCookieConsent } from '../contexts/CookieConsentContext';
import styled from 'styled-components';
import Button from '../components/common/Button/Button';

const TextContent = styled.div`
  line-height: 1.8;
  color: var(--color-text-secondary);

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 1rem;
    margin-top: 2rem;

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

  ul {
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
`;

const SettingsButton = styled.div`
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--color-border);
`;

const CookiePolicyPage: React.FC = () => {
  const { language } = useLanguage();
  const { openSettings } = useCookieConsent();

  return (
    <GenericPage
      titleEn="Cookie Policy"
      titleBg="Политика за Бисквитки"
      subtitleEn="How we use cookies and similar technologies"
      subtitleBg="Как използваме бисквитки и подобни технологии"
    >
      <ContentBlock>
        <TextContent>
          {language === 'bg' ? (
            <>
              <h2>1. Какво са бисквитките?</h2>
              <p>
                Бисквитките са малки текстови файлове, които се съхраняват на вашето устройство, когато посещавате уебсайт.
                Те помагат на сайта да запомни информация за вашето посещение, което може да направи следващото ви посещение по-лесно.
              </p>

              <h2>2. Какви бисквитки използваме?</h2>

              <h3>Задължителни бисквитки</h3>
              <p>
                Тези бисквитки са необходими за правилното функциониране на сайта.
                Без тях не можем да ви предоставим нашите услуги.
              </p>
              <ul>
                <li>Бисквитки за сесия и автентикация</li>
                <li>Бисквитки за предпочитания (език, тема)</li>
                <li>Бисквитки за съгласие</li>
              </ul>

              <h3>Бисквитки за анализ</h3>
              <p>
                Тези бисквитки ни помагат да разберем как потребителите използват сайта,
                за да можем да го подобрим. Използваме Google Analytics.
              </p>
              <ul>
                <li>Анализ на посещенията и поведението</li>
                <li>Измерване на ефективността на функциите</li>
                <li>Идентифициране на технически проблеми</li>
              </ul>

              <h3>Маркетинг бисквитки</h3>
              <p>
                Тези бисквитки се използват за показване на подходящи реклами и отстъпки,
                базирани на вашите интереси.
              </p>

              <h2>3. Колко дълго се съхраняват бисквитките?</h2>
              <table>
                <thead>
                  <tr>
                    <th>Тип бисквитка</th>
                    <th>Продължителност</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Сесийни бисквитки</td>
                    <td>До затваряне на браузъра</td>
                  </tr>
                  <tr>
                    <td>Постоянни бисквитки</td>
                    <td>До 1 година</td>
                  </tr>
                  <tr>
                    <td>Бисквитки за съгласие</td>
                    <td>1 година</td>
                  </tr>
                </tbody>
              </table>

              <h2>4. Пълен Списък на Бисквитките</h2>

              <h3>Задължителни бисквитки</h3>
              <table>
                <thead>
                  <tr>
                    <th>Име</th>
                    <th>Доставчик</th>
                    <th>Цел</th>
                    <th>Тип</th>
                    <th>Продълж.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>boomcard_auth</td>
                    <td>BoomCard</td>
                    <td>JWT токен за автентикация</td>
                    <td>localStorage</td>
                    <td>15 мин</td>
                  </tr>
                  <tr>
                    <td>boomcard_refresh</td>
                    <td>BoomCard</td>
                    <td>Refresh токен за подновяване на сесия</td>
                    <td>localStorage</td>
                    <td>7 дни</td>
                  </tr>
                  <tr>
                    <td>boomcard_cookie_consent</td>
                    <td>BoomCard</td>
                    <td>Записва предпочитанията ви за бисквитки</td>
                    <td>localStorage</td>
                    <td>1 година</td>
                  </tr>
                  <tr>
                    <td>boomcard_language</td>
                    <td>BoomCard</td>
                    <td>Запомня избрания език (en/bg)</td>
                    <td>localStorage</td>
                    <td>Постоянно</td>
                  </tr>
                  <tr>
                    <td>boomcard_theme</td>
                    <td>BoomCard</td>
                    <td>Запомня избраната тема (светла/тъмна)</td>
                    <td>localStorage</td>
                    <td>Постоянно</td>
                  </tr>
                </tbody>
              </table>

              <h3>Бисквитки за анализ</h3>
              <table>
                <thead>
                  <tr>
                    <th>Име</th>
                    <th>Доставчик</th>
                    <th>Цел</th>
                    <th>Тип</th>
                    <th>Продълж.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>_ga</td>
                    <td>Google Analytics</td>
                    <td>Уникален идентификатор за разграничаване на потребители</td>
                    <td>Бисквитка</td>
                    <td>2 години</td>
                  </tr>
                  <tr>
                    <td>_ga_*</td>
                    <td>Google Analytics</td>
                    <td>Поддържа състоянието на сесията</td>
                    <td>Бисквитка</td>
                    <td>2 години</td>
                  </tr>
                  <tr>
                    <td>_gid</td>
                    <td>Google Analytics</td>
                    <td>Уникален идентификатор за сесия (24 часа)</td>
                    <td>Бисквитка</td>
                    <td>24 часа</td>
                  </tr>
                  <tr>
                    <td>_gat</td>
                    <td>Google Analytics</td>
                    <td>Ограничаване на честотата на заявки</td>
                    <td>Бисквитка</td>
                    <td>1 мин</td>
                  </tr>
                </tbody>
              </table>

              <h3>Маркетинг бисквитки</h3>
              <p>
                Към момента BoomCard не използва маркетинг бисквитки. Ако бъдат добавени в бъдеще,
                ще актуализираме тази политика и ще поискаме вашето съгласие.
              </p>

              <h2>5. Как да управлявате бисквитките?</h2>
              <p>
                Можете да управлявате предпочитанията си за бисквитки по всяко време чрез бутона по-долу
                или чрез настройките на вашия браузър.
              </p>
              <p>
                <strong>Внимание:</strong> Блокирането на някои бисквитки може да повлияе на функционалността на сайта.
              </p>

              <h2>6. Вашите права</h2>
              <p>
                Съгласно GDPR, имате право да:
              </p>
              <ul>
                <li>Получите информация за обработваните данни</li>
                <li>Поискате изтриване на вашите данни</li>
                <li>Оттеглите съгласието си по всяко време</li>
                <li>Подадете жалба до надзорния орган (КЗЛД)</li>
              </ul>
              <p>За повече информация вижте нашата <a href="/privacy">Политика за Поверителност</a>.</p>

              <h2>7. Контакти</h2>
              <p>
                Ако имате въпроси относно нашата политика за бисквитки, можете да се свържете с нас на:
                <a href="mailto:privacy@boomcard.bg"> privacy@boomcard.bg</a>
              </p>
            </>
          ) : (
            <>
              <h2>1. What are cookies?</h2>
              <p>
                Cookies are small text files that are stored on your device when you visit a website.
                They help the site remember information about your visit, which can make your next visit easier.
              </p>

              <h2>2. What cookies do we use?</h2>

              <h3>Essential Cookies</h3>
              <p>
                These cookies are necessary for the website to function properly.
                Without them, we cannot provide our services.
              </p>
              <ul>
                <li>Session and authentication cookies</li>
                <li>Preference cookies (language, theme)</li>
                <li>Consent cookies</li>
              </ul>

              <h3>Analytics Cookies</h3>
              <p>
                These cookies help us understand how users use the site so we can improve it.
                We use Google Analytics.
              </p>
              <ul>
                <li>Visit and behavior analysis</li>
                <li>Feature effectiveness measurement</li>
                <li>Technical issue identification</li>
              </ul>

              <h3>Marketing Cookies</h3>
              <p>
                These cookies are used to show you relevant advertisements and promotions
                based on your interests.
              </p>

              <h2>3. How long are cookies stored?</h2>
              <table>
                <thead>
                  <tr>
                    <th>Cookie Type</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Session cookies</td>
                    <td>Until browser is closed</td>
                  </tr>
                  <tr>
                    <td>Persistent cookies</td>
                    <td>Up to 1 year</td>
                  </tr>
                  <tr>
                    <td>Consent cookies</td>
                    <td>1 year</td>
                  </tr>
                </tbody>
              </table>

              <h2>4. Complete Cookie Inventory</h2>

              <h3>Essential Cookies</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>Purpose</th>
                    <th>Type</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>boomcard_auth</td>
                    <td>BoomCard</td>
                    <td>JWT authentication token</td>
                    <td>localStorage</td>
                    <td>15 min</td>
                  </tr>
                  <tr>
                    <td>boomcard_refresh</td>
                    <td>BoomCard</td>
                    <td>Refresh token for session renewal</td>
                    <td>localStorage</td>
                    <td>7 days</td>
                  </tr>
                  <tr>
                    <td>boomcard_cookie_consent</td>
                    <td>BoomCard</td>
                    <td>Stores your cookie preferences</td>
                    <td>localStorage</td>
                    <td>1 year</td>
                  </tr>
                  <tr>
                    <td>boomcard_language</td>
                    <td>BoomCard</td>
                    <td>Remembers selected language (en/bg)</td>
                    <td>localStorage</td>
                    <td>Persistent</td>
                  </tr>
                  <tr>
                    <td>boomcard_theme</td>
                    <td>BoomCard</td>
                    <td>Remembers selected theme (light/dark)</td>
                    <td>localStorage</td>
                    <td>Persistent</td>
                  </tr>
                </tbody>
              </table>

              <h3>Analytics Cookies</h3>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>Purpose</th>
                    <th>Type</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>_ga</td>
                    <td>Google Analytics</td>
                    <td>Unique identifier to distinguish users</td>
                    <td>Cookie</td>
                    <td>2 years</td>
                  </tr>
                  <tr>
                    <td>_ga_*</td>
                    <td>Google Analytics</td>
                    <td>Maintains session state</td>
                    <td>Cookie</td>
                    <td>2 years</td>
                  </tr>
                  <tr>
                    <td>_gid</td>
                    <td>Google Analytics</td>
                    <td>Unique session identifier (24 hours)</td>
                    <td>Cookie</td>
                    <td>24 hours</td>
                  </tr>
                  <tr>
                    <td>_gat</td>
                    <td>Google Analytics</td>
                    <td>Request rate throttling</td>
                    <td>Cookie</td>
                    <td>1 min</td>
                  </tr>
                </tbody>
              </table>

              <h3>Marketing Cookies</h3>
              <p>
                Currently, BoomCard does not use marketing cookies. If they are added in the future,
                we will update this policy and request your consent.
              </p>

              <h2>5. How to manage cookies?</h2>
              <p>
                You can manage your cookie preferences at any time using the button below
                or through your browser settings.
              </p>
              <p>
                <strong>Note:</strong> Blocking some cookies may affect the functionality of the site.
              </p>

              <h2>6. Your Rights</h2>
              <p>
                Under GDPR, you have the right to:
              </p>
              <ul>
                <li>Receive information about processed data</li>
                <li>Request deletion of your data</li>
                <li>Withdraw your consent at any time</li>
                <li>File a complaint with the supervisory authority (CPDP)</li>
              </ul>
              <p>For more information, see our <a href="/privacy">Privacy Policy</a>.</p>

              <h2>7. Contact</h2>
              <p>
                If you have questions about our cookie policy, you can contact us at:
                <a href="mailto:privacy@boomcard.bg"> privacy@boomcard.bg</a>
              </p>
            </>
          )}

          <SettingsButton>
            <Button variant="primary" size="large" onClick={openSettings}>
              {language === 'bg' ? 'Настройки на бисквитките' : 'Cookie Settings'}
            </Button>
          </SettingsButton>
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default CookiePolicyPage;
