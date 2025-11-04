import React from 'react';
import styled from 'styled-components';
import ReceiptScanner from '../components/feature/ReceiptScanner/ReceiptScanner';
import { ReceiptData } from '../services/ocr.service';
import { useLanguage } from '../contexts/LanguageContext';

const PageContainer = styled.div`
  min-height: 100vh;
  padding: 3rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
`;

const ContentWrapper = styled.div`
  max-width: 1000px;
  margin: 0 auto;
`;

const PageHeader = styled.header`
  text-align: center;
  margin-bottom: 3rem;
  color: white;
`;

const PageTitle = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0 0 1rem 0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const PageSubtitle = styled.p`
  font-size: 1.125rem;
  margin: 0;
  opacity: 0.95;
`;

const ScannerCard = styled.div`
  background: white;
  border-radius: 1.5rem;
  padding: 2rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
`;

const InfoSection = styled.div`
  margin-top: 2rem;
  padding: 2rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  backdrop-filter: blur(10px);
  color: white;
`;

const InfoTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
`;

const InfoList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    padding: 0.75rem 0;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;

    &:before {
      content: '✓';
      font-weight: 700;
      color: #10b981;
      background: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 0.875rem;
    }
  }
`;

const FeatureGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-top: 2rem;
`;

const FeatureCard = styled.div`
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  backdrop-filter: blur(10px);
  color: white;
`;

const FeatureIcon = styled.div`
  font-size: 2rem;
  margin-bottom: 1rem;
`;

const FeatureTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
`;

const FeatureDescription = styled.p`
  font-size: 0.875rem;
  margin: 0;
  opacity: 0.9;
  line-height: 1.6;
`;

const ResultsLog = styled.div`
  margin-top: 2rem;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 1rem;
  color: white;
`;

const LogTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 700;
  margin: 0 0 1rem 0;
`;

const LogContent = styled.pre`
  background: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  font-size: 0.8125rem;
  line-height: 1.6;
  margin: 0;
`;

export const ReceiptScannerDemoPage: React.FC = () => {
  const { language } = useLanguage();
  const [scanResults, setScanResults] = React.useState<ReceiptData[]>([]);

  const t = {
    en: {
      title: 'Receipt Scanner Demo',
      subtitle: 'Test our OCR-powered receipt scanning with Tesseract.js',
      featuresTitle: 'Features',
      feature1Title: 'Offline Processing',
      feature1Desc: 'All OCR processing happens client-side. No server required!',
      feature2Title: 'Bulgarian Support',
      feature2Desc: 'Optimized for Bulgarian receipts with multi-language recognition',
      feature3Title: 'Fast & Free',
      feature3Desc: 'No API costs, no rate limits. Scan as many receipts as you need',
      feature4Title: 'Smart Parsing',
      feature4Desc: 'Automatically extracts total amount, date, and merchant name',
      howToTitle: 'How to Use',
      howTo1: 'Upload a photo of a receipt or take a picture',
      howTo2: 'Wait for OCR processing (usually 2-5 seconds)',
      howTo3: 'Review the extracted data',
      howTo4: 'Use the data in your application',
      tipsTitle: 'Tips for Best Results',
      tip1: 'Ensure good lighting when taking photos',
      tip2: 'Keep the receipt flat and in focus',
      tip3: 'Avoid shadows and glare',
      tip4: 'Make sure all text is visible',
      resultsLog: 'Scan Results Log',
      noResults: 'No scans yet. Upload a receipt to see results!',
    },
    bg: {
      title: 'Демо на скенер за касови бележки',
      subtitle: 'Тествайте нашия OCR скенер за бележки с Tesseract.js',
      featuresTitle: 'Функции',
      feature1Title: 'Офлайн обработка',
      feature1Desc: 'Цялата OCR обработка се случва на вашето устройство. Няма нужда от сървър!',
      feature2Title: 'Поддръжка на български',
      feature2Desc: 'Оптимизиран за български бележки с многоезична разпознаване',
      feature3Title: 'Бърз и безплатен',
      feature3Desc: 'Без API разходи, без ограничения. Сканирайте колкото искате бележки',
      feature4Title: 'Интелигентен анализ',
      feature4Desc: 'Автоматично извлича обща сума, дата и име на търговец',
      howToTitle: 'Как да използвате',
      howTo1: 'Качете снимка на бележка или направете снимка',
      howTo2: 'Изчакайте OCR обработката (обикновено 2-5 секунди)',
      howTo3: 'Прегледайте извлечените данни',
      howTo4: 'Използвайте данните във вашето приложение',
      tipsTitle: 'Съвети за най-добри резултати',
      tip1: 'Осигурете добро осветление при снимане',
      tip2: 'Дръжте бележката плоска и на фокус',
      tip3: 'Избягвайте сенки и отблясъци',
      tip4: 'Уверете се, че целият текст е видим',
      resultsLog: 'Лог на резултатите',
      noResults: 'Все още няма сканирания. Качете бележка, за да видите резултати!',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const handleScanComplete = (data: ReceiptData) => {
    console.log('Scan completed:', data);
    setScanResults((prev) => [...prev, { ...data, timestamp: new Date().toISOString() } as any]);
  };

  return (
    <PageContainer>
      <ContentWrapper>
        <PageHeader>
          <PageTitle>{content.title}</PageTitle>
          <PageSubtitle>{content.subtitle}</PageSubtitle>
        </PageHeader>

        <ScannerCard>
          <ReceiptScanner onScanComplete={handleScanComplete} />
        </ScannerCard>

        <InfoSection>
          <InfoTitle>{content.featuresTitle}</InfoTitle>
          <FeatureGrid>
            <FeatureCard>
              <FeatureIcon>📱</FeatureIcon>
              <FeatureTitle>{content.feature1Title}</FeatureTitle>
              <FeatureDescription>{content.feature1Desc}</FeatureDescription>
            </FeatureCard>
            <FeatureCard>
              <FeatureIcon>🇧🇬</FeatureIcon>
              <FeatureTitle>{content.feature2Title}</FeatureTitle>
              <FeatureDescription>{content.feature2Desc}</FeatureDescription>
            </FeatureCard>
            <FeatureCard>
              <FeatureIcon>⚡</FeatureIcon>
              <FeatureTitle>{content.feature3Title}</FeatureTitle>
              <FeatureDescription>{content.feature3Desc}</FeatureDescription>
            </FeatureCard>
            <FeatureCard>
              <FeatureIcon>🧠</FeatureIcon>
              <FeatureTitle>{content.feature4Title}</FeatureTitle>
              <FeatureDescription>{content.feature4Desc}</FeatureDescription>
            </FeatureCard>
          </FeatureGrid>
        </InfoSection>

        <InfoSection>
          <InfoTitle>{content.howToTitle}</InfoTitle>
          <InfoList>
            <li>{content.howTo1}</li>
            <li>{content.howTo2}</li>
            <li>{content.howTo3}</li>
            <li>{content.howTo4}</li>
          </InfoList>
        </InfoSection>

        <InfoSection>
          <InfoTitle>{content.tipsTitle}</InfoTitle>
          <InfoList>
            <li>{content.tip1}</li>
            <li>{content.tip2}</li>
            <li>{content.tip3}</li>
            <li>{content.tip4}</li>
          </InfoList>
        </InfoSection>

        {scanResults.length > 0 && (
          <ResultsLog>
            <LogTitle>{content.resultsLog}</LogTitle>
            <LogContent>{JSON.stringify(scanResults, null, 2)}</LogContent>
          </ResultsLog>
        )}
      </ContentWrapper>
    </PageContainer>
  );
};

export default ReceiptScannerDemoPage;
