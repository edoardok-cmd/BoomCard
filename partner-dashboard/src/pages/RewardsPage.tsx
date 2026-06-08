import React from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { Gift } from 'lucide-react';


/**
 * SPEC §8a — UNSPECIFIED FEATURE
 * The loyalty-points / tier / referral rewards system is absent from the
 * BoomCard partner spec (07-partner-spec-extracted.md).  Rendering fabricated
 * financial balances and an interactive redemption flow to real partner users
 * violates spec §12 Rule 1 (data integrity) and is misleading.
 *
 * Until a product specification is approved and real API endpoints exist,
 * this page renders a clearly-labelled "coming soon" placeholder.
 * No state mutations, no mock data, no fake redemption flows.
 */
const RewardsPage: React.FC = () => {
  const { language } = useLanguage();

  // H1 fix (review r2w): the loyalty-points / tier / referral system has no
  // approved product specification (spec §8a).  All interactive mock data was
  // removed to prevent real partners from acting on fabricated financial
  // balances.  Render a clearly-labelled placeholder until a real backend
  // and product spec exist.
  const isEnglish = language !== 'bg';

  return (
    <ComingSoonContainer>
      <ComingSoonCard
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <ComingSoonIcon>
          <Gift size={48} />
        </ComingSoonIcon>
        <ComingSoonTitle>
          {isEnglish ? 'Loyalty Rewards — Coming Soon' : 'Програма за лоялност — Очаквайте скоро'}
        </ComingSoonTitle>
        <ComingSoonText>
          {isEnglish
            ? 'The loyalty rewards program is under development. Check back soon for points, tiers, and exclusive partner rewards.'
            : 'Програмата за лоялни награди е в разработка. Очаквайте скоро точки, нива и ексклузивни партньорски награди.'}
        </ComingSoonText>
        <ComingSoonContact>
          {isEnglish ? 'Questions? Contact ' : 'Въпроси? Свържете се с '}
          <a href="mailto:office@boomcard.bg">office@boomcard.bg</a>
        </ComingSoonContact>
      </ComingSoonCard>
    </ComingSoonContainer>
  );
};

/* Coming-soon placeholder styled components — added by H1 fix (review r2w) */
const ComingSoonContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 2rem;
`;

const ComingSoonCard = styled(motion.div)`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  box-shadow: var(--shadow-soft);
  padding: 3rem 2.5rem;
  max-width: 560px;
  width: 100%;
  text-align: center;
`;

const ComingSoonIcon = styled.div`
  color: var(--color-text-secondary);
  margin-bottom: 1.5rem;
  display: flex;
  justify-content: center;
`;

const ComingSoonTitle = styled.h1`
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0 0 1rem;
`;

const ComingSoonText = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 1.5rem;
`;

const ComingSoonContact = styled.p`
  font-size: 0.9375rem;
  color: var(--color-text-secondary);
  margin: 0;

  a {
    color: var(--color-text-primary);
    font-weight: 600;
    text-decoration: underline;
  }
`;

export default RewardsPage;
