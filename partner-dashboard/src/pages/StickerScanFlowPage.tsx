import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { StickerScanner, StickerQRData } from '../components/feature/StickerScanner';
import Webcam from 'react-webcam';
import { ocrService, ReceiptData } from '../services/ocr.service';

// ============================================
// Types
// ============================================

type ScanStep = 'scan-qr' | 'enter-amount' | 'take-photo' | 'processing' | 'complete';

interface ScanData {
  qrData: StickerQRData | null;
  billAmount: number | null;
  receiptImageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  scanId: string | null;
  cashbackAmount: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'manual_review' | null;
}

// ============================================
// Styled Components
// ============================================

const PageContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  display: flex;
  flex-direction: column;
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  color: white;
`;

const BackButton = styled.button`
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
`;

const Title = styled.h1`
  font-size: 24px;
  font-weight: 700;
  margin: 0;
`;

const StepIndicator = styled.div`
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
`;

const StepDot = styled.div<{ $active: boolean; $completed: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: ${props =>
    props.$completed ? '#4caf50' :
    props.$active ? 'white' :
    'rgba(255, 255, 255, 0.3)'
  };
  transition: all 0.3s ease;
  box-shadow: ${props => props.$active ? '0 0 20px rgba(255, 255, 255, 0.5)' : 'none'};
`;

const ContentCard = styled.div`
  background: white;
  border-radius: 24px;
  padding: 32px 24px;
  flex: 1;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
`;

const StepTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 8px 0;
  color: #1a1a1a;
  text-align: center;
`;

const StepDescription = styled.p`
  font-size: 14px;
  color: #666;
  text-align: center;
  margin: 0 0 24px 0;
  line-height: 1.6;
`;

const AmountInputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: center;
  flex: 1;
  justify-content: center;
`;

const AmountInput = styled.input`
  font-size: 48px;
  font-weight: 700;
  text-align: center;
  border: none;
  outline: none;
  width: 100%;
  max-width: 300px;
  color: #1a1a1a;
  padding: 16px;
  border-radius: 16px;
  background: #f5f5f5;

  &::placeholder {
    color: #ccc;
  }

  &:focus {
    background: #eeeeee;
  }
`;

const CurrencyLabel = styled.div`
  font-size: 24px;
  font-weight: 600;
  color: #666;
  margin-top: -16px;
`;

const NumpadContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  max-width: 300px;
  width: 100%;
`;

const NumpadButton = styled.button`
  aspect-ratio: 1;
  border: none;
  background: #f5f5f5;
  border-radius: 16px;
  font-size: 24px;
  font-weight: 700;
  color: #1a1a1a;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: #e0e0e0;
  }

  &:active {
    transform: scale(0.95);
  }

  &.special {
    background: #e3f2fd;
    color: #1976d2;
  }
`;

const PhotoContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  justify-content: center;
`;

const CameraPreview = styled.div`
  width: 100%;
  max-width: 400px;
  aspect-ratio: 4 / 3;
  border-radius: 16px;
  overflow: hidden;
  background: #000;
  position: relative;
`;

const PhotoPreview = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ProcessingContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  text-align: center;
`;

const Spinner = styled.div`
  width: 64px;
  height: 64px;
  border: 4px solid #e0e0e0;
  border-top-color: #1976d2;
  border-radius: 50%;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

