import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Check, Zap, Star, TrendingUp } from 'lucide-react';
import Button from '../common/Button/Button';

const PlansContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 1.5rem;
`;

const Header = styled.div`
  text-align: center;
  margin-bottom: 3rem;
`;

const Title = styled.h1`
  font-size: 2.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
`;

const Subtitle = styled.p`
  font-size: 1.125rem;
  color: #6b7280;
  max-width: 600px;
  margin: 0 auto;
`;

const BillingToggle = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin: 2rem 0;
`;

const ToggleLabel = styled.span<{ $active: boolean }>`
  font-size: 1rem;
  font-weight: ${props => props.$active ? '600' : '500'};
  color: ${props => props.$active ? '#111827' : '#6b7280'};
  transition: all 0.2s;
`;

const ToggleSwitch = styled.button<{ $isAnnual: boolean }>`
  position: relative;
  width: 60px;
  height: 32px;
  background: ${props => props.$isAnnual ? '#000000' : '#d1d5db'};
  border-radius: 16px;
  border: none;
  cursor: pointer;
  transition: background 0.3s;

  &:before {
    content: '';
    position: absolute;
    width: 24px;
    height: 24px;
    background: white;
    border-radius: 50%;
    top: 4px;
    left: ${props => props.$isAnnual ? '32px' : '4px'};
    transition: left 0.3s;
  }
`;

const SaveBadge = styled.span`
  display: inline-block;
  padding: 0.375rem 0.75rem;
  background: #10b981;
  color: white;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-left: 0.5rem;
`;

const PlansGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const PlanCard = styled(motion.div)<{ $featured?: boolean }>`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  border: 2px solid ${props => props.$featured ? '#000000' : '#e5e7eb'};
  position: relative;
  box-shadow: ${props => props.$featured ? '0 20px 40px rgba(0, 0, 0, 0.1)' : '0 4px 12px rgba(0, 0, 0, 0.05)'};
  transform: ${props => props.$featured ? 'scale(1.05)' : 'scale(1)'};
  transition: all 0.3s;

  &:hover {
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
    transform: ${props => props.$featured ? 'scale(1.08)' : 'scale(1.02)'};
  }

  @media (max-width: 768px) {
    transform: scale(1);
    &:hover {
      transform: scale(1);
    }
  }
`;

const FeaturedBadge = styled.div`
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #000000 0%, #374151 100%);
  color: white;
  padding: 0.5rem 1.5rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.375rem;

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const PlanIcon = styled.div<{ $color: string }>`
  width: 3rem;
  height: 3rem;
  background: ${props => props.$color};
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;

  svg {
    width: 1.5rem;
    height: 1.5rem;
    color: white;
  }
`;

const PlanName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const PlanDescription = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
`;

const PlanPrice = styled.div`
  margin-bottom: 2rem;
`;

const PriceAmount = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
`;

const Currency = styled.span`
  font-size: 1.5rem;
  font-weight: 600;
  color: #374151;
`;

const Amount = styled.span`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
`;

const Period = styled.span`
  font-size: 1rem;
  color: #6b7280;
  font-weight: 500;
`;

const OldPrice = styled.div`
  font-size: 0.875rem;
  color: #9ca3af;
  text-decoration: line-through;
  margin-top: 0.25rem;
`;

const FeaturesList = styled.ul`
  list-style: none;
  margin: 0 0 2rem 0;
  padding: 0;
`;

const Feature = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
  font-size: 0.9375rem;
  color: #374151;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #10b981;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
`;

const CTAButton = styled.div`
  margin-top: auto;
`;

const ComparisonTable = styled.div`
  margin-top: 4rem;
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
`;

const TableTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1.5rem;
  text-align: center;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  padding: 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 2px solid #e5e7eb;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableRow = styled.tr`
  &:hover {
    background: #f9fafb;
  }
`;

const TableCell = styled.td`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9375rem;
  color: #374151;
