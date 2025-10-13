/**
 * EXAMPLE: Venue Images Upload Page
 *
 * This is a complete working example showing how to use the ImageUpload component
 * to upload venue photos and replace Unsplash placeholders with real images.
 *
 * Copy this pattern to create similar upload pages for:
 * - Partner logo uploads
 * - Offer images
 * - User profile pictures
 * - Gallery photos
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import ImageUpload from '../components/common/ImageUpload/ImageUpload';
import { useVenue, useUploadVenueImages } from '../hooks/useVenues';
import { venuesService } from '../services/venues.service';

const PageContainer = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 2rem;
`;

const ContentCard = styled.div`
  max-width: 900px;
  margin: 0 auto;
  background: white;
  border-radius: 1.5rem;
  padding: 3rem;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 0.5rem 0;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
`;

const VenueInfo = styled.div`
  margin-bottom: 2rem;
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
`;

const VenueName = styled.h2`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.5rem 0;
`;

const VenueDetails = styled.div`
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: #6b7280;
`;

const DetailItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  svg {
    width: 16px;
    height: 16px;
    color: #9ca3af;
  }
`;

const CurrentImages = styled.div`
  margin-bottom: 2rem;
`;

const SectionTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 1rem 0;
`;

const ImageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 1rem;
`;

const ImageCard = styled.div`
  position: relative;
  aspect-ratio: 4/3;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 2px solid #e5e7eb;
  background: #f9fafb;
`;

const Image = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const DeleteButton = styled.button`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 36px;
  height: 36px;
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
    width: 18px;
    height: 18px;
  }
`;

const MainImage = styled.div`
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  backdrop-filter: blur(4px);
`;

const EmptyState = styled.div`
  padding: 3rem 2rem;
  text-align: center;
  color: #9ca3af;
  background: #f9fafb;
  border-radius: 1rem;
  border: 2px dashed #d1d5db;
`;

const Actions = styled.div`
  margin-top: 2rem;
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: 0.75rem 1.5rem;
  border-radius: 0.75rem;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid ${props => props.$variant === 'primary' ? '#000000' : '#e5e7eb'};
  background: ${props => props.$variant === 'primary' ? '#000000' : 'white'};
  color: ${props => props.$variant === 'primary' ? 'white' : '#374151'};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background: ${props => props.$variant === 'primary' ? '#1f2937' : '#f9fafb'};
  }

  &:active {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const LoadingSpinner = styled.div`
  display: flex;
  justify-content: center;
  padding: 4rem 2rem;

  svg {
    width: 48px;
    height: 48px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
`;

const ErrorMessage = styled.div`
  padding: 1rem 1.5rem;
  background: #fef2f2;
  border: 2px solid #fecaca;
  border-radius: 0.75rem;
  color: #dc2626;
  font-size: 0.9375rem;
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

const SuccessMessage = styled.div`
  padding: 1rem 1.5rem;
  background: #f0fdf4;
  border: 2px solid #bbf7d0;
  border-radius: 0.75rem;
  color: #16a34a;
  font-size: 0.9375rem;
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }
`;

const VenueImagesUploadPage: React.FC = () => {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Fetch venue data
  const { data: venue, isLoading, error } = useVenue(venueId || '');

  // Upload mutation
  const uploadMutation = useUploadVenueImages(venueId || '');

  const t = {
    en: {
      title: 'Manage Venue Images',
      subtitle: 'Upload high-quality photos to showcase your venue',
      currentImages: 'Current Images',
      noImages: 'No images uploaded yet. Add some photos to showcase your venue!',
      mainImage: 'Main',
      location: 'Location',
      category: 'Category',
      cancel: 'Cancel',
      done: 'Done',
      uploadSuccess: 'Images uploaded successfully!',
      deleteError: 'Failed to delete image. Please try again.',
      loadingError: 'Failed to load venue data',
    },
    bg: {
      title: 'Управление на снимките',
      subtitle: 'Качете висококачествени снимки, за да покажете вашето заведение',
      currentImages: 'Текущи снимки',
      noImages: 'Все още няма качени снимки. Добавете снимки, за да покажете вашето заведение!',
      mainImage: 'Главна',
      location: 'Локация',
      category: 'Категория',
      cancel: 'Отказ',
      done: 'Готово',
      uploadSuccess: 'Снимките са качени успешно!',
      deleteError: 'Грешка при изтриване на снимка. Моля опитайте отново.',
      loadingError: 'Грешка при зареждане на данните',
    },
  };

  const content = language === 'bg' ? t.bg : t.en;

  const handleUpload = async (files: File[]) => {
    try {
      await uploadMutation.mutateAsync(files);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 5000);
    } catch (err) {
      console.error('Upload failed:', err);
      throw err;
    }
  };

  const handleDeleteImage = async (imageUrl: string) => {
    if (!venueId) return;

    try {
      await venuesService.deleteImage(venueId, imageUrl);
      setDeleteError('');
    } catch (err) {
      console.error('Delete failed:', err);
      setDeleteError(content.deleteError);
    }
  };

  const handleDone = () => {
    navigate(`/venues/${venueId}`);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <ContentCard>
          <LoadingSpinner>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </LoadingSpinner>
        </ContentCard>
      </PageContainer>
    );
  }

  if (error || !venue) {
    return (
      <PageContainer>
        <ContentCard>
          <ErrorMessage>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {content.loadingError}
          </ErrorMessage>
        </ContentCard>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ContentCard>
        <Header>
          <Title>{content.title}</Title>
          <Subtitle>{content.subtitle}</Subtitle>
        </Header>

        {uploadSuccess && (
          <SuccessMessage>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {content.uploadSuccess}
          </SuccessMessage>
        )}

        {deleteError && (
          <ErrorMessage>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {deleteError}
          </ErrorMessage>
        )}

        <VenueInfo>
          <VenueName>{language === 'bg' ? venue.nameBg : venue.nameEn || venue.name}</VenueName>
          <VenueDetails>
            <DetailItem>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span>{content.location}: {venue.city}</span>
            </DetailItem>
            <DetailItem>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
              <span>{content.category}: {language === 'bg' ? venue.categoryBg : venue.categoryEn || venue.category}</span>
            </DetailItem>
          </VenueDetails>
        </VenueInfo>

        <CurrentImages>
          <SectionTitle>{content.currentImages}</SectionTitle>
          {venue.images && venue.images.length > 0 ? (
            <ImageGrid>
              {venue.images.map((image, index) => (
                <ImageCard key={index}>
                  <Image src={image} alt={`${venue.name} ${index + 1}`} />
                  {index === 0 && <MainImage>{content.mainImage}</MainImage>}
                  <DeleteButton onClick={() => handleDeleteImage(image)}>
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </DeleteButton>
                </ImageCard>
              ))}
            </ImageGrid>
          ) : (
            <EmptyState>{content.noImages}</EmptyState>
          )}
        </CurrentImages>

        <ImageUpload
          onUpload={handleUpload}
          multiple={true}
          maxFiles={10}
          maxSizeMB={5}
          existingImages={venue.images || []}
          onRemoveExisting={handleDeleteImage}
        />

        <Actions>
          <Button onClick={handleCancel}>{content.cancel}</Button>
          <Button $variant="primary" onClick={handleDone}>{content.done}</Button>
        </Actions>
      </ContentCard>
    </PageContainer>
  );
};

export default VenueImagesUploadPage;
