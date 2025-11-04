import React, { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';
import { ocrService, ReceiptData } from '../../../services/ocr.service';
import { Camera, Upload, X, FileText, CheckCircle, AlertCircle, Save } from 'lucide-react';
import { receiptsApiService } from '../../../services/receipts-api.service';

interface ReceiptScannerProps {
  onScanComplete?: (data: ReceiptData) => void;
  onSaveComplete?: (receiptId: string) => void;
  autoSave?: boolean; // Automatically save to backend after OCR
  className?: string;
}

// Styled Components
const ScannerContainer = styled.div`
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
`;

const UploadArea = styled.div<{ $isDragging: boolean }>`
  border: 2px dashed ${props => props.$isDragging ? '#000000' : '#d1d5db'};
  border-radius: 1rem;
  padding: 2rem;
  text-align: center;
  background: ${props => props.$isDragging ? '#f9fafb' : 'white'};
  transition: all 0.2s;
  cursor: pointer;

  &:hover {
    border-color: #000000;
    background: #f9fafb;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-top: 1.5rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: ${props => props.$variant === 'primary' ? '#000000' : 'white'};
  color: ${props => props.$variant === 'primary' ? 'white' : '#111827'};
  border: 2px solid ${props => props.$variant === 'primary' ? '#000000' : '#d1d5db'};
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const PreviewSection = styled.div`
  margin-top: 2rem;
  border-radius: 1rem;
  overflow: hidden;
  border: 2px solid #e5e7eb;
`;

const PreviewImage = styled.img`
  width: 100%;
  max-height: 400px;
  object-fit: contain;
  background: #f9fafb;
`;

const ProcessingOverlay = styled.div`
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  text-align: center;
`;

const ProcessingText = styled.div`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const ProgressBar = styled.div`
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: white;
  transition: width 0.3s ease;
`;

const ResultsSection = styled.div`
  margin-top: 2rem;
  padding: 2rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 1rem;
`;

const ResultHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #e5e7eb;

  svg {
    color: #10b981;
  }
`;

const ResultTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
  margin: 0;
`;

const ResultGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const ResultItem = styled.div`
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
`;

const ResultLabel = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
`;

const ResultValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
`;

const RawTextSection = styled.div`
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f9fafb;
  border-radius: 0.5rem;
  border: 1px solid #e5e7eb;
`;

const RawTextLabel = styled.div`
  font-size: 0.8125rem;
  color: #6b7280;
  font-weight: 600;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const RawText = styled.pre`
  font-family: 'Courier New', monospace;
  font-size: 0.875rem;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  line-height: 1.6;
`;

const ConfidenceBadge = styled.div<{ $confidence: number }>`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: ${props => props.$confidence >= 70 ? '#d1fae5' : '#fef3c7'};
  color: ${props => props.$confidence >= 70 ? '#065f46' : '#92400e'};
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
`;

const ErrorMessage = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.75rem;
  color: #dc2626;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    flex-shrink: 0;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const IconWrapper = styled.div`
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  color: #9ca3af;
`;

const UploadTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem 0;
`;

const UploadDescription = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
`;

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
  onScanComplete,
  onSaveComplete,
  autoSave = false,
  className,
}) => {
  const { language } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ReceiptData | null>(null);
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      title: 'Scan Receipt',
      description: 'Upload a photo of your receipt or take a picture',
      dragDrop: 'Drag and drop receipt image here',
      uploadButton: 'Choose File',
      cameraButton: 'Take Photo',
      scanButton: 'Scan Receipt',
      processing: 'Processing receipt...',
      initializing: 'Initializing OCR...',
      extracting: 'Extracting text...',
      parsing: 'Parsing data...',
      resultsTitle: 'Scan Results',
      totalAmount: 'Total Amount',
      date: 'Date',
      merchant: 'Merchant',
      confidence: 'Confidence',
      rawText: 'Raw Text',
      errorTitle: 'Scan Failed',
      errorInvalidFile: 'Please select a valid image file (JPG, PNG, WebP)',
      errorProcessing: 'Failed to process receipt. Please try again.',
      errorSaving: 'Failed to save receipt. Please try again.',
      newScan: 'Scan Another',
      saveReceipt: 'Save Receipt',
      saving: 'Saving...',
      saved: 'Saved Successfully',
    },
    bg: {
      title: 'Сканиране на касова бележка',
      description: 'Качете снимка на бележката или направете снимка',
      dragDrop: 'Плъзнете и пуснете снимка на касова бележка тук',
      uploadButton: 'Избери файл',
      cameraButton: 'Направи снимка',
      scanButton: 'Сканирай бележка',
      processing: 'Обработване на бележка...',
      initializing: 'Инициализиране на OCR...',
      extracting: 'Извличане на текст...',
      parsing: 'Анализиране на данни...',
      resultsTitle: 'Резултати от сканирането',
      totalAmount: 'Обща сума',
      date: 'Дата',
      merchant: 'Търговец',
      confidence: 'Точност',
      rawText: 'Извлечен текст',
      errorTitle: 'Сканирането се провали',
      errorInvalidFile: 'Моля изберете валиден файл с изображение (JPG, PNG, WebP)',
      errorProcessing: 'Неуспешно обработване на бележката. Моля опитайте отново.',
      errorSaving: 'Неуспешно запазване на бележката. Моля опитайте отново.',
      newScan: 'Ново сканиране',
      saveReceipt: 'Запази бележка',
      saving: 'Записване...',
      saved: 'Записано успешно',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError(content.errorInvalidFile);
      return;
    }

    setError('');
    setSelectedImage(file);
    setResult(null);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, [content.errorInvalidFile]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleCameraCapture = () => {
    cameraInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const simulateProgress = (callback: () => void, duration: number) => {
    let currentProgress = 0;
    const steps = 20;
    const increment = 100 / steps;
    const interval = duration / steps;

    const timer = setInterval(() => {
      currentProgress += increment;
      if (currentProgress >= 100) {
        setProgress(100);
        clearInterval(timer);
        callback();
      } else {
        setProgress(currentProgress);
      }
    }, interval);
  };

  const handleScan = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setProgress(0);
    setError('');
    setSavedReceiptId(null);

    try {
      // Initialize OCR
      await ocrService.initialize('bul+eng');
      setProgress(30);

      // Process image
      const receiptData = await ocrService.recognizeText(selectedImage);

      setProgress(100);
      setResult(receiptData);

      // Callback with results
      if (onScanComplete) {
        onScanComplete(receiptData);
      }

      // Auto-save if enabled
      if (autoSave) {
        await handleSaveReceipt(receiptData);
      }
    } catch (err) {
      console.error('Receipt scan error:', err);
      setError(content.errorProcessing);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveReceipt = async (receiptData?: ReceiptData) => {
    const dataToSave = receiptData || result;
    if (!dataToSave || !imagePreview) return;

    setIsSaving(true);
    setError('');

    try {
      // Convert image preview to base64 (for hash generation)
      const response = await receiptsApiService.createReceipt({
        totalAmount: dataToSave.totalAmount,
        merchantName: dataToSave.merchantName,
        date: dataToSave.date,
        items: dataToSave.items,
        rawText: dataToSave.rawText,
        confidence: dataToSave.confidence,
        imageData: imagePreview, // Base64 for hash generation
        imageUrl: imagePreview, // TODO: Upload to S3/storage in production
      });

      if (response.success && response.data.id) {
        setSavedReceiptId(response.data.id);

        if (onSaveComplete) {
          onSaveComplete(response.data.id);
        }

        console.log('✅ Receipt saved successfully:', response.data.id);
      }
    } catch (err) {
      console.error('Receipt save error:', err);
      setError(content.errorSaving);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNewScan = () => {
    setSelectedImage(null);
    setImagePreview('');
    setResult(null);
    setError('');
    setProgress(0);
    setSavedReceiptId(null);
  };

  return (
    <ScannerContainer className={className}>
      {!selectedImage && !result && (
        <UploadArea
          $isDragging={isDragging}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={handleFileSelect}
        >
          <IconWrapper>
            <FileText size={64} />
          </IconWrapper>
          <UploadTitle>{content.title}</UploadTitle>
          <UploadDescription>{content.dragDrop}</UploadDescription>

          <ButtonGroup>
            <ActionButton $variant="primary" onClick={(e) => { e.stopPropagation(); handleFileSelect(); }}>
              <Upload size={20} />
              {content.uploadButton}
            </ActionButton>
            <ActionButton $variant="secondary" onClick={(e) => { e.stopPropagation(); handleCameraCapture(); }}>
              <Camera size={20} />
              {content.cameraButton}
            </ActionButton>
          </ButtonGroup>
        </UploadArea>
      )}

      <HiddenInput
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleInputChange}
      />
      <HiddenInput
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
      />

      {selectedImage && !result && (
        <PreviewSection>
          <PreviewImage src={imagePreview} alt="Receipt preview" />
          {isProcessing ? (
            <ProcessingOverlay>
              <ProcessingText>{content.processing}</ProcessingText>
              <ProgressBar>
                <ProgressFill $progress={progress} />
              </ProgressBar>
            </ProcessingOverlay>
          ) : (
            <ButtonGroup style={{ padding: '1.5rem' }}>
              <ActionButton $variant="primary" onClick={handleScan}>
                <FileText size={20} />
                {content.scanButton}
              </ActionButton>
              <ActionButton $variant="secondary" onClick={handleNewScan}>
                <X size={20} />
                {language === 'bg' ? 'Отказ' : 'Cancel'}
              </ActionButton>
            </ButtonGroup>
          )}
        </PreviewSection>
      )}

      {error && (
        <ErrorMessage>
          <AlertCircle size={20} />
          <div>
            <strong>{content.errorTitle}</strong>
            <div>{error}</div>
          </div>
        </ErrorMessage>
      )}

      {result && (
        <>
          <PreviewSection>
            <PreviewImage src={imagePreview} alt="Scanned receipt" />
          </PreviewSection>

          <ResultsSection>
            <ResultHeader>
              <CheckCircle size={28} />
              <ResultTitle>{content.resultsTitle}</ResultTitle>
              <ConfidenceBadge $confidence={result.confidence}>
                {content.confidence}: {result.confidence.toFixed(0)}%
              </ConfidenceBadge>
            </ResultHeader>

            <ResultGrid>
              {result.totalAmount && (
                <ResultItem>
                  <ResultLabel>{content.totalAmount}</ResultLabel>
                  <ResultValue>{result.totalAmount.toFixed(2)} лв</ResultValue>
                </ResultItem>
              )}

              {result.date && (
                <ResultItem>
                  <ResultLabel>{content.date}</ResultLabel>
                  <ResultValue style={{ fontSize: '1.125rem' }}>{result.date}</ResultValue>
                </ResultItem>
              )}

              {result.merchantName && (
                <ResultItem>
                  <ResultLabel>{content.merchant}</ResultLabel>
                  <ResultValue style={{ fontSize: '1.125rem' }}>{result.merchantName}</ResultValue>
                </ResultItem>
              )}
            </ResultGrid>

            <RawTextSection>
              <RawTextLabel>
                <FileText size={16} />
                {content.rawText}
              </RawTextLabel>
              <RawText>{result.rawText}</RawText>
            </RawTextSection>

            <ButtonGroup>
              {!savedReceiptId && !autoSave && (
                <ActionButton
                  $variant="primary"
                  onClick={() => handleSaveReceipt()}
                  disabled={isSaving}
                >
                  <Save size={20} />
                  {isSaving ? content.saving : content.saveReceipt}
                </ActionButton>
              )}
              {savedReceiptId && (
                <ConfidenceBadge $confidence={100} style={{ margin: '0' }}>
                  <CheckCircle size={16} />
                  {content.saved}
                </ConfidenceBadge>
              )}
              <ActionButton $variant="secondary" onClick={handleNewScan}>
                {content.newScan}
              </ActionButton>
            </ButtonGroup>
          </ResultsSection>
        </>
      )}
    </ScannerContainer>
  );
};

export default ReceiptScanner;
