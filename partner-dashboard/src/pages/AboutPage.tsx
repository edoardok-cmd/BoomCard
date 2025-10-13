import React from 'react';
import GenericPage, { ContentBlock } from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const TextContent = styled.div`
  line-height: 1.8;
  color: #374151;

  h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: #111827;
    margin-bottom: 1rem;
    margin-top: 2rem;

    &:first-child {
      margin-top: 0;
    }
  }

  p {
    margin-bottom: 1rem;
  }
`;

const AboutPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <GenericPage
      titleEn="About BoomCard"
      titleBg="За BoomCard"
      subtitleEn="Revolutionizing how you discover and enjoy experiences in Bulgaria"
      subtitleBg="Революционизираме начина, по който откриваме и се наслаждаваме на изживявания в България"
    >
      <ContentBlock>
        <TextContent>
          {language === 'bg' ? (
            <>
              <h2>Нашата Мисия</h2>
              <p>
                BoomCard е водещата платформа за ексклузивни отстъпки и изживявания в България. Ние свързваме потребителите с най-добрите ресторанти, хотели, спа центрове и развлекателни места в цялата страна.
              </p>

              <h2>Какво Предлагаме</h2>
              <p>
                С BoomCard получавате достъп до хиляди ексклузивни оферти от над 500 партньорски места. От fine dining изживявания до екстремни приключения, от релаксиращи спа уикенди до културни турове – всичко това на едно място.
              </p>

              <h2>Защо BoomCard?</h2>
              <p>
                Ние вярваме, че всеки заслужава достъп до качествени изживявания на достъпни цени. Нашата платформа прави това възможно, като предлага отстъпки до 70% в най-добрите места в България.
              </p>
            </>
          ) : (
            <>
              <h2>Our Mission</h2>
              <p>
                BoomCard is Bulgaria's leading platform for exclusive discounts and experiences. We connect users with the best restaurants, hotels, spas, and entertainment venues across the country.
              </p>

              <h2>What We Offer</h2>
              <p>
                With BoomCard, you get access to thousands of exclusive offers from over 500 partner venues. From fine dining experiences to extreme adventures, from relaxing spa weekends to cultural tours – everything in one place.
              </p>

              <h2>Why BoomCard?</h2>
              <p>
                We believe everyone deserves access to quality experiences at affordable prices. Our platform makes this possible by offering discounts up to 70% at Bulgaria's best venues.
              </p>
            </>
          )}
        </TextContent>
      </ContentBlock>
    </GenericPage>
  );
};

export default AboutPage;
