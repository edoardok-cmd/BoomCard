import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import jsQR from 'jsqr';
import styled from 'styled-components';

// ============================================
// Styled Components
// ============================================

const ScannerContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  border-radius: 16px;
  overflow: hidden;
  background: var(--color-background-dark, #1a1a1a);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
`;

const WebcamContainer = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const StyledWebcam = styled(Webcam)`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const ScanOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
`;

const ScanFrame = styled.div<{ $isScanning: boolean }>`
  width: 280px;
  height: 280px;
  border: 3px solid ${props => props.$isScanning ? '#00ff00' : '#ffffff'};
  border-radius: 16px;
  position: relative;
  box-shadow: 0 0 0 99999px rgba(0, 0, 0, 0.5);
  transition: border-color 0.3s ease;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid ${props => props.$isScanning ? '#00ff00' : '#ffffff'};
    transition: border-color 0.3s ease;
  }

  &::before {
    top: -3px;
    left: -3px;
    border-right: none;
    border-bottom: none;
  }

  &::after {
    top: -3px;
    right: -3px;
    border-left: none;
    border-bottom: none;
  }
`;

const ScanFrameCorners = styled.div`
  position: absolute;
  inset: 0;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    border: 3px solid;
    border-color: inherit;
  }

  &::before {
    bottom: -3px;
    left: -3px;
    border-right: none;
    border-top: none;
  }

  &::after {
    bottom: -3px;
    right: -3px;
    border-left: none;
    border-top: none;
  }
`;

const ScanLine = styled.div<{ $isScanning: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    ${props => props.$isScanning ? '#00ff00' : '#ffffff'} 50%,
    transparent 100%
  );
  animation: ${props => props.$isScanning ? 'scan 2s ease-in-out infinite' : 'none'};

  @keyframes scan {
    0%, 100% {
      top: 10%;
      opacity: 0.5;
    }
    50% {
      top: 90%;
      opacity: 1;
    }
  }
`;

const StatusBar = styled.div<{ $status: 'idle' | 'scanning' | 'success' | 'error' }>`
  padding: 16px 24px;
  background: ${props => {
    switch (props.$status) {
      case 'success': return 'linear-gradient(135deg, #00c853 0%, #00e676 100%)';
      case 'error': return 'linear-gradient(135deg, #d32f2f 0%, #f44336 100%)';
      case 'scanning': return 'linear-gradient(135deg, #1976d2 0%, #2196f3 100%)';
      default: return 'linear-gradient(135deg, #424242 0%, #616161 100%)';
    }
  }};
  color: white;
  text-align: center;
  font-weight: 600;
  transition: background 0.3s ease;
`;

const ControlButtons = styled.div`
  padding: 16px;
  display: flex;
  gap: 12px;
  justify-content: center;
  background: var(--color-background, #f5f5f5);
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: ${props => props.$variant === 'primary'
    ? 'linear-gradient(135deg, #1976d2 0%, #2196f3 100%)'
    : 'linear-gradient(135deg, #616161 0%, #757575 100%)'
  };
  color: white;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorMessage = styled.div`
  padding: 16px 24px;
  background: #ffebee;
  color: #c62828;
  border-radius: 8px;
  margin: 16px;
  font-size: 14px;
  text-align: center;
