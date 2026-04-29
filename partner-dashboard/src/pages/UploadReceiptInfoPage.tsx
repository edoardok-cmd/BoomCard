import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import GenericPage from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

// Spec §5.3: real QR code linking to the BOOM mobile app. The download
// landing page is responsible for routing to App Store / Google Play.
const APP_DOWNLOAD_URL = (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || 'https://mobile.boomcard.bg';

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
`;

const StepCard = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
  text-align: center;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const StepNumber = styled.div`
  width: 3rem;
  height: 3rem;
  background: #000000;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0 auto 1rem;
`;

const StepTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const StepText = styled.p`
  color: #6b7280;
  line-height: 1.6;
  font-size: 0.95rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const AppSection = styled.div`
  background: #f9fafb;
  border-radius: 1rem;
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
  text-align: center;

  [data-theme="dark"] & {
    background: #111827;
  }

  @media (min-width: 640px) {
    flex-direction: row;
    text-align: left;
  }
`;

const QRImage = styled.img`
  width: 120px;
  height: 120px;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  flex-shrink: 0;
  padding: 0.5rem;
`;

const AppText = styled.div`
  flex: 1;
`;

const AppTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const AppSubtitle = styled.p`
  color: #6b7280;
  margin-bottom: 1rem;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const DownloadButton = styled.a`
  display: inline-block;
  background: #000000;
  color: white;
  padding: 0.75rem 1.75rem;
  border-radius: 0.5rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.2s;

  &:hover {
    background: #1f2937;
  }
`;

const WebNote = styled.p`
  margin-top: 2rem;
  padding: 1rem 1.5rem;
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 0.5rem;
  color: #854d0e;
  font-size: 0.9rem;
  line-height: 1.5;

  [data-theme="dark"] & {
    background: #1c1700;
    border-color: #713f12;
    color: #fde047;
  }
`;

const UploadReceiptInfoPage: React.FC = () => {
  const { language } = useLanguage();
  const isBg = language === 'bg';
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(APP_DOWNLOAD_URL, { errorCorrectionLevel: 'M', width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch((err) => console.error('Failed to generate QR code:', err));
  }, []);

  return (
    <GenericPage
      titleEn="Upload a Receipt"
      titleBg="Качи бележка"
      subtitleEn="Earn cashback by uploading your receipts through the BOOM mobile app"
      subtitleBg="Спечели кешбек, като качиш бележките си през мобилното приложение BOOM"
    >
      <StepsGrid>
        <StepCard>
          <StepNumber>1</StepNumber>
          <StepTitle>{isBg ? 'Сканирай QR' : 'Scan the QR'}</StepTitle>
          <StepText>
            {isBg
              ? 'Сканирай QR кода на касата на партньорско BOOM място при плащане.'
              : 'Scan the QR code at the checkout of a partner BOOM venue when you pay.'}
          </StepText>
        </StepCard>

        <StepCard>
          <StepNumber>2</StepNumber>
          <StepTitle>{isBg ? 'Плати' : 'Pay'}</StepTitle>
          <StepText>
            {isBg
              ? 'Заплати сметката си по обичайния начин — с карта или в брой.'
              : 'Pay your bill as usual — by card or cash.'}
          </StepText>
        </StepCard>

        <StepCard>
          <StepNumber>3</StepNumber>
          <StepTitle>{isBg ? 'Качи бележка' : 'Upload Receipt'}</StepTitle>
          <StepText>
            {isBg
              ? 'Качи снимка на бележката си през приложението BOOM и получи кешбек.'
              : 'Upload a photo of your receipt through the BOOM app and receive your cashback.'}
          </StepText>
        </StepCard>
      </StepsGrid>

      <AppSection>
        {qrDataUrl && (
          <QRImage src={qrDataUrl} alt={isBg ? 'QR код за приложението BOOM' : 'BOOM app QR code'} />
        )}
        <AppText>
          <AppTitle>
            {isBg ? 'Свали приложението BOOM' : 'Download the BOOM App'}
          </AppTitle>
          <AppSubtitle>
            {isBg
              ? 'Качването на бележки е достъпно само от мобилното приложение. Свали BOOM от App Store или Google Play.'
              : 'Receipt uploads are available only through the mobile app. Download BOOM from the App Store or Google Play.'}
          </AppSubtitle>
          <DownloadButton href="https://mobile.boomcard.bg" target="_blank" rel="noopener noreferrer">
            {isBg ? 'Свали приложението' : 'Download the App'}
          </DownloadButton>
        </AppText>
      </AppSection>

      <WebNote>
        {isBg
          ? 'Уеб версията на BOOM не приема качване на бележки. Моля, използвай мобилното приложение.'
          : 'The BOOM web version does not accept receipt uploads. Please use the mobile app.'}
      </WebNote>
    </GenericPage>
  );
};

export default UploadReceiptInfoPage;
