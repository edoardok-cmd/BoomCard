import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  Building2, Mail, Phone, User, MapPin, Globe, Send, CheckCircle,
  FileText, Database, CreditCard, Tags, ShieldCheck, Rocket,
  Image, Clock, MessageSquare, Link, Percent, Map
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import toast from 'react-hot-toast';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
`;

const HeroSection = styled.section`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);
  color: white;
  padding: 5rem 0 4rem;
  text-align: center;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradient 10s ease infinite;
  }

  @keyframes heroGradient {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }

  @media (max-width: 768px) {
    padding: 3.5rem 0 2.5rem;
  }
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
`;

const HeroTitle = styled(motion.h1)`
  font-size: 2.5rem;
  font-weight: 800;
  margin-bottom: 1rem;

  @media (max-width: 768px) {
    font-size: 1.75rem;
  }
`;

const HeroSubtitle = styled(motion.p)`
  font-size: 1.15rem;
  opacity: 0.85;
  line-height: 1.7;
  max-width: 700px;
  margin: 0 auto;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

/* ── Onboarding Process Section ── */

const ProcessSection = styled.section`
  padding: 4rem 0 2rem;
  background: var(--color-surface, var(--color-background));
`;

const SectionTitle = styled(motion.h2)`
  font-size: 2rem;
  font-weight: 800;
  color: var(--color-text-primary);
  text-align: center;
  margin-bottom: 0.75rem;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SectionSubtitle = styled(motion.p)`
  font-size: 1.05rem;
  color: var(--color-text-secondary);
  text-align: center;
  max-width: 650px;
  margin: 0 auto 3rem;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 0.95rem;
    margin-bottom: 2rem;
  }
`;

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  position: relative;

  @media (max-width: 968px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const StepCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
  position: relative;
  text-align: center;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-hover);
  }
`;

const StepNumber = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 800;
  margin: 0 auto 1rem;
`;

const StepIconWrap = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 1rem;
  background: var(--color-primary);
  color: var(--color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  opacity: 0.15;
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
`;

const StepTitle = styled.h3`
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const StepDescription = styled.p`
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  line-height: 1.55;
`;

/* ── Partner Package Section ── */

const PackageSection = styled.section`
  padding: 2rem 0 4rem;
`;

const PackageGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const PackageCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
  }
`;

const PackageIcon = styled.div`
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 0.75rem;
  background: var(--color-primary);
  color: var(--color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
`;

const PackageItemContent = styled.div``;

const PackageItemTitle = styled.h4`
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 0.25rem;
`;

const PackageItemDesc = styled.p`
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
`;

/* ── Existing sections ── */

const ContentSection = styled.section`
  padding: 4rem 0;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 3rem;
  align-items: start;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const BenefitsCard = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
`;

const BenefitTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
`;

const BenefitsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

const BenefitItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  color: var(--color-text-secondary);
  font-size: 1rem;
  line-height: 1.6;

  svg {
    color: #22c55e;
    flex-shrink: 0;
    margin-top: 0.2rem;
  }

  &:last-child {
    margin-bottom: 0;
  }
`;

const ContactInfo = styled.div`
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
`;

const ContactInfoTitle = styled.h3`
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 1rem;
`;

const ContactItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  color: var(--color-text-secondary);
  font-size: 0.95rem;

  svg {
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  a {
    color: var(--color-text-secondary);
    text-decoration: none;
    &:hover {
      color: var(--color-text-primary);
    }
  }
`;

const Form = styled.form`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
`;

const FormTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin-bottom: 1.5rem;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;

  svg {
    width: 16px;
    height: 16px;
    opacity: 0.6;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all 0.2s;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  min-height: 100px;
  resize: vertical;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 1rem;
  background: var(--color-primary);
  color: var(--color-secondary);
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s;

  &:hover {
    background: var(--color-primary-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const SuccessMessage = styled(motion.div)`
  text-align: center;
  padding: 3rem 2rem;

  svg {
    color: #22c55e;
    margin-bottom: 1rem;
  }

  h3 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin-bottom: 0.75rem;
  }

  p {
    color: var(--color-text-secondary);
    line-height: 1.6;
  }
