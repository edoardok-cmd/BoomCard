import React, { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import styled from 'styled-components';
import { CreditCard, Lock, AlertCircle } from 'lucide-react';
import Button from '../common/Button/Button';

const FormContainer = styled.div`
  max-width: 500px;
  background: white;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
`;

const FormHeader = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 0.9375rem;
  color: #6b7280;
`;

const SecurityBadge = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: #166534;

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
`;

const InputWrapper = styled.div<{ $hasError?: boolean }>`
  position: relative;
  display: flex;
  align-items: center;

  ${props => props.$hasError && `
    input {
      border-color: #ef4444;
      &:focus {
        border-color: #dc2626;
      }
    }
  `}
`;

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: #000000;
  }

  &::placeholder {
    color: #9ca3af;
  }

  &[disabled] {
    background: #f9fafb;
    color: #9ca3af;
    cursor: not-allowed;
  }
`;

const InputIcon = styled.div`
  position: absolute;
  right: 1rem;
  color: #9ca3af;

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  color: #dc2626;
  margin-top: 0.25rem;

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }
`;

const CheckboxWrapper = styled.label`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.9375rem;
  color: #374151;

  input {
    width: 1.125rem;
    height: 1.125rem;
    cursor: pointer;
  }
`;

const CardPreview = styled.div`
  background: linear-gradient(135deg, #000000 0%, #374151 100%);
  border-radius: 1rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  color: white;
  aspect-ratio: 1.586;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const CardChip = styled.div`
  width: 3rem;
  height: 2.25rem;
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border-radius: 0.375rem;
`;

const CardNumber = styled.div`
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  margin: 1rem 0;
`;

const CardInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
`;

const CardHolder = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const CardLabel = styled.div`
  font-size: 0.625rem;
  text-transform: uppercase;
  opacity: 0.7;
  letter-spacing: 0.05em;
`;

const CardValue = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
`;

const CardExpiry = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  align-items: flex-end;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
`;

interface PaymentMethodFormProps {
  onSubmit: (data: PaymentMethodData) => void;
  onCancel?: () => void;
  loading?: boolean;
  language?: 'en' | 'bg';
}

interface PaymentMethodData {
  cardNumber: string;
  cardholderName: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  saveCard: boolean;
}

interface FormErrors {
  cardNumber?: string;
  cardholderName?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cvv?: string;
}

export const PaymentMethodForm: React.FC<PaymentMethodFormProps> = ({
  onSubmit,
  onCancel,
  loading = false,
  language = 'en',
}) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState<PaymentMethodData>({
    cardNumber: '',
    cardholderName: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    saveCard: true,
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g) || [];
    return chunks.join(' ');
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, '');
    if (/^\d*$/.test(value) && value.length <= 16) {
      setFormData({ ...formData, cardNumber: value });
      setErrors({ ...errors, cardNumber: undefined });
    }
  };

  const handleExpiryMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 2) {
      const month = parseInt(value);
      if (value === '' || (month >= 1 && month <= 12)) {
        setFormData({ ...formData, expiryMonth: value });
        setErrors({ ...errors, expiryMonth: undefined });
      }
    }
  };

  const handleExpiryYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 2) {
      setFormData({ ...formData, expiryYear: value });
      setErrors({ ...errors, expiryYear: undefined });
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (/^\d*$/.test(value) && value.length <= 4) {
      setFormData({ ...formData, cvv: value });
      setErrors({ ...errors, cvv: undefined });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Card number validation
    if (!formData.cardNumber) {
      newErrors.cardNumber = t('payment.cardNumberRequired');
    } else if (formData.cardNumber.length !== 16) {
      newErrors.cardNumber = t('payment.cardNumberLength');
    } else if (!luhnCheck(formData.cardNumber)) {
      newErrors.cardNumber = t('payment.invalidCardNumber');
    }

    // Cardholder name validation
    if (!formData.cardholderName) {
      newErrors.cardholderName = t('payment.cardholderNameRequired');
    } else if (formData.cardholderName.length < 3) {
      newErrors.cardholderName = t('payment.nameTooShort');
    }

    // Expiry month validation
    if (!formData.expiryMonth) {
      newErrors.expiryMonth = t('payment.required');
    } else {
      const month = parseInt(formData.expiryMonth);
      if (month < 1 || month > 12) {
        newErrors.expiryMonth = t('payment.invalid');
      }
    }

    // Expiry year validation
    if (!formData.expiryYear) {
      newErrors.expiryYear = t('payment.required');
    } else {
      const currentYear = new Date().getFullYear() % 100;
      const year = parseInt(formData.expiryYear);
      if (year < currentYear) {
        newErrors.expiryYear = t('payment.expired');
      }
    }

    // CVV validation
    if (!formData.cvv) {
      newErrors.cvv = t('payment.required');
    } else if (formData.cvv.length < 3) {
      newErrors.cvv = t('payment.invalid');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const luhnCheck = (cardNumber: string): boolean => {
    let sum = 0;
    let isEven = false;

    for (let i = cardNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cardNumber[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const getCardBrand = (cardNumber: string): string => {
    if (cardNumber.startsWith('4')) return 'Visa';
    if (cardNumber.startsWith('5')) return 'Mastercard';
    if (cardNumber.startsWith('3')) return 'Amex';
    return 'Card';
  };

  return (
    <FormContainer>
      <FormHeader>
        <Title>
          {t('payment.addPaymentMethod')}
        </Title>
        <Subtitle>
          {t('payment.secureInfo')}
        </Subtitle>
      </FormHeader>

      <SecurityBadge>
        <Lock />
        {t('payment.sslEncrypted')}
      </SecurityBadge>

      <CardPreview>
        <CardChip />
        <CardNumber>
          {formData.cardNumber
            ? formatCardNumber(formData.cardNumber.padEnd(16, '•'))
            : '•••• •••• •••• ••••'}
        </CardNumber>
        <CardInfo>
          <CardHolder>
            <CardLabel>{t('payment.cardHolder')}</CardLabel>
            <CardValue>
              {formData.cardholderName || (t('payment.yourName'))}
            </CardValue>
          </CardHolder>
          <CardExpiry>
            <CardLabel>{t('payment.validThru')}</CardLabel>
            <CardValue>
              {formData.expiryMonth.padStart(2, '0') || 'MM'}/
              {formData.expiryYear.padStart(2, '0') || 'YY'}
            </CardValue>
          </CardExpiry>
        </CardInfo>
      </CardPreview>

      <Form onSubmit={handleSubmit}>
        <FormGroup>
          <Label htmlFor="cardNumber">
            {t('payment.cardNumber')}
          </Label>
          <InputWrapper $hasError={!!errors.cardNumber}>
            <Input
              id="cardNumber"
              type="text"
              placeholder="1234 5678 9012 3456"
              value={formatCardNumber(formData.cardNumber)}
              onChange={handleCardNumberChange}
              disabled={loading}
            />
            <InputIcon>
              <CreditCard />
            </InputIcon>
          </InputWrapper>
          {errors.cardNumber && (
            <ErrorMessage>
              <AlertCircle />
              {errors.cardNumber}
            </ErrorMessage>
          )}
        </FormGroup>

        <FormGroup>
          <Label htmlFor="cardholderName">
            {t('payment.cardholderName')}
          </Label>
          <InputWrapper $hasError={!!errors.cardholderName}>
            <Input
              id="cardholderName"
              type="text"
              placeholder={t('payment.cardholderPlaceholder')}
              value={formData.cardholderName}
              onChange={(e) => {
                setFormData({ ...formData, cardholderName: e.target.value.toUpperCase() });
                setErrors({ ...errors, cardholderName: undefined });
              }}
              disabled={loading}
            />
          </InputWrapper>
          {errors.cardholderName && (
            <ErrorMessage>
              <AlertCircle />
              {errors.cardholderName}
            </ErrorMessage>
          )}
        </FormGroup>

        <Row>
          <FormGroup>
            <Label htmlFor="expiryMonth">
              {t('payment.expiryMonth')}
            </Label>
            <InputWrapper $hasError={!!errors.expiryMonth}>
              <Input
                id="expiryMonth"
                type="text"
                placeholder="MM"
                value={formData.expiryMonth}
                onChange={handleExpiryMonthChange}
                disabled={loading}
              />
            </InputWrapper>
            {errors.expiryMonth && (
              <ErrorMessage>
                <AlertCircle />
                {errors.expiryMonth}
              </ErrorMessage>
            )}
          </FormGroup>

          <FormGroup>
            <Label htmlFor="expiryYear">
              {t('payment.expiryYear')}
            </Label>
            <InputWrapper $hasError={!!errors.expiryYear}>
              <Input
                id="expiryYear"
                type="text"
                placeholder="YY"
                value={formData.expiryYear}
                onChange={handleExpiryYearChange}
                disabled={loading}
              />
            </InputWrapper>
            {errors.expiryYear && (
              <ErrorMessage>
                <AlertCircle />
                {errors.expiryYear}
              </ErrorMessage>
            )}
          </FormGroup>
        </Row>

        <FormGroup>
          <Label htmlFor="cvv">CVV / CVC</Label>
          <InputWrapper $hasError={!!errors.cvv}>
            <Input
              id="cvv"
              type="password"
              placeholder="123"
              value={formData.cvv}
              onChange={handleCvvChange}
              disabled={loading}
              maxLength={4}
            />
          </InputWrapper>
          {errors.cvv && (
            <ErrorMessage>
              <AlertCircle />
              {errors.cvv}
            </ErrorMessage>
          )}
        </FormGroup>

        <CheckboxWrapper>
          <input
            type="checkbox"
            checked={formData.saveCard}
            onChange={(e) => setFormData({ ...formData, saveCard: e.target.checked })}
            disabled={loading}
          />
          {t('payment.saveForFuture')}
        </CheckboxWrapper>

        <Actions>
          <Button
            type="submit"
            variant="primary"
            size="large"
            fullWidth
            disabled={loading}
          >
            {loading
              ? t('payment.processing')
              : t('payment.addCard')}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="large"
              onClick={onCancel}
              disabled={loading}
            >
              {t('payment.cancel')}
            </Button>
          )}
        </Actions>
      </Form>
    </FormContainer>
  );
};

export default PaymentMethodForm;
