import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import Button from '../components/common/Button/Button';
import ClientCTA from '../components/common/ClientCTA/ClientCTA';

// ─── Layout ─────────────────────────────────────────────
const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
  color: white;
  padding: 5rem 0 4rem;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 3.5rem 0 2.5rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
`;

const SmallLabel = styled.span`
  display: inline-block;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  opacity: 0.75;
  margin-bottom: 1.25rem;
  color: #d4af37;
`;

const HeroTitle = styled.h1`
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.35;
  margin-bottom: 1.25rem;

  @media (max-width: 768px) {
    font-size: 1.65rem;
  }
`;

const HeroSubline = styled.p`
  font-size: 1.15rem;
  opacity: 0.85;
  line-height: 1.6;
  margin-bottom: 0;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const CTAButtonWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  margin-top: 2.25rem;
`;

const TrustLine = styled.p`
  font-size: 0.875rem;
  opacity: 0.6;
  margin: 0;
`;

// ─── Content sections ───────────────────────────────────
const ContentSection = styled.div`
  padding: 4rem 0;
`;

const SectionBlock = styled(motion.div)`
  max-width: 780px;
  margin: 0 auto 3.5rem;
  text-align: left;

  &:last-child {
    margin-bottom: 0;
  }
`;

const SectionTitle = styled.h2`
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
`;

const SectionText = styled.div`
  font-size: 1.05rem;
  line-height: 1.85;
  color: var(--color-text-secondary);

  p {
    margin-bottom: 1rem;

    &:last-child {
      margin-bottom: 0;
    }
  }

  strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }
`;

// ─── Transition block ───────────────────────────────────
const TransitionBlock = styled.div`
  max-width: 780px;
  margin: 0 auto;
  text-align: center;
  padding: 2rem 0 0;

  p {
    font-size: 1.15rem;
    line-height: 1.7;
    color: var(--color-text-secondary);
  }

  strong {
    display: block;
    margin-top: 0.75rem;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }
`;

// ─── Animation helpers ──────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.12 },
  }),
};

// ─── Component ──────────────────────────────────────────
const AboutPage: React.FC = () => {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const scrollToPlans = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname === '/') {
      document.getElementById('subscription-plans')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      navigate('/#subscription-plans');
    }
  };

  const content = {
    bg: {
      label: 'ПОВЕЧЕ ОТ КАРТА',
      heroText:
        'Създадохме BOOM Card, за да превърнем спестяването в достъп до повече ексклузивни места, реални отстъпки и качествени изживявания.',
      heroSubline: 'Плащаш както обикновено. Получаваш повече стойност.',
      heroCta: 'Отключи BOOM Card',
      heroTrust: 'Безплатен 24-часов пробен период. Без ангажимент.',
      sections: [
        {
          title: 'Нашата мисия',
          text: `<p>Вярваме, че хората трябва да получават повече стойност за парите си.</p>
<p>Затова изграждаме мрежа от проверени и подбрани места, които дават реални отстъпки и достъп до повече възможности без скрити условия и без излишни усложнения.</p>`,
        },
        {
          title: 'Какво предлагаме',
          text: `<p>С BOOM Card получаваш достъп до подбрани ресторанти, хотели, СПА центрове и други локации с реални отстъпки и възможност за възстановяване на част от направените разходи.</p>
<p>Всичко е организирано в една платформа, която обединява откриването на места и лесното активиране на предимствата ти.</p>
<p><strong>Излизаш. Избираш. Спестяваш.</strong></p>`,
        },
        {
          title: 'Защо BOOM Card',
          text: `<p>Повечето хора плащат пълна цена, без да знаят, че могат да получат повече за същите пари.</p>
<p>BOOM Card е за тези, които избират по-умно. За хората, които ценят качеството, контролират разходите си и искат реални предимства всеки път, когато излизат или планират ново изживяване.</p>
<p>Работим с подбрани партньори и ясни условия, защото доверието е по-важно от шума.</p>`,
        },
      ],
      transition: `Ако така или иначе излизаш, пътуваш или посещаваш любими места, изборът е прост.`,
      transitionBold: 'Плащай както досега. Получавай повече.',
    },
    en: {
      label: 'MORE THAN A CARD',
      heroText:
        'We created BOOM Card to turn saving into access to more exclusive venues, real discounts, and quality experiences.',
      heroSubline: 'Pay as you normally would. Get more value.',
      heroCta: 'Unlock BOOM Card',
      heroTrust: 'Free 24-hour trial. No commitment.',
      sections: [
        {
          title: 'Our Mission',
          text: `<p>We believe people deserve more value for their money.</p>
<p>That's why we're building a network of verified, hand-picked venues that offer real discounts and access to more opportunities — with no hidden conditions and no unnecessary complexity.</p>`,
        },
        {
          title: 'What We Offer',
          text: `<p>With BOOM Card you get access to curated restaurants, hotels, spas, and other venues with real discounts and the option to recover part of your spending.</p>
<p>Everything is organized on a single platform that combines discovering places and easily activating your benefits.</p>
<p><strong>Go out. Choose. Save.</strong></p>`,
        },
        {
          title: 'Why BOOM Card',
          text: `<p>Most people pay full price without knowing they could get more for the same money.</p>
<p>BOOM Card is for those who choose smarter. For people who value quality, control their spending, and want real benefits every time they go out or plan a new experience.</p>
<p>We work with hand-picked partners and clear terms, because trust matters more than noise.</p>`,
        },
      ],
      transition: `If you're going out, traveling, or visiting your favorite places anyway — the choice is simple.`,
      transitionBold: 'Pay as before. Get more.',
    },
  };

  const t = language === 'bg' ? content.bg : content.en;

  return (
    <PageContainer>
      {/* ── 1. HERO ──────────────────────────────────── */}
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <SmallLabel>{t.label}</SmallLabel>
              <HeroTitle>{t.heroText}</HeroTitle>
              <HeroSubline>{t.heroSubline}</HeroSubline>
              <CTAButtonWrapper>
                <a href="/#subscription-plans" onClick={scrollToPlans} style={{ textDecoration: 'none' }}>
                  <Button variant="golden" size="large">
                    {t.heroCta}
                  </Button>
                </a>
                <TrustLine>{t.heroTrust}</TrustLine>
              </CTAButtonWrapper>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      {/* ── 2–4. Content sections ────────────────────── */}
      <ContentSection>
        <Container>
          {t.sections.map((section, i) => (
            <SectionBlock
              key={section.title}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.3 }}
              variants={fadeUp}
            >
              <SectionTitle>{section.title}</SectionTitle>
              <SectionText dangerouslySetInnerHTML={{ __html: section.text }} />
            </SectionBlock>
          ))}

          {/* ── 5. Transition to CTA ───────────────────── */}
          <TransitionBlock>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.5 }}
            >
              <p>{t.transition}</p>
              <strong>{t.transitionBold}</strong>
            </motion.div>
          </TransitionBlock>
        </Container>
      </ContentSection>

      {/* ── Global CTA (unchanged) ───────────────────── */}
      <ClientCTA />
    </PageContainer>
  );
};

export default AboutPage;