const StatusMessage = styled.div<{ $type: 'success' | 'warning' | 'error' | 'info' }>`
  padding: 16px 24px;
  border-radius: 12px;
  font-weight: 600;
  background: ${props => {
    switch (props.$type) {
      case 'success': return '#e8f5e9';
      case 'warning': return '#fff3e0';
      case 'error': return '#ffebee';
      default: return '#e3f2fd';
    }
  }};
  color: ${props => {
    switch (props.$type) {
      case 'success': return '#2e7d32';
      case 'warning': return '#ef6c00';
      case 'error': return '#c62828';
      default: return '#1565c0';
    }
  }};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 12px;
  margin-top: auto;
  padding-top: 24px;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' | 'outline' }>`
  flex: 1;
  padding: 16px;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;

  ${props => {
    switch (props.$variant) {
      case 'primary':
        return `
          background: linear-gradient(135deg, #1976d2 0%, #2196f3 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);

          &:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(25, 118, 210, 0.4);
          }
        `;
      case 'outline':
        return `
          background: transparent;
          color: #1976d2;
          border: 2px solid #1976d2;

          &:hover {
            background: #e3f2fd;
          }
        `;
      default:
        return `
          background: #f5f5f5;
          color: #666;

          &:hover {
            background: #e0e0e0;
          }
        `;
    }
  }}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }
`;

const VenueInfo = styled.div`
  padding: 16px;
  background: #f5f5f5;
  border-radius: 12px;
  margin-bottom: 24px;
`;

const VenueName = styled.div`
  font-weight: 700;
  font-size: 18px;
  color: #1a1a1a;
  margin-bottom: 4px;
`;

const LocationName = styled.div`
  font-size: 14px;
  color: #666;
`;

const CashbackPreview = styled.div`
  padding: 24px;
  background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
  border-radius: 16px;
  color: white;
  text-align: center;
  margin-bottom: 24px;
`;

const CashbackLabel = styled.div`
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
  margin-bottom: 8px;
`;

const CashbackAmount = styled.div`
  font-size: 48px;
  font-weight: 700;
