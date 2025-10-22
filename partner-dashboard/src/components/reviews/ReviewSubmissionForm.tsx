import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Star, X, Image as ImageIcon } from 'lucide-react';
import Button from '../common/Button/Button';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import type { CreateReviewDTO } from '../../types/review.types';

interface ReviewSubmissionFormProps {
  onSubmit: (data: CreateReviewDTO) => Promise<void>;
  onClose: () => void;
  partnerId?: string;
}

const FormContainer = styled(motion.div)`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2rem;
  max-width: 600px;
  width: 100%;
  box-shadow: var(--shadow-large);
  border: 1px solid var(--color-border);

  @media (max-width: 640px) {
    padding: 1.5rem;
    border-radius: 0;
    max-width: 100%;
  }
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.5rem;
  color: var(--color-text-secondary);
  transition: color 0.2s;

  &:hover {
    color: var(--color-text-primary);
  }

  svg {
    width: 24px;
    height: 24px;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.5rem;
`;

const Label = styled.label`
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 0.5rem;
`;

const StarRating = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
`;

const StarButton = styled.button<{ $filled: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.2);
  }

  svg {
    width: 32px;
    height: 32px;
    fill: ${props => props.$filled ? '#fbbf24' : 'none'};
    stroke: ${props => props.$filled ? '#fbbf24' : 'var(--color-text-secondary)'};
    stroke-width: 2;
  }
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 1rem;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-secondary);
    opacity: 0.6;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  font-size: 1rem;
  min-height: 120px;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  &::placeholder {
    color: var(--color-text-secondary);
    opacity: 0.6;
  }
`;

const CharCount = styled.div`
  text-align: right;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
`;

const ErrorText = styled.div`
  color: var(--color-error);
  font-size: 0.875rem;
  margin-top: 0.5rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 2rem;

  @media (max-width: 640px) {
    flex-direction: column-reverse;
  }
`;

const RequiredIndicator = styled.span`
  color: var(--color-error);
  margin-left: 0.25rem;
`;

export const ReviewSubmissionForm: React.FC<ReviewSubmissionFormProps> = ({
  onSubmit,
  onClose,
  partnerId = 'general' // Default for homepage general reviews
}) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const maxTitleLength = 100;
  const maxCommentLength = 1000;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!user) {
      setError(language === 'bg' ? 'Моля, влезте в профила си' : 'Please log in to submit a review');
      return;
    }

    if (rating === 0) {
      setError(language === 'bg' ? 'Моля, изберете рейтинг' : 'Please select a rating');
      return;
    }

    if (!comment.trim()) {
      setError(language === 'bg' ? 'Моля, напишете коментар' : 'Please write a comment');
      return;
    }

    if (comment.length > maxCommentLength) {
      setError(language === 'bg' ? 'Коментарът е твърде дълъг' : 'Comment is too long');
      return;
    }

    try {
      setSubmitting(true);

      const reviewData: CreateReviewDTO = {
        partnerId,
        rating,
        title: title.trim() || undefined,
        comment: comment.trim()
      };

      await onSubmit(reviewData);

      // Reset form
      setRating(0);
      setTitle('');
      setComment('');
      onClose();
    } catch (err: any) {
      setError(err.message || (language === 'bg' ? 'Грешка при изпращане' : 'Error submitting review'));
    } finally {
      setSubmitting(false);
    }
  };

  const content = {
    en: {
      title: 'Write a Review',
      ratingLabel: 'Your Rating',
      titleLabel: 'Review Title',
      titlePlaceholder: 'Summarize your experience (optional)',
      commentLabel: 'Your Review',
      commentPlaceholder: 'Share your experience with others...',
      cancel: 'Cancel',
      submit: 'Submit Review',
      submitting: 'Submitting...',
      loginRequired: 'Please log in to leave a review',
      signIn: 'Sign In'
    },
    bg: {
      title: 'Напишете отзив',
      ratingLabel: 'Вашата оценка',
      titleLabel: 'Заглавие',
      titlePlaceholder: 'Обобщете вашия опит (по избор)',
      commentLabel: 'Вашият отзив',
      commentPlaceholder: 'Споделете вашия опит с други...',
      cancel: 'Отказ',
      submit: 'Изпрати отзив',
      submitting: 'Изпращане...',
      loginRequired: 'Моля, влезте в профила си, за да оставите отзив',
      signIn: 'Влезте'
    }
  };

  const t = content[language];

  if (!user) {
    return (
      <FormContainer
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <Header>
          <h2>{t.title}</h2>
          <CloseButton onClick={onClose}>
            <X />
          </CloseButton>
        </Header>
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            {t.loginRequired}
          </p>
          <ButtonGroup>
            <Button variant="secondary" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button variant="primary" onClick={() => {
              onClose();
              navigate('/login');
            }}>
              {t.signIn}
            </Button>
          </ButtonGroup>
        </div>
      </FormContainer>
    );
  }

  return (
    <FormContainer
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Header>
        <h2>{t.title}</h2>
        <CloseButton onClick={onClose}>
          <X />
        </CloseButton>
      </Header>

      <form onSubmit={handleSubmit}>
        {/* Rating */}
        <FormGroup>
          <Label>
            {t.ratingLabel}
            <RequiredIndicator>*</RequiredIndicator>
          </Label>
          <StarRating>
            {[1, 2, 3, 4, 5].map((star) => (
              <StarButton
                key={star}
                type="button"
                $filled={star <= (hoverRating || rating)}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
              >
                <Star />
              </StarButton>
            ))}
          </StarRating>
        </FormGroup>

        {/* Title */}
        <FormGroup>
          <Label>{t.titleLabel}</Label>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, maxTitleLength))}
            placeholder={t.titlePlaceholder}
            maxLength={maxTitleLength}
          />
          <CharCount>
            {title.length}/{maxTitleLength}
          </CharCount>
        </FormGroup>

        {/* Comment */}
        <FormGroup>
          <Label>
            {t.commentLabel}
            <RequiredIndicator>*</RequiredIndicator>
          </Label>
          <TextArea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, maxCommentLength))}
            placeholder={t.commentPlaceholder}
            maxLength={maxCommentLength}
            required
          />
          <CharCount>
            {comment.length}/{maxCommentLength}
          </CharCount>
        </FormGroup>

        {error && <ErrorText>{error}</ErrorText>}

        <ButtonGroup>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting} isLoading={submitting}>
            {submitting ? t.submitting : t.submit}
          </Button>
        </ButtonGroup>
      </form>
    </FormContainer>
  );
};

export default ReviewSubmissionForm;
