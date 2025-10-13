import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Button from '../Button/Button';
import QRCodeLib from 'qrcode';
import { useLanguage } from '../../../contexts/LanguageContext';

interface QRCodeProps {
  data: string;
  size?: number;
  logo?: string;
  downloadable?: boolean;
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

const QRCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: auto;
  image-rendering: pixelated;
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
  title,
  description
}) => {
  const { t } = useLanguage();
  const [qrUrl, setQrUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateQRCode = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const canvas = canvasRef.current;
      if (!canvas) return;

      // Generate QR code on canvas
      await QRCodeLib.toCanvas(canvas, data, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'H', // High error correction for logo overlay
      });

      // If logo is provided, overlay it on the QR code
      if (logo) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';

          logoImg.onload = () => {
            // Calculate logo size (20% of QR code size)
            const logoSize = size * 0.2;
            const logoX = (size - logoSize) / 2;
            const logoY = (size - logoSize) / 2;

            // Draw white background for logo
            ctx.fillStyle = 'white';
            ctx.fillRect(logoX - 4, logoY - 4, logoSize + 8, logoSize + 8);

            // Draw logo
            ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);

            // Convert canvas to data URL
            setQrUrl(canvas.toDataURL('image/png'));
            setIsLoading(false);
          };

          logoImg.onerror = () => {
            // If logo fails to load, use QR code without logo
            setQrUrl(canvas.toDataURL('image/png'));
            setIsLoading(false);
          };

          logoImg.src = logo;
        } else {
          setQrUrl(canvas.toDataURL('image/png'));
          setIsLoading(false);
        }
      } else {
        // No logo, just use the QR code
        setQrUrl(canvas.toDataURL('image/png'));
        setIsLoading(false);
      }
    } catch (err) {
      console.error('QR generation error:', err);
      setError('Error generating QR code');
      setIsLoading(false);
    }
  }, [data, size, logo]);

  useEffect(() => {
    generateQRCode();
  }, [generateQRCode]);

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
                {t('qrCode.download')}
              </Button>
            )}
            {canShare && (
              <Button variant="secondary" size="medium" onClick={handleShare}>
                {t('common.share')}
              </Button>
            )}
            <Button variant="ghost" size="medium" onClick={handleCopyData}>
              {t('common.copy')}
            </Button>
          </Actions>

          <InfoBox>
            <strong>{t('qrCode.scanMe')}:</strong>
            <CodeText>{data}</CodeText>
          </InfoBox>
        </>
      )}
    </QRContainer>
  );
};

export default QRCode;
