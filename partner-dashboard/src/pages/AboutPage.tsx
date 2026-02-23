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
      label: 'ЗА BOOM CARD',
      heroText:
        'Изграждаме екосистема, в която всяко излизане носи повече стойност — за хората и за бизнеса.',
      heroSubline: 'Технология, партньорства и реални предимства на едно място.',
      heroCta: 'Виж плановете',
      heroTrust: 'Безплатен 24-часов пробен период. Без ангажимент.',
      sections: [
        {
          title: 'Кои сме ние',
          text: `<p>BOOM Card е българска технологична компания, която свързва потребители с качествени заведения, хотели, СПА центрове и изживявания.</p>
<p>Стартирахме с ясна цел: да създадем платформа, в която хората получават реална стойност при всяко посещение, а бизнесите привличат лоялни клиенти без скъпа реклама.</p>
<p>Екипът ни обединява опит в технологиите, маркетинга и хотелиерството — затова познаваме и двете страни на масата.</p>`,
        },
        {
          title: 'Нашата мисия',
          text: `<p>Вярваме, че качественото преживяване не трябва да бъде привилегия. Затова изграждаме мрежа от <strong>проверени партньори</strong>, които предлагат ексклузивни отстъпки и кешбек — без скрити условия, без дребен шрифт.</p>
<p>Мисията ни е да направим спестяването лесно, приятно и достъпно за всеки, който цени времето и парите си.</p>`,
        },
        {
          title: 'Какво ни отличава',
          text: `<p><strong>Подбрана мрежа</strong> — работим само с обекти, които отговарят на стандартите ни за качество и обслужване.</p>
<p><strong>Прозрачни условия</strong> — всяка отстъпка е ясно описана. Без изненади.</p>
<p><strong>Технология, а не купони</strong> — QR сканиране, автоматичен кешбек и аналитика за партньорите в едно приложение.</p>
<p><strong>Подкрепа за бизнеса</strong> — помагаме на партньорите да растат чрез данни, видимост и достъп до мотивирана аудитория.</p>`,
        },
        {
          title: 'Визия за бъдещето',
          text: `<p>Планираме да разширим мрежата към нови градове и категории, да добавим персонализирани препоръки и да станем водещата платформа за умно потребление в България.</p>
<p>Целта ни е проста: всяко излизане да носи повече стойност — за теб и за бизнеса, който посещаваш.</p>`,
        },
      ],
      transition: `Ако вече излизаш, пътуваш и посещаваш любими места, няма причина да не получаваш повече за същите пари.`,
      transitionBold: 'BOOM Card — живей повече, плащай по-малко.',
    },
    en: {
      label: 'ABOUT BOOM CARD',
      heroText:
        'We\'re building an ecosystem where every outing delivers more value — for people and for businesses.',
      heroSubline: 'Technology, partnerships, and real benefits in one place.',
      heroCta: 'View Plans',
      heroTrust: 'Free 24-hour trial. No commitment.',
      sections: [
        {
          title: 'Who We Are',
          text: `<p>BOOM Card is a Bulgarian technology company connecting consumers with quality restaurants, hotels, spas, and experiences.</p>
<p>We started with a clear goal: to build a platform where people get real value with every visit, and businesses attract loyal customers without expensive advertising.</p>
<p>Our team combines expertise in technology, marketing, and hospitality — so we understand both sides of the table.</p>`,
        },
        {
          title: 'Our Mission',
          text: `<p>We believe quality experiences shouldn't be a privilege. That's why we're building a network of <strong>verified partners</strong> offering exclusive discounts and cashback — with no hidden conditions and no fine print.</p>
<p>Our mission is to make saving easy, enjoyable, and accessible to everyone who values their time and money.</p>`,
        },
        {
          title: 'What Sets Us Apart',
          text: `<p><strong>Curated Network</strong> — we only work with venues that meet our standards for quality and service.</p>
<p><strong>Transparent Terms</strong> — every discount is clearly described. No surprises.</p>
<p><strong>Technology, Not Coupons</strong> — QR scanning, automatic cashback, and partner analytics in one app.</p>
<p><strong>Business Support</strong> — we help partners grow through data, visibility, and access to a motivated audience.</p>`,
        },
        {
          title: 'Our Vision',
          text: `<p>We plan to expand our network to new cities and categories, add personalized recommendations, and become the leading platform for smart spending in Bulgaria.</p>
<p>Our goal is simple: every outing should deliver more value — for you and for the business you visit.</p>`,
        },
      ],
      transition: `If you're already going out, traveling, and visiting your favorite places, there's no reason not to get more for the same money.`,
      transitionBold: 'BOOM Card — live more, pay less.',
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
