import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Button from '../Button/Button';

interface QRCodeProps {
  data: string;
  size?: number;
  logo?: string;
  downloadable?: boolean;
  language?: 'en' | 'bg';
  title?: string;
  description?: string;
}

const QRContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const QRTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;
  text-align: center;
`;

const QRDescription = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
  margin-bottom: 1.5rem;
  text-align: center;
  max-width: 400px;
`;

const QRImageWrapper = styled(motion.div)`
  position: relative;
  padding: 1.5rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
  margin-bottom: 1.5rem;
`;

const QRImage = styled.img`
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
`;

const Logo = styled.div<{ $url?: string }>`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20%;
  height: 20%;
  background: ${props => props.$url ? `url(${props.$url})` : 'white'};
  background-size: cover;
  background-position: center;
  border-radius: 0.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const InfoBox = styled.div`
  width: 100%;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  margin-top: 1rem;
  font-size: 0.875rem;
  color: #6b7280;
  text-align: center;
`;

const CodeText = styled.code`
  display: block;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  font-family: 'Monaco', 'Courier New', monospace;
  font-size: 0.8125rem;
  color: #111827;
  word-break: break-all;
`;

const LoadingSpinner = styled(motion.div)`
  width: 3rem;
  height: 3rem;
  border: 3px solid #f3f4f6;
  border-top-color: #000000;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

export const QRCode: React.FC<QRCodeProps> = ({
  data,
  size = 256,
  logo,
  downloadable = true,
  language = 'en',
  title,
  description
}) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    generateQRCode();
  }, [data, size]);

  const generateQRCode = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Using QR Server API (free, no API key needed)
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=png`;

      // Verify the QR code loads
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        setQrUrl(qrApiUrl);
        setIsLoading(false);
      };

      img.onerror = () => {
        setError('Failed to generate QR code');
        setIsLoading(false);
      };

      img.src = qrApiUrl;
    } catch (err) {
      setError('Error generating QR code');
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `boomcard-qr-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        const response = await fetch(qrUrl);
        const blob = await response.blob();
        const file = new File([blob], 'qr-code.png', { type: 'image/png' });

        await navigator.share({
          title: title || 'BoomCard QR Code',
          text: description || 'Scan this QR code to view the offer',
          files: [file]
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    }
  };

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  const handleCopyData = () => {
    navigator.clipboard.writeText(data);
    // Toast notification would trigger here
  };

  return (
    <QRContainer>
      {title && <QRTitle>{title}</QRTitle>}
      {description && <QRDescription>{description}</QRDescription>}

      <QRImageWrapper
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {isLoading ? (
          <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</span>
            <span style={{ color: '#ef4444', fontSize: '0.875rem' }}>{error}</span>
          </div>
        ) : (
          <>
            <QRImage src={qrUrl} alt="QR Code" width={size} height={size} />
            {logo && <Logo $url={logo} />}
          </>
        )}
      </QRImageWrapper>

      {!isLoading && !error && (
        <>
          <Actions>
            {downloadable && (
              <Button variant="primary" size="medium" onClick={handleDownload}>
                {language === 'bg' ? 'Изтегли' : 'Download'}
              </Button>
            )}
            {canShare && (
              <Button variant="secondary" size="medium" onClick={handleShare}>
                {language === 'bg' ? 'Сподели' : 'Share'}
              </Button>
            )}
            <Button variant="ghost" size="medium" onClick={handleCopyData}>
              {language === 'bg' ? 'Копирай код' : 'Copy Code'}
            </Button>
          </Actions>

          <InfoBox>
            <strong>{language === 'bg' ? 'Код за сканиране:' : 'Scan Code:'}</strong>
            <CodeText>{data}</CodeText>
          </InfoBox>
        </>
      )}
    </QRContainer>
  );
};

export default QRCode;
