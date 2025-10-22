import React, { useState } from 'react';
import styled from 'styled-components';
import { Star, ThumbsUp, ThumbsDown, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { enUS, bg as bgLocale } from 'date-fns/locale';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import type { Review } from '../../types/review.types';

interface ReviewCardProps {
  review: Review;
  onMarkHelpful?: (id: string, helpful: boolean) => Promise<void>;
  className?: string;
}

const Card = styled.div`
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.5rem;
  transition: box-shadow 0.2s;

  &:hover {
    box-shadow: var(--shadow-soft);
  }

  @media (max-width: 640px) {
    padding: 1rem;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const Avatar = styled.div<{ $imageUrl?: string }>`
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: ${props =>
    props.$imageUrl
      ? `url(${props.$imageUrl})`
      : 'linear-gradient(135deg, var(--color-primary) 0%, #374151 100%)'};
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 1.25rem;
  flex-shrink: 0;
`;

const UserInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const UserName = styled.div`
  font-weight: 600;
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const VerifiedBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: #10b98110;
  color: #10b981;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const UserMeta = styled.div`
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-top: 0.25rem;
`;

const RatingStars = styled.div`
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;

  svg {
    width: 18px;
    height: 18px;
    fill: #fbbf24;
    stroke: #fbbf24;
  }
`;

const ReviewTitle = styled.h4`
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 1rem 0 0.5rem;
`;

const ReviewText = styled.p`
  color: var(--color-text-secondary);
  line-height: 1.6;
  margin: 0.5rem 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

const AdminResponse = styled.div`
  margin-top: 1rem;
  padding: 1rem;
  background: var(--color-background-secondary);
  border-left: 3px solid var(--color-primary);
  border-radius: 0.5rem;
`;

const AdminLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
`;

const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border);
  flex-wrap: wrap;
  gap: 1rem;
`;

const HelpfulButtons = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const HelpfulButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: ${props => props.$active ? 'var(--color-primary)' : 'var(--color-background-secondary)'};
  color: ${props => props.$active ? 'var(--color-secondary)' : 'var(--color-text-secondary)'};
  border: 1px solid var(--color-border);
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: ${props => props.$active ? 'var(--color-primary-hover)' : 'var(--color-background-tertiary)'};
    border-color: var(--color-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const StatusBadge = styled.div<{ $status: string }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  background: ${props => {
    switch (props.$status) {
      case 'APPROVED': return '#10b98110';
      case 'PENDING': return '#f59e0b10';
      case 'REJECTED': return '#ef444410';
      case 'FLAGGED': return '#ef444410';
      default: return 'var(--color-background-secondary)';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'APPROVED': return '#10b981';
      case 'PENDING': return '#f59e0b';
      case 'REJECTED': return '#ef4444';
      case 'FLAGGED': return '#ef4444';
      default: return 'var(--color-text-secondary)';
    }
  }};
`;

export const ReviewCard: React.FC<ReviewCardProps> = ({
  review,
  onMarkHelpful,
  className
}) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [voting, setVoting] = useState(false);

  const getUserInitial = () => {
    if (review.user.firstName) {
      return review.user.firstName[0].toUpperCase();
    }
    return '?';
  };

  const getUserName = () => {
    const firstName = review.user.firstName || '';
    const lastName = review.user.lastName || '';
    return `${firstName} ${lastName}`.trim() || (language === 'bg' ? 'Анонимен' : 'Anonymous');
  };

  const handleVote = async (helpful: boolean) => {
    if (!onMarkHelpful || !user || voting) return;

    try {
      setVoting(true);
      await onMarkHelpful(review.id, helpful);
    } catch (error) {
      console.error('Error voting:', error);
    } finally {
      setVoting(false);
    }
  };

  const getRelativeTime = (dateString: string) => {
    const locale = language === 'bg' ? bgLocale : enUS;
    return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale });
  };

  const content = {
    en: {
      verified: 'Verified',
      adminResponse: 'Partner Response',
      helpful: 'Helpful',
      notHelpful: 'Not Helpful',
      pending: 'Pending Approval',
      approved: 'Approved',
      rejected: 'Rejected',
      flagged: 'Flagged'
    },
    bg: {
      verified: 'Потвърден',
      adminResponse: 'Отговор от партньор',
      helpful: 'Полезно',
      notHelpful: 'Неполезно',
      pending: 'Очаква одобрение',
      approved: 'Одобрен',
      rejected: 'Отхвърлен',
      flagged: 'Сигнализиран'
    }
  };

  const t = content[language];

  return (
    <Card className={className}>
      <Header>
        <Avatar $imageUrl={review.user.avatar || undefined}>
          {!review.user.avatar && getUserInitial()}
        </Avatar>
        <UserInfo>
          <UserName>
            {getUserName()}
            {review.isVerified && (
              <VerifiedBadge>
                <CheckCircle />
                {t.verified}
              </VerifiedBadge>
            )}
          </UserName>
          <UserMeta>
            {getRelativeTime(review.createdAt)}
          </UserMeta>
          <RatingStars>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} style={{ opacity: star <= review.rating ? 1 : 0.3 }} />
            ))}
          </RatingStars>
        </UserInfo>
      </Header>

      {review.title && <ReviewTitle>{review.title}</ReviewTitle>}

      {review.comment && <ReviewText>{review.comment}</ReviewText>}

      {review.adminResponse && (
        <AdminResponse>
          <AdminLabel>{t.adminResponse}</AdminLabel>
          <ReviewText style={{ margin: 0 }}>{review.adminResponse}</ReviewText>
          {review.adminRespondedAt && (
            <UserMeta style={{ marginTop: '0.5rem' }}>
              {getRelativeTime(review.adminRespondedAt)}
            </UserMeta>
          )}
        </AdminResponse>
      )}

      <Footer>
        {review.status !== 'APPROVED' && (
          <StatusBadge $status={review.status}>
            {t[review.status.toLowerCase() as keyof typeof t] || review.status}
          </StatusBadge>
        )}

        {review.status === 'APPROVED' && onMarkHelpful && (
          <HelpfulButtons>
            <HelpfulButton
              onClick={() => handleVote(true)}
              disabled={voting || !user}
              title={!user ? (language === 'bg' ? 'Влезте, за да гласувате' : 'Log in to vote') : ''}
            >
              <ThumbsUp />
              {t.helpful} ({review.helpful})
            </HelpfulButton>
            <HelpfulButton
              onClick={() => handleVote(false)}
              disabled={voting || !user}
              title={!user ? (language === 'bg' ? 'Влезте, за да гласувате' : 'Log in to vote') : ''}
            >
              <ThumbsDown />
              {t.notHelpful} ({review.notHelpful})
            </HelpfulButton>
          </HelpfulButtons>
        )}
      </Footer>
    </Card>
  );
};

export default ReviewCard;
