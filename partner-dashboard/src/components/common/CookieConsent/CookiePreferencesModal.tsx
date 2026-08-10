import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useCookieConsent, CookiePreferences } from '../../../contexts/CookieConsentContext';
import { useLanguage } from '../../../contexts/LanguageContext';

const ModalOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1rem;
`;

const ModalContainer = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  max-width: 500px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem;
  border-bottom: 1px solid var(--color-border);
`;

const ModalTitle = styled.h2`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary);
  margin: 0;
`;

const CloseButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--color-text-secondary);
  transition: color 0.2s ease;

  &:hover {
    color: var(--color-text-primary);
  }
`;

const ModalBody = styled.div`
  padding: 1.5rem;
`;

const ModalDescription = styled.p`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.9rem;
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0 0 1.5rem 0;
`;

const CookieCategory = styled.div`
  padding: 1rem 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
`;

const CategoryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
`;

const CategoryTitle = styled.h3`
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
`;

const CategoryDescription = styled.p`
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
`;

const Toggle = styled.label<{ $disabled?: boolean }>`
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
  opacity: ${props => props.$disabled ? 0.6 : 1};
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
`;

const ToggleInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;

  &:checked + span {
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
  }

  &:checked + span:before {
    transform: translateX(22px);
  }
`;

const ToggleSlider = styled.span`
  position: absolute;
  cursor: inherit;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-border);
  transition: 0.3s;
  border-radius: 26px;

  &:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background: white;
    transition: 0.3s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
`;

const ModalFooter = styled.div`
  display: flex;
  gap: 0.75rem;
  padding: 1.5rem;
  border-top: 1px solid var(--color-border);

  @media (max-width: 480px) {
    flex-direction: column;
  }
`;

const FooterButton = styled.button<{ $variant: 'primary' | 'secondary' }>`
  flex: 1;
  font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.875rem 1.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => props.$variant === 'primary' && `
    background: linear-gradient(135deg, #c9a237 0%, #d4af37 100%);
    color: #000000;
    border: none;
    box-shadow: 0 4px 15px rgba(201, 162, 55, 0.3);

    &:hover {
      background: linear-gradient(135deg, #d4af37 0%, #c9a237 100%);
      box-shadow: 0 6px 20px rgba(201, 162, 55, 0.4);
    }
  `}

  ${props => props.$variant === 'secondary' && `
    background: var(--color-background-secondary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);

    &:hover {
      background: var(--color-border);
    }
  `}
`;

const CookiePreferencesModal: React.FC = () => {
  const { showModal, closeSettings, preferences, savePreferences, acceptAll } = useCookieConsent();
  const { language } = useLanguage();

  const [localPrefs, setLocalPrefs] = useState<CookiePreferences>(preferences);

  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences, showModal]);

  const content = {
    en: {
      title: 'Cookie Settings',
      description: 'Manage your cookie preferences. Essential cookies are required for the website to function properly.',
      essential: {
        title: 'Essential Cookies',
        description: 'Required for the website to function. Cannot be disabled.',
      },
      analytics: {
        title: 'Analytics Cookies',
        description: 'Help us understand how you use our website so we can improve it.',
      },
      marketing: {
        title: 'Marketing Cookies',
        description: 'Used to show you relevant advertisements and promotions.',
      },
      savePreferences: 'Save Preferences',
      acceptAll: 'Accept All',
    },
    bg: {
      title: 'Настройки на бисквитките',
      description: 'Управлявайте предпочитанията си за бисквитки. Задължителните бисквитки са необходими за правилното функциониране на сайта.',
      essential: {
        title: 'Задължителни бисквитки',
        description: 'Необходими за функционирането на сайта. Не могат да бъдат изключени.',
      },
      analytics: {
        title: 'Бисквитки за анализ',
        description: 'Помагат ни да разберем как използвате сайта, за да го подобрим.',
      },
      marketing: {
        title: 'Маркетинг бисквитки',
        description: 'Използват се за показване на подходящи реклами и отстъпки.',
      },
      savePreferences: 'Запази настройките',
      acceptAll: 'Приемам всички',
    },
  };

  const t = language === 'bg' ? content.bg : content.en;

  const handleToggle = (key: keyof CookiePreferences) => {
    if (key === 'essential') return; // Essential can't be toggled
    setLocalPrefs(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    savePreferences(localPrefs);
  };

  return (
    <AnimatePresence>
      {showModal && (
        <ModalOverlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeSettings}
        >
          <ModalContainer
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
          >
            <ModalHeader>
              <ModalTitle>{t.title}</ModalTitle>
              <CloseButton onClick={closeSettings} aria-label="Close">
                <X size={24} />
              </CloseButton>
            </ModalHeader>

            <ModalBody>
              <ModalDescription>{t.description}</ModalDescription>

              {/* Essential Cookies */}
              <CookieCategory>
                <CategoryHeader>
                  <CategoryTitle>{t.essential.title}</CategoryTitle>
                  <Toggle $disabled>
                    <ToggleInput type="checkbox" checked disabled />
                    <ToggleSlider />
                  </Toggle>
                </CategoryHeader>
                <CategoryDescription>{t.essential.description}</CategoryDescription>
              </CookieCategory>

              {/* Analytics Cookies */}
              <CookieCategory>
                <CategoryHeader>
                  <CategoryTitle>{t.analytics.title}</CategoryTitle>
                  <Toggle>
                    <ToggleInput
                      type="checkbox"
                      checked={localPrefs.analytics}
                      onChange={() => handleToggle('analytics')}
                    />
                    <ToggleSlider />
                  </Toggle>
                </CategoryHeader>
                <CategoryDescription>{t.analytics.description}</CategoryDescription>
              </CookieCategory>

              {/* Marketing Cookies */}
              <CookieCategory>
                <CategoryHeader>
                  <CategoryTitle>{t.marketing.title}</CategoryTitle>
                  <Toggle>
                    <ToggleInput
                      type="checkbox"
                      checked={localPrefs.marketing}
                      onChange={() => handleToggle('marketing')}
                    />
                    <ToggleSlider />
                  </Toggle>
                </CategoryHeader>
                <CategoryDescription>{t.marketing.description}</CategoryDescription>
              </CookieCategory>
            </ModalBody>

            <ModalFooter>
              <FooterButton $variant="secondary" onClick={handleSave}>
                {t.savePreferences}
              </FooterButton>
              <FooterButton $variant="primary" onClick={acceptAll}>
                {t.acceptAll}
              </FooterButton>
            </ModalFooter>
          </ModalContainer>
        </ModalOverlay>
      )}
    </AnimatePresence>
  );
};

export default CookiePreferencesModal;