`;

const InfoText = styled.div`
  padding: 16px 24px;
  text-align: center;
  color: var(--color-text-secondary, #666);
  font-size: 14px;
  line-height: 1.6;
`;

const CanvasContainer = styled.div`
  position: absolute;
  top: -9999px;
  left: -9999px;
`;

// ============================================
// Types
// ============================================

export interface StickerQRData {
  type: 'BOOM_STICKER';
  venueId: string;
  locationId: string;
  stickerId: string;
  locationType: string;
  version: string;
}

interface StickerScannerProps {
  onScan: (data: StickerQRData) => void;
  onError?: (error: string) => void;
  onClose?: () => void;
  isActive?: boolean;
}

type ScanStatus = 'idle' | 'scanning' | 'success' | 'error';

// ============================================
// Component
// ============================================

export const StickerScanner: React.FC<StickerScannerProps> = ({
  onScan,
  onError,
  onClose,
  isActive = true,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('Position QR code within the frame');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Camera constraints
  const videoConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    facingMode: 'environment', // Use back camera on mobile
  };

  // Handle camera ready
  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
    setStatus('scanning');
    setStatusMessage('Scanning for QR code...');
  }, []);

  // Handle camera error
  const handleCameraError = useCallback((error: string | DOMException) => {
    console.error('Camera error:', error);
    const errorMsg = typeof error === 'string' ? error : error.message;
    setCameraError(`Camera access denied or unavailable: ${errorMsg}`);
    setStatus('error');
    setStatusMessage('Camera access required');
    onError?.(errorMsg);
  }, [onError]);

  // Parse QR code data
  const parseQRData = useCallback((rawData: string): StickerQRData | null => {
    try {
      const data = JSON.parse(rawData);

      // Validate BOOM sticker format
      if (data.type !== 'BOOM_STICKER') {
        throw new Error('Invalid sticker type');
      }

      if (!data.venueId || !data.locationId || !data.stickerId) {
        throw new Error('Missing required sticker data');
      }

      return data as StickerQRData;
    } catch (error) {
      console.error('QR parse error:', error);
      return null;
    }
  }, []);

  // Scan QR code from video frame
  const scanQRCode = useCallback(() => {
    if (!isActive || !isCameraReady || !webcamRef.current || !canvasRef.current) {
      return;
    }

    const video = webcamRef.current.video;
    const canvas = canvasRef.current;

    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) return;

    // Set canvas size to video size
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data from canvas
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Scan for QR code
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code && code.data) {
      // QR code found!
      const qrData = parseQRData(code.data);

      if (qrData) {
        setStatus('success');
        setStatusMessage(`Sticker found: ${qrData.stickerId}`);

        // Stop scanning
        if (scanIntervalRef.current) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }

        // Notify parent
        onScan(qrData);
      } else {
        setStatus('error');
        setStatusMessage('Invalid BOOM sticker QR code');
        setTimeout(() => {
          setStatus('scanning');
          setStatusMessage('Scanning for QR code...');
        }, 2000);
      }
    }
  }, [isActive, isCameraReady, parseQRData, onScan]);

  // Start/stop scanning
  useEffect(() => {
    if (isActive && isCameraReady) {
      // Start scanning every 300ms
      scanIntervalRef.current = setInterval(scanQRCode, 300);
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [isActive, isCameraReady, scanQRCode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  // Handle manual stop
  const handleStop = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    setStatus('idle');
    setStatusMessage('Scanner stopped');
    onClose?.();
  }, [onClose]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setCameraError(null);
    setStatus('idle');
    setStatusMessage('Position QR code within the frame');
    setIsCameraReady(false);
    // Force camera refresh by remounting
    setTimeout(() => setIsCameraReady(false), 100);
  }, []);

  return (
    <ScannerContainer>
      {cameraError ? (
        <>
          <ErrorMessage>
            {cameraError}
            <br /><br />
            <strong>Please ensure:</strong><br />
            • Camera permissions are granted<br />
            • No other app is using the camera<br />
            • Your browser supports camera access
          </ErrorMessage>
          <ControlButtons>
            <Button onClick={handleRetry} $variant="primary">
              Retry
            </Button>
            {onClose && (
              <Button onClick={onClose} $variant="secondary">
                Cancel
              </Button>
            )}
          </ControlButtons>
        </>
      ) : (
        <>
          <WebcamContainer>
            <StyledWebcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              onUserMedia={handleCameraReady}
              onUserMediaError={handleCameraError}
            />

            {isCameraReady && (
              <ScanOverlay>
                <ScanFrame $isScanning={status === 'scanning'}>
                  <ScanFrameCorners />
                  <ScanLine $isScanning={status === 'scanning'} />
                </ScanFrame>
              </ScanOverlay>
            )}
          </WebcamContainer>

          <StatusBar $status={status}>
            {statusMessage}
          </StatusBar>

          {status === 'idle' && (
            <InfoText>
              Point your camera at a BOOM sticker QR code.<br />
              The scanner will automatically detect and read the code.
            </InfoText>
          )}

          <ControlButtons>
            {status === 'success' ? (
              <>
                {onClose && (
                  <Button onClick={onClose} $variant="primary">
                    Continue
                  </Button>
                )}
              </>
            ) : (
              <>
                {onClose && (
                  <Button onClick={handleStop} $variant="secondary">
                    Cancel Scan
                  </Button>
                )}
              </>
            )}
          </ControlButtons>
        </>
      )}

      {/* Hidden canvas for QR processing */}
      <CanvasContainer>
        <canvas ref={canvasRef} />
      </CanvasContainer>
    </ScannerContainer>
  );
};

export default StickerScanner;
