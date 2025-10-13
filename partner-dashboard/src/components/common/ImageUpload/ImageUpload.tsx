import React, { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { useLanguage } from '../../../contexts/LanguageContext';

interface ImageUploadProps {
  onUpload: (files: File[]) => Promise<void>;
  multiple?: boolean;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedFormats?: string[];
  existingImages?: string[];
  onRemoveExisting?: (imageUrl: string) => void;
  className?: string;
}

const UploadContainer = styled.div`
  width: 100%;
`;

const DropZone = styled.div<{ $isDragging: boolean; $hasError: boolean }>`
  border: 2px dashed ${props => props.$hasError ? '#ef4444' : props.$isDragging ? '#000000' : '#d1d5db'};
  border-radius: 1rem;
  padding: 3rem 2rem;
  text-align: center;
  background: ${props => props.$isDragging ? '#f9fafb' : 'white'};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: ${props => props.$hasError ? '#ef4444' : '#000000'};
    background: #f9fafb;
  }
`;

const DropZoneContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
`;

const UploadIcon = styled.svg`
  width: 48px;
  height: 48px;
  color: #9ca3af;
`;

const UploadTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
`;

const UploadDescription = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin: 0;
`;

const UploadButton = styled.button`
  margin-top: 0.5rem;
  padding: 0.625rem 1.5rem;
  background: #000000;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #1f2937;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    background: #d1d5db;
    cursor: not-allowed;
    transform: none;
  }
`;

const PreviewGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
  margin-top: 1.5rem;
`;

const PreviewItem = styled.div`
  position: relative;
  aspect-ratio: 1;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
`;

const PreviewImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const RemoveButton = styled.button`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  backdrop-filter: blur(4px);

  &:hover {
    background: rgba(239, 68, 68, 0.9);
    transform: scale(1.1);
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const ProgressOverlay = styled.div`
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: white;
  font-size: 0.875rem;
  font-weight: 600;
`;

const ProgressBar = styled.div`
  width: 80%;
  height: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  overflow: hidden;
`;

const ProgressFill = styled.div<{ $progress: number }>`
  width: ${props => props.$progress}%;
  height: 100%;
  background: white;
  transition: width 0.3s;
`;

const ErrorMessage = styled.div`
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  color: #dc2626;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

const FileInfo = styled.div`
  margin-top: 1rem;
  font-size: 0.8125rem;
  color: #6b7280;
  text-align: center;
`;

const HiddenInput = styled.input`
  display: none;
`;