`;

// ============================================
// Component
// ============================================

export const StickerScanFlowPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<ScanStep>('scan-qr');
  const [scanData, setScanData] = useState<ScanData>({
    qrData: null,
    billAmount: null,
    receiptImageUrl: null,
    latitude: null,
    longitude: null,
    scanId: null,
    cashbackAmount: null,
    status: null,
  });
  const [amountInput, setAmountInput] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [ocrData, setOcrData] = useState<ReceiptData | null>(null);
  const [ocrProgress, setOcrProgress] = useState<string>('');
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const webcamRef = React.useRef<Webcam>(null);

  // Get GPS location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setScanData(prev => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }));
        },
        (error) => {
          console.error('GPS error:', error);
        }
      );
    }
  }, []);

  // Handle QR scan
  const handleQRScan = (qrData: StickerQRData) => {
    setScanData(prev => ({ ...prev, qrData }));
    setTimeout(() => setCurrentStep('enter-amount'), 500);
  };

  // Handle amount input
  const handleNumpadClick = (value: string) => {
    if (value === 'clear') {
      setAmountInput('');
    } else if (value === 'backspace') {
      setAmountInput(prev => prev.slice(0, -1));
    } else if (value === '.') {
      if (!amountInput.includes('.')) {
        setAmountInput(prev => prev + '.');
      }
    } else {
      setAmountInput(prev => prev + value);
    }
  };

  const handleAmountConfirm = () => {
    const amount = parseFloat(amountInput);
    if (amount > 0) {
      setScanData(prev => ({ ...prev, billAmount: amount }));
      setCurrentStep('take-photo');
    }
  };

  // Handle photo capture
  const handleCapture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhotoDataUrl(imageSrc);
    }
  };

  const handleRetakePhoto = () => {
    setPhotoDataUrl(null);
  };

  const handlePhotoConfirm = async () => {
    if (!photoDataUrl) return;

    setCurrentStep('processing');
    setIsProcessingOCR(true);

    try {
      // Step 1: Process receipt with OCR
      setOcrProgress('Initializing OCR...');
      await ocrService.initialize('bul+eng');

      setOcrProgress('Analyzing receipt...');

      // Convert data URL to blob for OCR
      const response = await fetch(photoDataUrl);
      const blob = await response.blob();

      const ocrResult = await ocrService.recognizeText(blob);
      setOcrData(ocrResult);
      setOcrProgress('OCR complete!');

      console.log('OCR Result:', ocrResult);

      // Validate OCR amount against user input
      let amountToUse = scanData.billAmount || 0;
      if (ocrResult.totalAmount && scanData.billAmount) {
        const difference = Math.abs(ocrResult.totalAmount - scanData.billAmount);
        if (difference > 5) {
          console.warn(`OCR amount (${ocrResult.totalAmount}) differs from user input (${scanData.billAmount}) by ${difference} BGN`);
        }
      }

      // Step 2: Initiate scan
      setOcrProgress('Submitting scan...');
      const scanResponse = await fetch('/api/stickers/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`, // TODO: Get from auth context
        },
        body: JSON.stringify({
          stickerId: scanData.qrData?.stickerId,
          cardId: 'user-card-id', // TODO: Get from user context
          billAmount: amountToUse,
          latitude: scanData.latitude,
          longitude: scanData.longitude,
        }),
      });

      const scanResult = await scanResponse.json();

      if (!scanResult.success) {
        throw new Error(scanResult.error || 'Failed to scan sticker');
      }

      // Step 3: Upload receipt photo with OCR data
      setOcrProgress('Uploading receipt...');
      // TODO: Upload to cloud storage first, then send URL
      const receiptImageUrl = photoDataUrl; // For now, using data URL

      const receiptResponse = await fetch(`/api/stickers/scan/${scanResult.data.id}/receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          receiptImageUrl,
          ocrData: {
            amount: ocrResult.totalAmount,
            date: ocrResult.date,
            merchantName: ocrResult.merchantName,
            confidence: ocrResult.confidence,
            rawText: ocrResult.rawText,
          },
        }),
      });

      const receiptResult = await receiptResponse.json();

      if (!receiptResult.success) {
        throw new Error(receiptResult.error || 'Failed to upload receipt');
      }

      // Update scan data with result
      setScanData(prev => ({
        ...prev,
        scanId: receiptResult.data.id,
        cashbackAmount: receiptResult.data.cashbackAmount,
        status: receiptResult.data.status,
        receiptImageUrl,
      }));

      setOcrProgress('Complete!');
      setCurrentStep('complete');

    } catch (error: any) {
      console.error('Scan error:', error);
      alert(error.message || 'Failed to process scan');
      setOcrProgress('');
      setIsProcessingOCR(false);
      setCurrentStep('take-photo');
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    switch (currentStep) {
      case 'enter-amount':
        setCurrentStep('scan-qr');
        break;
      case 'take-photo':
        setCurrentStep('enter-amount');
        break;
      case 'processing':
      case 'complete':
        // Cannot go back
        break;
      default:
        navigate(-1);
    }
  };

  // Calculate step progress
  const steps = ['scan-qr', 'enter-amount', 'take-photo', 'processing', 'complete'];
  const currentStepIndex = steps.indexOf(currentStep);

  return (
    <PageContainer>
      <Header>
        <BackButton onClick={handleBack}>
          ← Back
        </BackButton>
        <Title>Scan BOOM Sticker</Title>
        <div style={{ width: '70px' }} /> {/* Spacer */}
      </Header>

      <StepIndicator>
        {steps.map((step, index) => (
          <StepDot
            key={step}
            $active={index === currentStepIndex}
            $completed={index < currentStepIndex}
          />
        ))}
      </StepIndicator>

      <ContentCard>
        {currentStep === 'scan-qr' && (
          <>
            <StepTitle>Scan QR Sticker</StepTitle>
            <StepDescription>
              Point your camera at the BOOM sticker on your table or at the counter
            </StepDescription>
            <StickerScanner
              onScan={handleQRScan}
              onError={(error) => console.error('Scan error:', error)}
              isActive={true}
            />
          </>
        )}

        {currentStep === 'enter-amount' && scanData.qrData && (
          <>
            <StepTitle>Enter Bill Amount</StepTitle>
            <StepDescription>
              How much was your bill?
            </StepDescription>

            <VenueInfo>
              <VenueName>Location Scanned</VenueName>
              <LocationName>{scanData.qrData.stickerId}</LocationName>
            </VenueInfo>

            <AmountInputContainer>
              <AmountInput
                type="text"
                value={amountInput}
                placeholder="0.00"
                readOnly
              />
              <CurrencyLabel>BGN</CurrencyLabel>

              <NumpadContainer>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '←'].map((key) => (
                  <NumpadButton
                    key={key}
                    onClick={() => handleNumpadClick(
                      key === '←' ? 'backspace' : key
                    )}
                    className={key === '.' || key === '←' ? 'special' : ''}
                  >
                    {key}
                  </NumpadButton>
                ))}
              </NumpadContainer>
            </AmountInputContainer>

            <ButtonGroup>
              <Button onClick={handleBack} $variant="secondary">
                Back
              </Button>
              <Button
                onClick={handleAmountConfirm}
                $variant="primary"
                disabled={!amountInput || parseFloat(amountInput) <= 0}
              >
                Continue
              </Button>
            </ButtonGroup>
          </>
        )}

        {currentStep === 'take-photo' && (
          <>
            <StepTitle>Take Receipt Photo</StepTitle>
            <StepDescription>
              Take a clear photo of your receipt
            </StepDescription>

            <PhotoContainer>
              <CameraPreview>
                {!photoDataUrl ? (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ facingMode: 'environment' }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <PhotoPreview src={photoDataUrl} alt="Receipt" />
                )}
              </CameraPreview>

              {photoDataUrl && (
                <StatusMessage $type="success">
                  Receipt captured successfully!
                </StatusMessage>
              )}
            </PhotoContainer>

            <ButtonGroup>
              <Button onClick={handleBack} $variant="secondary">
                Back
              </Button>
              {!photoDataUrl ? (
                <Button onClick={handleCapture} $variant="primary">
                  📷 Capture
                </Button>
              ) : (
                <>
                  <Button onClick={handleRetakePhoto} $variant="outline">
                    Retake
                  </Button>
                  <Button onClick={handlePhotoConfirm} $variant="primary">
                    Submit
                  </Button>
                </>
              )}
            </ButtonGroup>
          </>
        )}

        {currentStep === 'processing' && (
          <ProcessingContainer>
            <Spinner />
            <StepTitle>Processing Your Scan</StepTitle>
            <StepDescription>
              {ocrProgress ? ocrProgress : 'Processing receipt...'}
              <br />
              {isProcessingOCR && 'Reading receipt text...'}
            </StepDescription>
            {ocrData && (
              <StatusMessage $type="info">
                OCR Confidence: {(ocrData.confidence * 100).toFixed(1)}%
                {ocrData.totalAmount && ` | Detected Amount: ${ocrData.totalAmount.toFixed(2)} BGN`}
              </StatusMessage>
            )}
          </ProcessingContainer>
        )}

        {currentStep === 'complete' && scanData.cashbackAmount !== null && (
          <>
            <StepTitle>
              {scanData.status === 'approved' ? '🎉 Success!' : '⏳ Under Review'}
            </StepTitle>
            <StepDescription>
              {scanData.status === 'approved'
                ? 'Your cashback has been credited!'
                : 'Your scan is being reviewed by our team.'}
            </StepDescription>

            {scanData.status === 'approved' && (
              <CashbackPreview>
                <CashbackLabel>You Earned</CashbackLabel>
                <CashbackAmount>{scanData.cashbackAmount.toFixed(2)} BGN</CashbackAmount>
              </CashbackPreview>
            )}

            {scanData.status === 'manual_review' && (
              <StatusMessage $type="warning">
                Your scan has been flagged for manual review. You'll be notified within 24 hours.
              </StatusMessage>
            )}

            <ButtonGroup>
              <Button onClick={() => navigate('/dashboard')} $variant="primary">
                Go to Dashboard
              </Button>
              <Button onClick={() => window.location.reload()} $variant="outline">
                Scan Another
              </Button>
            </ButtonGroup>
          </>
        )}
      </ContentCard>
    </PageContainer>
  );
};

export default StickerScanFlowPage;
