import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { X, Calendar, Clock, Users, MapPin, CheckCircle, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import Button from '../Button/Button';
import { useAvailability, useCreateBooking } from '../../../hooks/useBookings';
import { plansService } from '../../../services/plans.service';
import type { Entity, CardEntity } from '../../../types/entity.types';
import { useQuery } from '@tanstack/react-query';

// ── Types ──────────────────────────────────────────────────

interface BookingModalProps {
  entity: Entity | CardEntity;
  isOpen: boolean;
  onClose: () => void;
}

type Step = 'datetime' | 'pricing' | 'confirmation' | 'success';

// ── Styled Components ──────────────────────────────────────

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;

  [data-theme="color"] & {
    background: rgba(26, 10, 46, 0.7);
  }
`;

const Modal = styled(motion.div)`
  background: var(--color-background, white);
  border-radius: 1.5rem;
  max-width: 560px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
  position: relative;

  [data-theme="dark"] & {
    background: #1f2937;
  }
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--color-border, #e5e7eb);

  [data-theme="dark"] & {
    border-bottom-color: #374151;
  }
`;

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 0.5rem;
  color: var(--color-text-secondary, #6b7280);
  transition: all 0.2s;

  &:hover {
    background: var(--color-background-secondary, #f3f4f6);
    color: var(--color-text-primary, #111827);
  }
`;

const ModalBody = styled.div`
  padding: 1.5rem;
`;

const StepIndicator = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
`;

const StepDot = styled.div<{ $active: boolean; $completed: boolean }>`
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  transition: all 0.3s;
  background: ${props =>
    props.$completed ? '#10b981' :
    props.$active ? '#000000' :
    'var(--color-background-secondary, #f3f4f6)'
  };
  color: ${props =>
    props.$completed || props.$active ? '#ffffff' :
    'var(--color-text-secondary, #6b7280)'
  };

  [data-theme="dark"] & {
    background: ${props =>
      props.$completed ? '#10b981' :
      props.$active ? '#f9fafb' :
      '#374151'
    };
    color: ${props =>
      props.$completed ? '#ffffff' :
      props.$active ? '#111827' :
      '#9ca3af'
    };
  }
`;

const StepLine = styled.div<{ $active: boolean }>`
  flex: 1;
  height: 2px;
  background: ${props => props.$active ? '#10b981' : 'var(--color-border, #e5e7eb)'};
  transition: background 0.3s;
`;

const ExperienceSummary = styled.div`
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--color-background-secondary, #f9fafb);
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    background: #374151;
  }
`;

const SummaryImage = styled.img`
  width: 80px;
  height: 80px;
  border-radius: 0.5rem;
  object-fit: cover;
  flex-shrink: 0;