export const ImageUpload: React.FC<ImageUploadProps> = ({
  onUpload,
  multiple = true,
  maxFiles = 10,
  maxSizeMB = 5,
  acceptedFormats = ['image/jpeg', 'image/png', 'image/webp'],
  existingImages = [],
  onRemoveExisting,
  className,
}) => {
  const { language } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = {
    en: {
      title: 'Upload Images',
      description: 'Drag and drop images here, or click to select',
      button: 'Select Files',
      uploading: 'Uploading...',
      maxFiles: `Maximum ${maxFiles} files`,
      maxSize: `Max size: ${maxSizeMB}MB per file`,
      formats: 'Formats: JPG, PNG, WebP',
      errorTooMany: `You can only upload up to ${maxFiles} images`,
      errorTooLarge: `File size must be less than ${maxSizeMB}MB`,
      errorInvalidFormat: 'Invalid file format. Please upload JPG, PNG or WebP images',
      errorUploadFailed: 'Upload failed. Please try again',
    },
    bg: {
      title: 'Качване на снимки',
      description: 'Плъзнете и пуснете снимки тук или кликнете за избор',
      button: 'Избери файлове',
      uploading: 'Качване...',
      maxFiles: `Максимум ${maxFiles} файла`,
      maxSize: `Макс. размер: ${maxSizeMB}MB на файл`,
      formats: 'Формати: JPG, PNG, WebP',
      errorTooMany: `Можете да качите до ${maxFiles} снимки`,
      errorTooLarge: `Размерът на файла трябва да бъде по-малък от ${maxSizeMB}MB`,
      errorInvalidFormat: 'Невалиден формат. Моля качете JPG, PNG или WebP снимки',
      errorUploadFailed: 'Качването се провали. Моля опитайте отново',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const validateFiles = useCallback((files: File[]): { valid: File[]; error: string } => {
    const totalFiles = existingImages.length + selectedFiles.length + files.length;

    if (totalFiles > maxFiles) {
      return { valid: [], error: content.errorTooMany };
    }

    const validFiles: File[] = [];

    for (const file of files) {
      // Check file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        return { valid: [], error: content.errorTooLarge };
      }

      // Check file format
      if (!acceptedFormats.includes(file.type)) {
        return { valid: [], error: content.errorInvalidFormat };
      }

      validFiles.push(file);
    }

    return { valid: validFiles, error: '' };
  }, [existingImages.length, selectedFiles.length, maxFiles, maxSizeMB, acceptedFormats, content]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const { valid, error } = validateFiles(fileArray);

    if (error) {
      setError(error);
      return;
    }

    setError('');
    setSelectedFiles(prev => [...prev, ...valid]);

    // Create previews
    valid.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  }, [validateFiles]);

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

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setError('');

    try {
      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await onUpload(selectedFiles);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Clear selected files and previews after successful upload
      setTimeout(() => {
        setSelectedFiles([]);
        setPreviews([]);
        setUploadProgress(0);
        setUploading(false);
      }, 500);
    } catch (err) {
      console.error('Upload error:', err);
      setError(content.errorUploadFailed);
      setUploadProgress(0);
      setUploading(false);
    }
  };

  return (
    <UploadContainer className={className}>
      <DropZone
        $isDragging={isDragging}
        $hasError={!!error}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <DropZoneContent>
          <UploadIcon fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </UploadIcon>
          <div>
            <UploadTitle>{content.title}</UploadTitle>
            <UploadDescription>{content.description}</UploadDescription>
          </div>
          <UploadButton type="button" onClick={(e) => { e.stopPropagation(); handleClick(); }}>
            {content.button}
          </UploadButton>
        </DropZoneContent>
      </DropZone>

      <HiddenInput
        ref={fileInputRef}
        type="file"
        accept={acceptedFormats.join(',')}
        multiple={multiple}
        onChange={handleInputChange}
      />

      <FileInfo>
        {content.maxFiles} • {content.maxSize} • {content.formats}
      </FileInfo>

      {error && (
        <ErrorMessage>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {error}
        </ErrorMessage>
      )}

      {(existingImages.length > 0 || previews.length > 0) && (
        <PreviewGrid>
          {/* Existing images */}
          {existingImages.map((url, index) => (
            <PreviewItem key={`existing-${index}`}>
              <PreviewImage src={url} alt={`Existing ${index + 1}`} />
              {onRemoveExisting && (
                <RemoveButton onClick={() => onRemoveExisting(url)}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </RemoveButton>
              )}
            </PreviewItem>
          ))}

          {/* New uploads */}
          {previews.map((preview, index) => (
            <PreviewItem key={`preview-${index}`}>
              <PreviewImage src={preview} alt={`Preview ${index + 1}`} />
              <RemoveButton onClick={() => removeSelectedFile(index)} disabled={uploading}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </RemoveButton>
              {uploading && (
                <ProgressOverlay>
                  <div>{content.uploading}</div>
                  <ProgressBar>
                    <ProgressFill $progress={uploadProgress} />
                  </ProgressBar>
                </ProgressOverlay>
              )}
            </PreviewItem>
          ))}
        </PreviewGrid>
      )}

      {selectedFiles.length > 0 && !uploading && (
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <UploadButton onClick={handleUpload}>
            {language === 'bg' ? `Качи ${selectedFiles.length} ${selectedFiles.length === 1 ? 'снимка' : 'снимки'}` : `Upload ${selectedFiles.length} ${selectedFiles.length === 1 ? 'image' : 'images'}`}
          </UploadButton>
        </div>
      )}
    </UploadContainer>
  );
};

export default ImageUpload;
