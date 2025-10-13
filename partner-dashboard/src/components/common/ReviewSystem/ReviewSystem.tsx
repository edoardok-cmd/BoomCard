import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ThumbsUp, Check } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { Button } from '../Button/Button';
import toast from 'react-hot-toast';

const ReviewContainer = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
`;

const SectionTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;
`;

const RatingSummary = styled.div`
  display: flex;
  gap: 2rem;
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #e5e7eb;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1.5rem;
  }
`;

const OverallRating = styled.div`
  text-align: center;
`;

const RatingNumber = styled.div`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
  line-height: 1;
  margin-bottom: 0.5rem;
`;

const RatingStars = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
`;

const RatingCount = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const RatingBreakdown = styled.div`
  flex: 1;
`;

const RatingBar = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;

  &:last-child {
    margin-bottom: 0;
  }
`;

const StarLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.875rem;
  color: #374151;
  min-width: 60px;

  svg {
    width: 14px;
    height: 14px;
    color: #f59e0b;
    fill: #f59e0b;
  }
`;

const BarTrack = styled.div`
  flex: 1;
  height: 8px;
  background: #e5e7eb;
  border-radius: 4px;
  overflow: hidden;
`;

const BarFill = styled(motion.div)<{ $percentage: number }>`
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  width: ${props => props.$percentage}%;
`;

const BarCount = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  min-width: 40px;
  text-align: right;
`;

const WriteReviewButton = styled(Button)`
  margin-bottom: 2rem;
`;

const ReviewForm = styled(motion.form)`
  background: #f9fafb;
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 2rem;
`;

const FormTitle = styled.h4`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
`;

const StarRating = styled.div`
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
`;

const StarButton = styled.button<{ $filled: boolean }>`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.1);
  }

  svg {
    width: 32px;
    height: 32px;
    color: ${props => props.$filled ? '#f59e0b' : '#d1d5db'};
    fill: ${props => props.$filled ? '#f59e0b' : 'none'};
    transition: all 0.2s;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 120px;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1rem;

  @media (max-width: 640px) {
    flex-direction: column;
  }
`;

const ReviewList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const ReviewCard = styled(motion.div)`
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 0.75rem;
  transition: all 0.2s;

  &:hover {
    border-color: #d1d5db;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }
`;

const ReviewHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
`;

const ReviewerInfo = styled.div`
  display: flex;
  gap: 1rem;
  align-items: center;
`;

const Avatar = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 1.125rem;

  svg {
    width: 24px;
    height: 24px;
  }
`;

const ReviewerDetails = styled.div``;

const ReviewerName = styled.div`
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
`;

const ReviewDate = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const ReviewRating = styled.div`
  display: flex;
  gap: 0.25rem;

  svg {
    width: 16px;
    height: 16px;
    color: #f59e0b;
    fill: #f59e0b;
  }
`;

const ReviewText = styled.p`
  color: #374151;
  line-height: 1.6;
  margin-bottom: 1rem;
`;

const ReviewFooter = styled.div`
  display: flex;
  gap: 1rem;
`;

const HelpfulButton = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  background: ${props => props.$active ? '#f3f4f6' : 'white'};
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: ${props => props.$active ? '#667eea' : '#6b7280'};
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const VerifiedBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: #10b98110;
  color: #10b981;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;

  svg {
    width: 14px;
    height: 14px;
  }