`;

const SummaryInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const SummaryTitle = styled.h3`
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SummaryMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 0.25rem;

  svg {
    flex-shrink: 0;
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const FormGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const FormLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text-primary, #111827);
  margin-bottom: 0.5rem;

  svg {
    width: 1rem;
    height: 1rem;
    color: var(--color-text-secondary, #6b7280);
  }
`;

const FormInput = styled.input`
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  font-size: 0.875rem;
  background: var(--color-background, white);
  color: var(--color-text-primary, #111827);
  transition: border-color 0.2s;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #f9fafb;
    }
  }
`;

const FormTextarea = styled.textarea`
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 2px solid var(--color-border, #e5e7eb);
  border-radius: 0.75rem;
  font-size: 0.875rem;
  background: var(--color-background, white);
  color: var(--color-text-primary, #111827);
  transition: border-color 0.2s;
  min-height: 80px;
  resize: vertical;
  font-family: inherit;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #f9fafb;
    }
  }
`;

const GuestCountSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const CountButton = styled.button`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  border: 2px solid var(--color-border, #e5e7eb);
  background: var(--color-background, white);
  color: var(--color-text-primary, #111827);
  font-size: 1.25rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  [data-theme="dark"] & {
    border-color: #4b5563;
    background: #374151;
    color: #f9fafb;
  }

  &:hover:not(:disabled) {
    border-color: #000000;
    background: #f3f4f6;

    [data-theme="dark"] & {
      border-color: #f9fafb;
      background: #4b5563;
    }
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

const CountValue = styled.span`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
  min-width: 2rem;
  text-align: center;
`;

const TimeSlots = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
`;

const TimeSlot = styled.button<{ $selected: boolean; $disabled?: boolean }>`
  padding: 0.5rem;
  border: 2px solid ${props => props.$selected ? '#000000' : 'var(--color-border, #e5e7eb)'};
  background: ${props => props.$selected ? '#000000' : 'var(--color-background, white)'};
  color: ${props => props.$selected ? '#ffffff' : 'var(--color-text-primary, #111827)'};
  border-radius: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
  opacity: ${props => props.$disabled ? 0.4 : 1};
  transition: all 0.2s;

  [data-theme="dark"] & {
    border-color: ${props => props.$selected ? '#f9fafb' : '#4b5563'};
    background: ${props => props.$selected ? '#f9fafb' : '#374151'};
    color: ${props => props.$selected ? '#111827' : '#f9fafb'};
  }

  &:hover:not(:disabled) {
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #f9fafb;
    }
  }
`;

const PricingCard = styled.div`
  background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
  border-radius: 1rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  color: white;

  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 50%, #ab2567 100%);
  }
`;

const PriceRow = styled.div<{ $highlight?: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  font-size: ${props => props.$highlight ? '1rem' : '0.875rem'};
  font-weight: ${props => props.$highlight ? '700' : '400'};
  color: ${props => props.$highlight ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'};

  &:not(:last-child) {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
`;

const SavingsBadge = styled.span`
  background: rgba(52, 211, 153, 0.2);
  color: #34d399;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
`;

const SubscriptionRequired = styled.div`
  background: rgba(245, 158, 11, 0.08);
  border: 2px solid rgba(245, 158, 11, 0.2);
  border-radius: 0.75rem;
  padding: 1.25rem;
  text-align: center;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    background: rgba(245, 158, 11, 0.12);
  }
`;

const SubscriptionIcon = styled.div`
  margin-bottom: 0.75rem;
  color: #f59e0b;
`;

const SubscriptionText = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 1rem;
`;

const ModalFooter = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem;
  border-top: 1px solid var(--color-border, #e5e7eb);

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const SuccessContainer = styled.div`
  text-align: center;
  padding: 2rem 0;
`;

const SuccessIcon = styled.div`
  color: #10b981;
  margin-bottom: 1rem;
`;

const SuccessTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-primary, #111827);
  margin-bottom: 0.5rem;
`;

const SuccessText = styled.p`
  font-size: 0.875rem;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 0.5rem;
`;

const BookingNumber = styled.div`
  display: inline-block;
  background: var(--color-background-secondary, #f3f4f6);
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  font-family: monospace;
  color: var(--color-text-primary, #111827);
  margin-top: 0.75rem;

  [data-theme="dark"] & {
    background: #374151;
  }
`;

const ConfirmSummary = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
`;

const ConfirmRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  color: var(--color-text-secondary, #6b7280);

  strong {
    color: var(--color-text-primary, #111827);
  }
`;

const TermsCheckbox = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  margin-bottom: 1rem;

  input {
    margin-top: 0.125rem;
    accent-color: #000000;
  }
`;

// ── Helpers ────────────────────────────────────────────────

const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;

const defaultTimeSlots = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '13:00', '14:00', '14:30', '15:00', '15:30',
  '16:00', '17:00', '18:00',
];

// ── Component ──────────────────────────────────────────────

const BookingModal: React.FC<BookingModalProps> = ({ entity, isOpen, onClose }) => {
  const { language } = useLanguage();
  const [step, setStep] = useState<Step>('datetime');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [bookingNumber, setBookingNumber] = useState('');

  const exp = entity.experience;
  const venueId = exp?.venueId ?? '';

  const createBooking = useCreateBooking();

  // Fetch availability for selected date
  const { data: availability } = useAvailability(venueId, selectedDate, guestCount);

  // Fetch plans for discount calculation
  const { data: plans } = useQuery({
    queryKey: ['plans'],
    queryFn: () => plansService.getPlans(),
    staleTime: 10 * 60 * 1000,
  });

  // Calculate pricing
  const pricing = useMemo(() => {
    const originalPrice = exp?.price ?? entity.discount?.originalPrice ?? 0;
    // Use the first plan's cashback rate as a representative discount
    // In production, this would come from the user's active subscription
    const userPlan = plans?.[0];
    const discountPercent = userPlan?.cashbackRate ?? entity.discount?.percent ?? 0;
    const discountAmount = originalPrice * (discountPercent / 100);
    const finalPrice = originalPrice - discountAmount;

    return {
      originalPrice,
      discountPercent,
      discountAmount,
      finalPrice,
      planName: userPlan?.displayName ?? '',
      cardType: userPlan?.cardType ?? 'light',
      hasPlan: !!userPlan,
    };
  }, [exp, entity.discount, plans]);

  const timeSlots = useMemo(() => {
    if (availability?.slots) {
      return availability.slots.map(s => ({
        time: s.time,
        available: s.available,
      }));
    }
    return defaultTimeSlots.map(time => ({ time, available: true }));
  }, [availability]);

  const name = language === 'bg' ? entity.name.bg : entity.name.en;
  const location = entity.location.displayBg && language === 'bg'
    ? entity.location.displayBg
    : entity.location.display;
  const durationText = exp
    ? (language === 'bg' ? exp.durationDisplay.bg : exp.durationDisplay.en)
    : '';

  const t = language === 'bg' ? {
    bookExperience: 'Резервирай изживяване',
    selectDateTime: 'Дата и час',
    pricingDetails: 'Цена и детайли',
    confirm: 'Потвърждение',
    selectDate: 'Изберете дата',
    selectTime: 'Изберете час',
    guests: 'Брой гости',
    next: 'Напред',
    back: 'Назад',
    yourName: 'Вашето име',
    email: 'Имейл',
    phone: 'Телефон',
    specialRequests: 'Специални изисквания',
    pricingBreakdown: 'Ценова разбивка',
    originalPrice: 'Оригинална цена',
    planDiscount: 'Отстъпка по план',
    finalPrice: 'Крайна цена',
    youSave: 'Спестявате',
    subscribeFirst: 'Абонирайте се за BOOM Card',
    subscribeText: 'За да получите отстъпка при резервация, е необходим активен абонамент.',
    viewPlans: 'Виж плановете',
    confirmBooking: 'Потвърди резервация',
    date: 'Дата',
    time: 'Час',
    price: 'Цена',
    acceptTerms: 'Приемам условията за резервация и политиката за анулиране.',
    bookingSuccess: 'Резервацията е потвърдена!',
    bookingSuccessText: 'Ще получите имейл с потвърждение.',
    bookingNumberLabel: 'Номер на резервация',
    close: 'Затвори',
    optional: '(по желание)',
  } : {
    bookExperience: 'Book Experience',
    selectDateTime: 'Date & Time',
    pricingDetails: 'Pricing & Details',
    confirm: 'Confirmation',
    selectDate: 'Select date',
    selectTime: 'Select time',
    guests: 'Guests',
    next: 'Next',
    back: 'Back',
    yourName: 'Your name',
    email: 'Email',
    phone: 'Phone',
    specialRequests: 'Special requests',
    pricingBreakdown: 'Pricing breakdown',
    originalPrice: 'Original price',
    planDiscount: 'Plan discount',
    finalPrice: 'Final price',
    youSave: 'You save',
    subscribeFirst: 'Subscribe to BOOM Card',
    subscribeText: 'An active subscription is required to get discounts on bookings.',
    viewPlans: 'View Plans',
    confirmBooking: 'Confirm Booking',
    date: 'Date',
    time: 'Time',
    price: 'Price',
    acceptTerms: 'I accept the booking terms and cancellation policy.',
    bookingSuccess: 'Booking Confirmed!',
    bookingSuccessText: 'You will receive a confirmation email shortly.',
    bookingNumberLabel: 'Booking number',
    close: 'Close',
    optional: '(optional)',
  };

  const steps: Step[] = ['datetime', 'pricing', 'confirmation'];
  const currentStepIndex = steps.indexOf(step);

  const canGoNext = () => {
    if (step === 'datetime') return !!selectedDate && !!selectedTime;
    if (step === 'pricing') return !!guestName && !!guestEmail;
    if (step === 'confirmation') return termsAccepted;
    return false;
  };

  const handleNext = () => {
    if (step === 'datetime') setStep('pricing');
    else if (step === 'pricing') setStep('confirmation');
    else if (step === 'confirmation') handleBooking();
  };

  const handleBack = () => {
    if (step === 'pricing') setStep('datetime');
    else if (step === 'confirmation') setStep('pricing');
  };

  const handleBooking = async () => {
    try {
      const result = await createBooking.mutateAsync({
        type: 'experience',
        venueId,
        offerId: entity.id,
        date: selectedDate,
        time: selectedTime,
        guestCount,
        guests: [{
          name: guestName,
          email: guestEmail,
          phone: guestPhone,
          specialRequests: specialRequests || undefined,
        }],
        specialRequests: specialRequests || undefined,
      });
      setBookingNumber(result.bookingNumber || result.id);
      setStep('success');
    } catch {
      // Error handled by the hook's onError
    }
  };

  const handleClose = () => {
    setStep('datetime');
    setSelectedDate('');
    setSelectedTime('');
    setGuestCount(1);
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setSpecialRequests('');
    setTermsAccepted(false);
    setBookingNumber('');
    onClose();
  };

  // Today's date for min attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <AnimatePresence>
      {isOpen && (
        <Overlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
        >
          <Modal
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader>
              <ModalTitle>{t.bookExperience}</ModalTitle>
              <CloseButton onClick={handleClose} aria-label="Close">
                <X size={20} />
              </CloseButton>
            </ModalHeader>

            <ModalBody>
              {/* Experience summary */}
              <ExperienceSummary>
                <SummaryImage src={entity.images.hero} alt={name} />
                <SummaryInfo>
                  <SummaryTitle>{name}</SummaryTitle>
                  <SummaryMeta>
                    <MapPin />
                    {location}
                  </SummaryMeta>
                  {durationText && (
                    <SummaryMeta>
                      <Clock />
                      {durationText}
                    </SummaryMeta>
                  )}
                </SummaryInfo>
              </ExperienceSummary>

              {/* Step indicator */}
              {step !== 'success' && (
                <StepIndicator>
                  {steps.map((s, i) => (
                    <React.Fragment key={s}>
                      <StepDot
                        $active={step === s}
                        $completed={currentStepIndex > i}
                      >
                        {currentStepIndex > i ? '✓' : i + 1}
                      </StepDot>
                      {i < steps.length - 1 && (
                        <StepLine $active={currentStepIndex > i} />
                      )}
                    </React.Fragment>
                  ))}
                </StepIndicator>
              )}

              {/* Step 1: Date & Time */}
              {step === 'datetime' && (
                <>
                  <FormGroup>
                    <FormLabel>
                      <Calendar />
                      {t.selectDate}
                    </FormLabel>
                    <FormInput
                      type="date"
                      value={selectedDate}
                      onChange={(e) => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                      min={today}
                    />
                  </FormGroup>

                  {selectedDate && (
                    <FormGroup>
                      <FormLabel>
                        <Clock />
                        {t.selectTime}
                      </FormLabel>
                      <TimeSlots>
                        {timeSlots.map(slot => (
                          <TimeSlot
                            key={slot.time}
                            $selected={selectedTime === slot.time}
                            $disabled={!slot.available}
                            disabled={!slot.available}
                            onClick={() => setSelectedTime(slot.time)}
                          >
                            {slot.time}
                          </TimeSlot>
                        ))}
                      </TimeSlots>
                    </FormGroup>
                  )}

                  <FormGroup>
                    <FormLabel>
                      <Users />
                      {t.guests}
                    </FormLabel>
                    <GuestCountSelector>
                      <CountButton
                        onClick={() => setGuestCount(Math.max(1, guestCount - 1))}
                        disabled={guestCount <= 1}
                      >
                        −
                      </CountButton>
                      <CountValue>{guestCount}</CountValue>
                      <CountButton
                        onClick={() => setGuestCount(Math.min(exp?.maxGroupSize ?? 20, guestCount + 1))}
                        disabled={guestCount >= (exp?.maxGroupSize ?? 20)}
                      >
                        +
                      </CountButton>
                    </GuestCountSelector>
                  </FormGroup>
                </>
              )}

              {/* Step 2: Pricing & Guest Details */}
              {step === 'pricing' && (
                <>
                  {/* Pricing breakdown */}
                  {pricing.hasPlan ? (
                    <PricingCard>
                      <PriceRow>
                        <span>{t.originalPrice}</span>
                        <span>{formatCurrency(pricing.originalPrice)}</span>
                      </PriceRow>
                      <PriceRow>
                        <span>{t.planDiscount} ({pricing.discountPercent}%)</span>
                        <span>-{formatCurrency(pricing.discountAmount)}</span>
                      </PriceRow>
                      <PriceRow $highlight>
                        <span>{t.finalPrice}</span>
                        <span>{formatCurrency(pricing.finalPrice)}</span>
                      </PriceRow>
                      {pricing.discountAmount > 0 && (
                        <div style={{ textAlign: 'right', marginTop: '0.5rem' }}>
                          <SavingsBadge>
                            {t.youSave} {formatCurrency(pricing.discountAmount)}
                          </SavingsBadge>
                        </div>
                      )}
                    </PricingCard>
                  ) : (
                    <SubscriptionRequired>
                      <SubscriptionIcon>
                        <AlertCircle size={32} />
                      </SubscriptionIcon>
                      <SubscriptionText>{t.subscribeText}</SubscriptionText>
                      <Button
                        variant="golden"
                        size="small"
                        onClick={() => window.location.href = '/#subscription-plans'}
                      >
                        {t.viewPlans}
                      </Button>
                    </SubscriptionRequired>
                  )}

                  {/* Guest details */}
                  <FormGroup>
                    <FormLabel>{t.yourName}</FormLabel>
                    <FormInput
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder={language === 'bg' ? 'Иван Петров' : 'John Doe'}
                    />
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>{t.email}</FormLabel>
                    <FormInput
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>{t.phone}</FormLabel>
                    <FormInput
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="+359 88 888 8888"
                    />
                  </FormGroup>

                  <FormGroup>
                    <FormLabel>{t.specialRequests} {t.optional}</FormLabel>
                    <FormTextarea
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                    />
                  </FormGroup>
                </>
              )}

              {/* Step 3: Confirmation */}
              {step === 'confirmation' && (
                <>
                  <ConfirmSummary>
                    <ConfirmRow>
                      <span>{t.date}</span>
                      <strong>{selectedDate}</strong>
                    </ConfirmRow>
                    <ConfirmRow>
                      <span>{t.time}</span>
                      <strong>{selectedTime}</strong>
                    </ConfirmRow>
                    <ConfirmRow>
                      <span>{t.guests}</span>
                      <strong>{guestCount}</strong>
                    </ConfirmRow>
                    <ConfirmRow>
                      <span>{t.price}</span>
                      <strong>{formatCurrency(pricing.finalPrice)}</strong>
                    </ConfirmRow>
                    {pricing.discountAmount > 0 && (
                      <ConfirmRow>
                        <span>{t.youSave}</span>
                        <SavingsBadge>{formatCurrency(pricing.discountAmount)}</SavingsBadge>
                      </ConfirmRow>
                    )}
                  </ConfirmSummary>

                  <TermsCheckbox>
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                    />
                    {t.acceptTerms}
                  </TermsCheckbox>
                </>
              )}

              {/* Success */}
              {step === 'success' && (
                <SuccessContainer>
                  <SuccessIcon>
                    <CheckCircle size={56} />
                  </SuccessIcon>
                  <SuccessTitle>{t.bookingSuccess}</SuccessTitle>
                  <SuccessText>{t.bookingSuccessText}</SuccessText>
                  {bookingNumber && (
                    <>
                      <SuccessText style={{ marginTop: '0.75rem', fontSize: '0.75rem' }}>
                        {t.bookingNumberLabel}:
                      </SuccessText>
                      <BookingNumber>{bookingNumber}</BookingNumber>
                    </>
                  )}
                </SuccessContainer>
              )}
            </ModalBody>

            {/* Footer */}
            <ModalFooter>
              {step === 'success' ? (
                <Button variant="primary" size="medium" onClick={handleClose} fullWidth>
                  {t.close}
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="medium"
                    onClick={step === 'datetime' ? handleClose : handleBack}
                  >
                    {step === 'datetime' ? t.close : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ChevronLeft size={16} />
                        {t.back}
                      </span>
                    )}
                  </Button>
                  <Button
                    variant={step === 'confirmation' ? 'golden' : 'primary'}
                    size="medium"
                    onClick={handleNext}
                    disabled={!canGoNext()}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {step === 'confirmation' ? t.confirmBooking : t.next}
                      {step !== 'confirmation' && <ChevronRight size={16} />}
                    </span>
                  </Button>
                </>
              )}
            </ModalFooter>
          </Modal>
        </Overlay>
      )}
    </AnimatePresence>
  );
};

export default BookingModal;