`;

const BecomePartnerPage: React.FC = () => {
  const { language } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    contactName: '',
    email: '',
    phone: '',
    businessName: '',
    businessCity: '',
    businessCategory: '',
    website: '',
    message: '',
  });

  const t = language === 'bg' ? {
    heroTitle: 'Стани партньор на BOOM Card',
    heroSubtitle: 'Присъедини бизнеса си към нарастващата мрежа от партньори на BOOM Card. Ние поемаме целия онбординг процес, за да гарантираме качество и скорост.',
    // Onboarding process
    processTitle: 'Как протича онбордингът?',
    processSubtitle: 'BOOM Card управлява целия процес. Ти предоставяш данните, ние правим всичко останало.',
    steps: [
      { title: 'Подписване на договор', desc: 'Съгласяваме се на условия и стартираме партньорството.' },
      { title: 'Изискване на данни', desc: 'BOOM Card изисква стандартен набор от информация за вашия обект.' },
      { title: 'Въвеждане в базата', desc: 'Нашият екип въвежда всички данни в системата.' },
      { title: 'Създаване на картата', desc: 'Създаваме вашата карта със стандартна визуализация и hero снимка.' },
      { title: 'QA проверка', desc: 'Проверяваме категории, тагове, описания и визия преди публикуване.' },
      { title: 'Активиране', desc: 'Вашият обект става видим за всички потребители на BOOM Card.' },
    ],
    // Partner package
    packageTitle: 'Партньорски пакет',
    packageSubtitle: 'Какво изискваме от вас, за да създадем перфектен профил:',
    packageItems: [
      { title: 'Име в Google Maps', desc: 'Точното наименование на обекта, както е в Google Maps.' },
      { title: 'Описания', desc: 'Кратко (1-2 изречения) и средно (3-5 изречения) описание на обекта.' },
      { title: 'Снимки (6-12) + 1 Hero', desc: 'Качествени снимки на интериор, екстериор и предлагани продукти. Една основна (hero) снимка.' },
      { title: 'Адрес + Google Maps линк', desc: 'Пълен адрес и директен линк към обекта в Google Maps.' },
      { title: 'Работно време', desc: 'Детайлно работно време за всеки ден от седмицата.' },
      { title: 'Контакти', desc: 'Телефон, имейл и/или профили в социалните мрежи.' },
      { title: 'Линк към меню / резервации', desc: 'Ако имате онлайн меню, система за резервации или уебсайт.' },
      { title: 'Условия на отстъпката', desc: 'Какъв % отстъпка предлагате и при какви условия (дни, часове, продукти).' },
    ],
    // Benefits
    benefitsTitle: 'Защо да станеш партньор?',
    benefits: [
      'Достъп до активна база от потребители, които търсят качествени места',
      'Повишена видимост в приложението и на сайта на BOOM Card',
      'Лесна интеграция без допълнителна техника или софтуер',
      'Гъвкави условия за отстъпки, подходящи за твоя бизнес',
      'Маркетингова подкрепа и промотиране на партньорски обекти',
      'Аналитични данни за посещенията и ангажираността на клиентите',
    ],
    contactTitle: 'Директен контакт',
    formTitle: 'Заяви партньорство',
    contactName: 'Име за контакт',
    contactNamePlaceholder: 'Иван Петров',
    email: 'Имейл',
    emailPlaceholder: 'ivan@mybusiness.bg',
    phone: 'Телефон',
    phonePlaceholder: '+359 88 123 4567',
    businessName: 'Име на обекта / бизнеса',
    businessNamePlaceholder: 'Ресторант Панорама',
    businessCity: 'Град',
    businessCityPlaceholder: 'София',
    businessCategory: 'Категория',
    categoryPlaceholder: 'Изберете категория...',
    categories: {
      restaurant: 'Ресторант',
      hotel: 'Хотел',
      spa: 'СПА и Уелнес',
      bar: 'Бар / Клуб',
      cafe: 'Кафене',
      winery: 'Винарна',
      entertainment: 'Развлечения',
      sports: 'Спорт и Фитнес',
      beauty: 'Красота и Козметика',
      shopping: 'Магазин / Търговия',
      travel: 'Туризъм / Настаняване',
      other: 'Друго',
    },
    website: 'Уебсайт (по избор)',
    websitePlaceholder: 'https://www.mybusiness.bg',
    message: 'Допълнителна информация (по избор)',
    messagePlaceholder: 'Разкажете ни повече за вашия бизнес, локация или въпроси...',
    submit: 'Изпрати заявка',
    submitting: 'Изпраща се...',
    successTitle: 'Заявката е изпратена!',
    successMessage: 'Благодарим за интереса! Нашият екип ще се свърже с вас в рамките на 2 работни дни, за да обсъдим детайлите на партньорството.',
  } : {
    heroTitle: 'Become a BOOM Card Partner',
    heroSubtitle: 'Join the growing BOOM Card partner network. We handle the entire onboarding process to guarantee quality and speed.',
    // Onboarding process
    processTitle: 'How does onboarding work?',
    processSubtitle: 'BOOM Card manages the entire process. You provide the data, we handle everything else.',
    steps: [
      { title: 'Sign the agreement', desc: 'We agree on terms and officially start the partnership.' },
      { title: 'Data request', desc: 'BOOM Card requests a standard set of information about your venue.' },
      { title: 'Data entry', desc: 'Our team enters all data into the system.' },
      { title: 'Card creation', desc: 'We create your card with standard visuals and a hero image.' },
      { title: 'QA review', desc: 'We verify categories, tags, descriptions, and visuals before publishing.' },
      { title: 'Activation', desc: 'Your venue becomes visible to all BOOM Card users.' },
    ],
    // Partner package
    packageTitle: 'Partner Package',
    packageSubtitle: 'What we need from you to create the perfect profile:',
    packageItems: [
      { title: 'Google Maps name', desc: 'The exact name of your venue as it appears on Google Maps.' },
      { title: 'Descriptions', desc: 'Short (1-2 sentences) and medium (3-5 sentences) description of your venue.' },
      { title: 'Photos (6-12) + 1 Hero', desc: 'Quality photos of the interior, exterior, and products. One main (hero) photo.' },
      { title: 'Address + Google Maps link', desc: 'Full address and a direct link to your venue on Google Maps.' },
      { title: 'Working hours', desc: 'Detailed working hours for each day of the week.' },
      { title: 'Contact details', desc: 'Phone, email, and/or social media profiles.' },
      { title: 'Menu / Reservations link', desc: 'If you have an online menu, booking system, or website.' },
      { title: 'Discount conditions', desc: 'What % discount you offer and under what conditions (days, hours, products).' },
    ],
    // Benefits
    benefitsTitle: 'Why become a partner?',
    benefits: [
      'Access to an active user base looking for quality venues',
      'Increased visibility in the BOOM Card app and website',
      'Easy integration with no additional hardware or software',
      'Flexible discount terms tailored to your business',
      'Marketing support and promotion of partner venues',
      'Analytics on visits and customer engagement',
    ],
    contactTitle: 'Direct Contact',
    formTitle: 'Apply for Partnership',
    contactName: 'Contact Name',
    contactNamePlaceholder: 'John Smith',
    email: 'Email',
    emailPlaceholder: 'john@mybusiness.com',
    phone: 'Phone',
    phonePlaceholder: '+359 88 123 4567',
    businessName: 'Business / Venue Name',
    businessNamePlaceholder: 'Panorama Restaurant',
    businessCity: 'City',
    businessCityPlaceholder: 'Sofia',
    businessCategory: 'Category',
    categoryPlaceholder: 'Select a category...',
    categories: {
      restaurant: 'Restaurant',
      hotel: 'Hotel',
      spa: 'SPA & Wellness',
      bar: 'Bar / Club',
      cafe: 'Cafe',
      winery: 'Winery',
      entertainment: 'Entertainment',
      sports: 'Sports & Fitness',
      beauty: 'Beauty & Cosmetics',
      shopping: 'Shopping / Retail',
      travel: 'Travel / Accommodation',
      other: 'Other',
    },
    website: 'Website (optional)',
    websitePlaceholder: 'https://www.mybusiness.com',
    message: 'Additional Information (optional)',
    messagePlaceholder: 'Tell us more about your business, location, or any questions...',
    submit: 'Submit Application',
    submitting: 'Submitting...',
    successTitle: 'Application Submitted!',
    successMessage: 'Thank you for your interest! Our team will contact you within 2 business days to discuss partnership details.',
  };

  const stepIcons = [FileText, Database, Database, CreditCard, ShieldCheck, Rocket];
  const packageIcons = [Map, FileText, Image, MapPin, Clock, MessageSquare, Link, Percent];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const subject = encodeURIComponent(`[BOOM Card Partner] ${formData.businessName}`);
      const body = encodeURIComponent(
        `Име: ${formData.contactName}\n` +
        `Имейл: ${formData.email}\n` +
        `Телефон: ${formData.phone}\n` +
        `Бизнес: ${formData.businessName}\n` +
        `Град: ${formData.businessCity}\n` +
        `Категория: ${formData.businessCategory}\n` +
        `Уебсайт: ${formData.website || '-'}\n` +
        `\nДопълнителна информация:\n${formData.message || '-'}`
      );

      window.location.href = `mailto:partners@boomcard.bg?subject=${subject}&body=${body}`;

      await new Promise(resolve => setTimeout(resolve, 1000));
      setIsSubmitted(true);
      toast.success(language === 'bg'
        ? 'Заявката е подготвена! Моля, изпратете имейла от вашия мейл клиент.'
        : 'Application prepared! Please send the email from your mail client.');
    } catch {
      toast.error(language === 'bg'
        ? 'Грешка при подготовка на заявката'
        : 'Error preparing application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageContainer>
      {/* Hero */}
      <HeroSection>
        <Container>
          <HeroTitle
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {t.heroTitle}
          </HeroTitle>
          <HeroSubtitle
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            {t.heroSubtitle}
          </HeroSubtitle>
        </Container>
      </HeroSection>

      {/* Onboarding Process */}
      <ProcessSection>
        <Container>
          <SectionTitle
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {t.processTitle}
          </SectionTitle>
          <SectionSubtitle
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {t.processSubtitle}
          </SectionSubtitle>

          <StepsGrid>
            {t.steps.map((step, i) => {
              const Icon = stepIcons[i];
              return (
                <StepCard
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                >
                  <StepIconWrap>
                    <Icon size={26} />
                  </StepIconWrap>
                  <StepNumber>{i + 1}</StepNumber>
                  <StepTitle>{step.title}</StepTitle>
                  <StepDescription>{step.desc}</StepDescription>
                </StepCard>
              );
            })}
          </StepsGrid>
        </Container>
      </ProcessSection>

      {/* Partner Package */}
      <PackageSection>
        <Container>
          <SectionTitle
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            {t.packageTitle}
          </SectionTitle>
          <SectionSubtitle
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {t.packageSubtitle}
          </SectionSubtitle>

          <PackageGrid>
            {t.packageItems.map((item, i) => {
              const Icon = packageIcons[i];
              return (
                <PackageCard
                  key={i}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                >
                  <PackageIcon>
                    <Icon size={22} />
                  </PackageIcon>
                  <PackageItemContent>
                    <PackageItemTitle>{item.title}</PackageItemTitle>
                    <PackageItemDesc>{item.desc}</PackageItemDesc>
                  </PackageItemContent>
                </PackageCard>
              );
            })}
          </PackageGrid>
        </Container>
      </PackageSection>

      {/* Benefits + Form */}
      <ContentSection>
        <Container>
          <Grid>
            <BenefitsCard
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <BenefitTitle>{t.benefitsTitle}</BenefitTitle>
              <BenefitsList>
                {t.benefits.map((benefit, i) => (
                  <BenefitItem key={i}>
                    <CheckCircle size={20} />
                    {benefit}
                  </BenefitItem>
                ))}
              </BenefitsList>

              <ContactInfo>
                <ContactInfoTitle>{t.contactTitle}</ContactInfoTitle>
                <ContactItem>
                  <Mail size={18} />
                  <a href="mailto:partners@boomcard.bg">partners@boomcard.bg</a>
                </ContactItem>
                <ContactItem>
                  <Phone size={18} />
                  <a href="tel:+35929530000">+359 2 953 0000</a>
                </ContactItem>
              </ContactInfo>
            </BenefitsCard>

            {isSubmitted ? (
              <Form as="div">
                <SuccessMessage
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <CheckCircle size={56} />
                  <h3>{t.successTitle}</h3>
                  <p>{t.successMessage}</p>
                </SuccessMessage>
              </Form>
            ) : (
              <Form onSubmit={handleSubmit}>
                <FormTitle>{t.formTitle}</FormTitle>

                <FormRow>
                  <FormGroup>
                    <Label><User /> {t.contactName} *</Label>
                    <Input
                      type="text"
                      name="contactName"
                      value={formData.contactName}
                      onChange={handleChange}
                      required
                      placeholder={t.contactNamePlaceholder}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label><Mail /> {t.email} *</Label>
                    <Input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      placeholder={t.emailPlaceholder}
                    />
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <FormGroup>
                    <Label><Phone /> {t.phone} *</Label>
                    <Input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                      placeholder={t.phonePlaceholder}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label><Building2 /> {t.businessName} *</Label>
                    <Input
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      required
                      placeholder={t.businessNamePlaceholder}
                    />
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <FormGroup>
                    <Label><MapPin /> {t.businessCity} *</Label>
                    <Input
                      type="text"
                      name="businessCity"
                      value={formData.businessCity}
                      onChange={handleChange}
                      required
                      placeholder={t.businessCityPlaceholder}
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>{t.businessCategory} *</Label>
                    <Select
                      name="businessCategory"
                      value={formData.businessCategory}
                      onChange={handleChange}
                      required
                    >
                      <option value="">{t.categoryPlaceholder}</option>
                      {Object.entries(t.categories).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </Select>
                  </FormGroup>
                </FormRow>

                <FormGroup>
                  <Label><Globe /> {t.website}</Label>
                  <Input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder={t.websitePlaceholder}
                  />
                </FormGroup>

                <FormGroup>
                  <Label>{t.message}</Label>
                  <Textarea
                    name="message"
                    value={formData.message}
                    onChange={handleChange}
                    placeholder={t.messagePlaceholder}
                  />
                </FormGroup>

                <SubmitButton type="submit" disabled={isSubmitting}>
                  <Send size={18} />
                  {isSubmitting ? t.submitting : t.submit}
                </SubmitButton>
              </Form>
            )}
          </Grid>
        </Container>
      </ContentSection>
    </PageContainer>
  );
};

export default BecomePartnerPage;
