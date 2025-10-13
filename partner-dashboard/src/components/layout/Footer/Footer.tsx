import React from 'react';
import { StyledFooter } from './Footer.styles';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../../contexts/LanguageContext';

export interface FooterProps {
  children?: React.ReactNode;
  className?: string;
}

export const Footer: React.FC<FooterProps> = ({
  children,
  className
}) => {
  const { t } = useLanguage();

  return (
    <StyledFooter className={className}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-4">BoomCard</h3>
            <p className="text-gray-600 text-sm">
              {t('footer.description')}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">{t('footer.product')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/features" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.features')}</Link></li>
              <li><Link to="/pricing" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.pricing')}</Link></li>
              <li><Link to="/integrations" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.integrations')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">{t('footer.company')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/about" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.about')}</Link></li>
              <li><Link to="/contact" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.contact')}</Link></li>
              <li><Link to="/careers" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.careers')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-4">{t('footer.legal')}</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.privacy')}</Link></li>
              <li><Link to="/terms" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.terms')}</Link></li>
              <li><Link to="/security" className="text-gray-600 hover:text-gray-900 transition-colors">{t('footer.security')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 pt-8">
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} BoomCard. {t('footer.allRightsReserved')}
          </p>
        </div>
      </div>
      {children}
    </StyledFooter>
  );
};

export default Footer;