`;

interface Plan {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
  price: {
    monthly: number;
    annual: number;
  };
  features: string[];
  featured?: boolean;
  cta: string;
}

interface PricingPlansProps {
  onSelectPlan?: (planId: string, billing: 'monthly' | 'annual') => void;
  language?: 'en' | 'bg';
}

export const PricingPlans: React.FC<PricingPlansProps> = ({
  onSelectPlan,
  language = 'en',
}) => {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans: Plan[] = [
    {
      id: 'starter',
      name: language === 'bg' ? 'Стартов' : 'Starter',
      description: language === 'bg'
        ? 'Перфектен за малки заведения'
        : 'Perfect for small venues getting started',
      icon: <Zap />,
      iconColor: '#6366f1',
      price: {
        monthly: 29,
        annual: 290,
      },
      features: [
        language === 'bg' ? 'До 100 транзакции/месец' : 'Up to 100 transactions/month',
        language === 'bg' ? '1 локация' : '1 venue location',
        language === 'bg' ? 'Основна аналитика' : 'Basic analytics',
        language === 'bg' ? 'Email поддръжка' : 'Email support',
        language === 'bg' ? 'QR код генератор' : 'QR code generator',
      ],
      cta: language === 'bg' ? 'Започни сега' : 'Get Started',
    },
    {
      id: 'professional',
      name: language === 'bg' ? 'Професионален' : 'Professional',
      description: language === 'bg'
        ? 'За растящи бизнеси'
        : 'For growing businesses',
      icon: <Star />,
      iconColor: '#000000',
      price: {
        monthly: 79,
        annual: 790,
      },
      features: [
        language === 'bg' ? 'До 1000 транзакции/месец' : 'Up to 1,000 transactions/month',
        language === 'bg' ? 'До 5 локации' : 'Up to 5 venue locations',
        language === 'bg' ? 'Разширена аналитика' : 'Advanced analytics',
        language === 'bg' ? 'POS интеграция' : 'POS integration',
        language === 'bg' ? 'Приоритетна поддръжка' : 'Priority support',
        language === 'bg' ? 'Персонализирани оферти' : 'Custom offers',
        language === 'bg' ? 'Експорт на данни' : 'Data export',
      ],
      featured: true,
      cta: language === 'bg' ? 'Избери план' : 'Choose Plan',
    },
    {
      id: 'enterprise',
      name: language === 'bg' ? 'Корпоративен' : 'Enterprise',
      description: language === 'bg'
        ? 'За големи вериги'
        : 'For large chains and franchises',
      icon: <TrendingUp />,
      iconColor: '#8b5cf6',
      price: {
        monthly: 199,
        annual: 1990,
      },
      features: [
        language === 'bg' ? 'Неограничени транзакции' : 'Unlimited transactions',
        language === 'bg' ? 'Неограничени локации' : 'Unlimited venue locations',
        language === 'bg' ? 'Пълна аналитика и отчети' : 'Full analytics & reporting',
        language === 'bg' ? 'Всички POS интеграции' : 'All POS integrations',
        language === 'bg' ? '24/7 поддръжка' : '24/7 dedicated support',
        language === 'bg' ? 'API достъп' : 'API access',
        language === 'bg' ? 'White-label опция' : 'White-label option',
        language === 'bg' ? 'Персонализирани решения' : 'Custom solutions',
      ],
      cta: language === 'bg' ? 'Свържи се' : 'Contact Sales',
    },
  ];

  const handleSelectPlan = (planId: string) => {
    onSelectPlan?.(planId, isAnnual ? 'annual' : 'monthly');
  };

  const calculateSavings = (monthly: number, annual: number) => {
    const yearlyCostMonthly = monthly * 12;
    const savings = yearlyCostMonthly - annual;
    const percentage = Math.round((savings / yearlyCostMonthly) * 100);
    return percentage;
  };

  return (
    <PlansContainer>
      <Header>
        <Title>
          {language === 'bg' ? 'Изберете вашия план' : 'Choose Your Plan'}
        </Title>
        <Subtitle>
          {language === 'bg'
            ? 'Започнете безплатно за 14 дни. Без кредитна карта.'
            : 'Start with a 14-day free trial. No credit card required.'}
        </Subtitle>

        <BillingToggle>
          <ToggleLabel $active={!isAnnual}>
            {language === 'bg' ? 'Месечно' : 'Monthly'}
          </ToggleLabel>
          <ToggleSwitch
            $isAnnual={isAnnual}
            onClick={() => setIsAnnual(!isAnnual)}
            aria-label="Toggle billing period"
          />
          <ToggleLabel $active={isAnnual}>
            {language === 'bg' ? 'Годишно' : 'Annual'}
          </ToggleLabel>
          {isAnnual && (
            <SaveBadge>
              {language === 'bg' ? 'Спести 17%' : 'Save 17%'}
            </SaveBadge>
          )}
        </BillingToggle>
      </Header>

      <PlansGrid>
        {plans.map((plan, index) => (
          <PlanCard
            key={plan.id}
            $featured={plan.featured}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            {plan.featured && (
              <FeaturedBadge>
                <Star />
                {language === 'bg' ? 'Най-популярен' : 'Most Popular'}
              </FeaturedBadge>
            )}

            <PlanIcon $color={plan.iconColor}>
              {plan.icon}
            </PlanIcon>

            <PlanName>{plan.name}</PlanName>
            <PlanDescription>{plan.description}</PlanDescription>

            <PlanPrice>
              <PriceAmount>
                <Currency>$</Currency>
                <Amount>
                  {isAnnual
                    ? Math.round(plan.price.annual / 12)
                    : plan.price.monthly}
                </Amount>
                <Period>
                  /{language === 'bg' ? 'месец' : 'month'}
                </Period>
              </PriceAmount>
              {isAnnual && (
                <OldPrice>
                  ${plan.price.monthly}/{language === 'bg' ? 'месец' : 'month'} {language === 'bg' ? 'месечно' : 'monthly'}
                </OldPrice>
              )}
            </PlanPrice>

            <FeaturesList>
              {plan.features.map((feature, idx) => (
                <Feature key={idx}>
                  <Check />
                  <span>{feature}</span>
                </Feature>
              ))}
            </FeaturesList>

            <CTAButton>
              <Button
                variant={plan.featured ? 'primary' : 'outline'}
                size="large"
                fullWidth
                onClick={() => handleSelectPlan(plan.id)}
              >
                {plan.cta}
              </Button>
            </CTAButton>
          </PlanCard>
        ))}
      </PlansGrid>

      <ComparisonTable>
        <TableTitle>
          {language === 'bg' ? 'Сравнение на плановете' : 'Compare Plans'}
        </TableTitle>
        <Table>
          <thead>
            <tr>
              <TableHeader>{language === 'bg' ? 'Функция' : 'Feature'}</TableHeader>
              <TableHeader>{language === 'bg' ? 'Стартов' : 'Starter'}</TableHeader>
              <TableHeader>{language === 'bg' ? 'Професионален' : 'Professional'}</TableHeader>
              <TableHeader>{language === 'bg' ? 'Корпоративен' : 'Enterprise'}</TableHeader>
            </tr>
          </thead>
          <tbody>
            <TableRow>
              <TableCell>{language === 'bg' ? 'Транзакции/месец' : 'Transactions/month'}</TableCell>
              <TableCell>100</TableCell>
              <TableCell>1,000</TableCell>
              <TableCell>{language === 'bg' ? 'Неограничени' : 'Unlimited'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{language === 'bg' ? 'Локации' : 'Venue Locations'}</TableCell>
              <TableCell>1</TableCell>
              <TableCell>5</TableCell>
              <TableCell>{language === 'bg' ? 'Неограничени' : 'Unlimited'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{language === 'bg' ? 'Аналитика' : 'Analytics'}</TableCell>
              <TableCell>{language === 'bg' ? 'Основна' : 'Basic'}</TableCell>
              <TableCell>{language === 'bg' ? 'Разширена' : 'Advanced'}</TableCell>
              <TableCell>{language === 'bg' ? 'Пълна' : 'Full'}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{language === 'bg' ? 'POS Интеграция' : 'POS Integration'}</TableCell>
              <TableCell>-</TableCell>
              <TableCell>✓</TableCell>
              <TableCell>✓</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>API {language === 'bg' ? 'Достъп' : 'Access'}</TableCell>
              <TableCell>-</TableCell>
              <TableCell>-</TableCell>
              <TableCell>✓</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>{language === 'bg' ? 'Поддръжка' : 'Support'}</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>{language === 'bg' ? 'Приоритетна' : 'Priority'}</TableCell>
              <TableCell>24/7</TableCell>
            </TableRow>
          </tbody>
        </Table>
      </ComparisonTable>
    </PlansContainer>
  );
};

export default PricingPlans;