`;

interface Review {
  id: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  helpful: number;
  verified: boolean;
  userInitials: string;
}

interface ReviewSystemProps {
  offerId: string;
  className?: string;
}

export const ReviewSystem: React.FC<ReviewSystemProps> = ({ className }) => {
  const { language, t: translateFn } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([
    {
      id: '1',
      userName: 'Maria Petrova',
      rating: 5,
      comment: 'Amazing experience! The spa was incredible and the discount made it even better. Highly recommend!',
      date: '2 days ago',
      helpful: 12,
      verified: true,
      userInitials: 'MP',
    },
    {
      id: '2',
      userName: 'Ivan Georgiev',
      rating: 4,
      comment: 'Great value for money. The service was excellent. Only minor issue was the wait time.',
      date: '1 week ago',
      helpful: 8,
      verified: true,
      userInitials: 'IG',
    },
    {
      id: '3',
      userName: 'Elena Dimitrova',
      rating: 5,
      comment: 'Perfect weekend getaway! The hotel exceeded all expectations. Will definitely come back.',
      date: '2 weeks ago',
      helpful: 15,
      verified: false,
      userInitials: 'ED',
    },
  ]);

  const [helpfulReviews, setHelpfulReviews] = useState<Set<string>>(new Set());

  const content = {
    en: {
      title: 'Reviews & Ratings',
      writeReview: 'Write a Review',
      yourRating: 'Your Rating',
      yourReview: 'Your Review',
      placeholder: 'Share your experience...',
      submit: 'Submit Review',
      submitting: 'Submitting...',
      cancel: 'Cancel',
      helpful: 'Helpful',
      verified: 'Verified',
      reviews: 'reviews',
      basedOn: 'based on',
    },
    bg: {
      title: 'Отзиви и Оценки',
      writeReview: 'Напиши Отзив',
      yourRating: 'Вашата Оценка',
      yourReview: 'Вашият Отзив',
      placeholder: 'Споделете вашето преживяване...',
      submit: 'Изпрати Отзив',
      submitting: 'Изпращане...',
      cancel: 'Откажи',
      helpful: 'Полезно',
      verified: 'Потвърден',
      reviews: 'отзива',
      basedOn: 'базирано на',
    },
  };

  const t = content[language as keyof typeof content];

  const averageRating = reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;

  const ratingDistribution = [5, 4, 3, 2, 1].map(star => ({
    star,
    count: reviews.filter(r => r.rating === star).length,
    percentage: (reviews.filter(r => r.rating === star).length / reviews.length) * 100,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      toast.error(translateFn('common.pleaseSelectRating'));
      return;
    }

    if (comment.trim().length < 10) {
      toast.error(translateFn('common.reviewMinLength'));
      return;
    }

    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const newReview: Review = {
        id: Date.now().toString(),
        userName: user?.firstName + ' ' + user?.lastName || 'Anonymous',
        rating,
        comment,
        date: 'Just now',
        helpful: 0,
        verified: true,
        userInitials: (user?.firstName?.[0] || '') + (user?.lastName?.[0] || '') || 'A',
      };

      setReviews([newReview, ...reviews]);
      setRating(0);
      setComment('');
      setShowForm(false);
      toast.success(translateFn('common.reviewSubmittedSuccess'));
    } catch {
      toast.error(translateFn('common.errorSubmittingReview'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleHelpful = (reviewId: string) => {
    const newHelpful = new Set(helpfulReviews);
    if (newHelpful.has(reviewId)) {
      newHelpful.delete(reviewId);
    } else {
      newHelpful.add(reviewId);
    }
    setHelpfulReviews(newHelpful);
  };

  return (
    <ReviewContainer className={className}>
      <SectionTitle>{t.title}</SectionTitle>

      <RatingSummary>
        <OverallRating>
          <RatingNumber>{averageRating.toFixed(1)}</RatingNumber>
          <RatingStars>
            {[1, 2, 3, 4, 5].map(star => (
              <Star
                key={star}
                size={20}
                fill={star <= Math.round(averageRating) ? '#f59e0b' : 'none'}
                color={star <= Math.round(averageRating) ? '#f59e0b' : '#d1d5db'}
              />
            ))}
          </RatingStars>
          <RatingCount>{t.basedOn} {reviews.length} {t.reviews}</RatingCount>
        </OverallRating>

        <RatingBreakdown>
          {ratingDistribution.map(({ star, count, percentage }) => (
            <RatingBar key={star}>
              <StarLabel>
                {star} <Star size={14} />
              </StarLabel>
              <BarTrack>
                <BarFill
                  $percentage={percentage}
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: 0.1 * (6 - star) }}
                />
              </BarTrack>
              <BarCount>{count}</BarCount>
            </RatingBar>
          ))}
        </RatingBreakdown>
      </RatingSummary>

      {isAuthenticated && !showForm && (
        <WriteReviewButton onClick={() => setShowForm(true)}>
          {t.writeReview}
        </WriteReviewButton>
      )}

      <AnimatePresence>
        {showForm && (
          <ReviewForm
            onSubmit={handleSubmit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <FormTitle>{t.yourRating}</FormTitle>
            <StarRating>
              {[1, 2, 3, 4, 5].map(star => (
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

            <FormTitle>{t.yourReview}</FormTitle>
            <TextArea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t.placeholder}
              required
            />

            <FormActions>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting ? t.submitting : t.submit}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowForm(false);
                  setRating(0);
                  setComment('');
                }}
              >
                {t.cancel}
              </Button>
            </FormActions>
          </ReviewForm>
        )}
      </AnimatePresence>

      <ReviewList>
        {reviews.map((review, index) => (
          <ReviewCard
            key={review.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ReviewHeader>
              <ReviewerInfo>
                <Avatar>
                  {review.userInitials}
                </Avatar>
                <ReviewerDetails>
                  <ReviewerName>
                    {review.userName}
                    {review.verified && (
                      <> <VerifiedBadge><Check /> {t.verified}</VerifiedBadge></>
                    )}
                  </ReviewerName>
                  <ReviewDate>{review.date}</ReviewDate>
                </ReviewerDetails>
              </ReviewerInfo>
              <ReviewRating>
                {[1, 2, 3, 4, 5].map(star => (
                  <Star key={star} fill={star <= review.rating ? '#f59e0b' : 'none'} />
                ))}
              </ReviewRating>
            </ReviewHeader>

            <ReviewText>{review.comment}</ReviewText>

            <ReviewFooter>
              <HelpfulButton
                $active={helpfulReviews.has(review.id)}
                onClick={() => toggleHelpful(review.id)}
              >
                <ThumbsUp />
                {t.helpful} ({review.helpful + (helpfulReviews.has(review.id) ? 1 : 0)})
              </HelpfulButton>
            </ReviewFooter>
          </ReviewCard>
        ))}
      </ReviewList>
    </ReviewContainer>
  );
};

export default ReviewSystem;
