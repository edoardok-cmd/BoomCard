import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  CreditCard,
  Download,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Edit,
  Trash2,
} from 'lucide-react';
import Button from '../common/Button/Button';

const DashboardContainer = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
`;

const Header = styled.div`
  margin-bottom: 2rem;
`;

const Title = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-size: 1rem;
  color: #6b7280;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
`;

const Card = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
`;

const CardHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
`;

const CardTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const CardIcon = styled.div<{ $color: string }>`
  width: 2.5rem;
  height: 2.5rem;
  background: ${props => props.$color};
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }
`;

const CardValue = styled.div`
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
`;

const CardSubtext = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const StatusBadge = styled.span<{ $status: 'active' | 'past_due' | 'canceled' }>`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.875rem;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      case 'active': return '#d1fae5';
      case 'past_due': return '#fef3c7';
      case 'canceled': return '#fee2e2';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'active': return '#065f46';
      case 'past_due': return '#92400e';
      case 'canceled': return '#991b1b';
    }
  }};

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const Section = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid #e5e7eb;
  margin-bottom: 2rem;
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
`;

const SectionTitle = styled.h2`
  font-size: 1.25rem;
  font-weight: 700;
  color: #111827;
`;

const PaymentMethodCard = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.75rem;
  margin-bottom: 1rem;
  transition: all 0.2s;

  &:hover {
    border-color: #d1d5db;
    background: #f9fafb;
  }
`;

const CardIconLarge = styled.div`
  width: 3rem;
  height: 3rem;
  background: linear-gradient(135deg, #000000 0%, #374151 100%);
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 1.5rem;
    height: 1.5rem;
    color: white;
  }
`;

const PaymentMethodInfo = styled.div`
  flex: 1;
`;

const PaymentMethodName = styled.div`
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
`;

const PaymentMethodDetails = styled.div`
  font-size: 0.875rem;
  color: #6b7280;
`;

const PaymentMethodActions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const IconButton = styled.button`
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 1rem;
    height: 1rem;
    color: #6b7280;
  }

  &:hover {
    background: #f3f4f6;
    border-color: #d1d5db;

    svg {
      color: #111827;
    }
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const TableHeader = styled.th`
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  border-bottom: 2px solid #e5e7eb;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const TableRow = styled.tr`
  &:hover {
    background: #f9fafb;
  }
`;

const TableCell = styled.td`
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.9375rem;
  color: #374151;
`;

const InvoiceStatus = styled.span<{ $status: string }>`
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 600;
  background: ${props => {
    switch (props.$status) {
      case 'paid': return '#d1fae5';
      case 'pending': return '#fef3c7';
      case 'failed': return '#fee2e2';
      default: return '#f3f4f6';
    }
  }};
  color: ${props => {
    switch (props.$status) {
      case 'paid': return '#065f46';
      case 'pending': return '#92400e';
      case 'failed': return '#991b1b';
      default: return '#374151';
    }
  }};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1rem;
  color: #6b7280;
`;

const EmptyStateIcon = styled.div`
  width: 4rem;
  height: 4rem;
  background: #f3f4f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;

  svg {
    width: 2rem;
    height: 2rem;
    color: #9ca3af;
  }
`;

const EmptyStateText = styled.p`
  font-size: 1rem;
  margin-bottom: 1rem;
`;

interface Subscription {
  planName: string;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: Date;
  amount: number;
  currency: string;
  interval: 'month' | 'year';
}

interface PaymentMethod {
  id: string;
  type: 'card';
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

interface Invoice {
  id: string;
  number: string;
  date: Date;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  pdfUrl?: string;
}

interface BillingDashboardProps {
  subscription: Subscription;
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  onUpdatePlan?: () => void;
  onAddPaymentMethod?: () => void;
  onEditPaymentMethod?: (id: string) => void;
  onDeletePaymentMethod?: (id: string) => void;
  onDownloadInvoice?: (id: string) => void;
  language?: 'en' | 'bg';
}

export const BillingDashboard: React.FC<BillingDashboardProps> = ({
  subscription,
  paymentMethods,
  invoices,
  onUpdatePlan,
  onAddPaymentMethod,
  onEditPaymentMethod,
  onDeletePaymentMethod,
  onDownloadInvoice,
  language = 'en',
}) => {
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(language === 'bg' ? 'bg-BG' : 'en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount / 100);
  };

  const getStatusIcon = (status: Subscription['status']) => {
    switch (status) {
      case 'active':
        return <CheckCircle />;
      case 'past_due':
        return <AlertCircle />;
      case 'canceled':
        return <Clock />;
    }
  };

  const getStatusText = (status: Subscription['status']) => {
    if (language === 'bg') {
      switch (status) {
        case 'active': return 'Активен';
        case 'past_due': return 'Просрочен';
        case 'canceled': return 'Отменен';
      }
    }
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const totalSpent = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <DashboardContainer>
      <Header>
        <Title>{language === 'bg' ? 'Фактуриране' : 'Billing'}</Title>
        <Subtitle>
          {language === 'bg'
            ? 'Управлявайте вашия абонамент и плащания'
            : 'Manage your subscription and payment methods'}
        </Subtitle>
      </Header>

      <Grid>
        <Card
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <CardHeader>
            <CardTitle>{language === 'bg' ? 'Текущ план' : 'Current Plan'}</CardTitle>
            <CardIcon $color="#6366f1">
              <TrendingUp />
            </CardIcon>
          </CardHeader>
          <CardValue>{subscription.planName}</CardValue>
          <CardSubtext>
            <StatusBadge $status={subscription.status}>
              {getStatusIcon(subscription.status)}
              {getStatusText(subscription.status)}
            </StatusBadge>
          </CardSubtext>
        </Card>

        <Card
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <CardHeader>
            <CardTitle>{language === 'bg' ? 'Следващо плащане' : 'Next Payment'}</CardTitle>
            <CardIcon $color="#10b981">
              <Calendar />
            </CardIcon>
          </CardHeader>
          <CardValue>
            {formatCurrency(subscription.amount, subscription.currency)}
          </CardValue>
          <CardSubtext>
            {language === 'bg' ? 'Дължимо на' : 'Due on'} {formatDate(subscription.currentPeriodEnd)}
          </CardSubtext>
        </Card>

        <Card
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <CardHeader>
            <CardTitle>{language === 'bg' ? 'Общо платени' : 'Total Spent'}</CardTitle>
            <CardIcon $color="#8b5cf6">
              <CreditCard />
            </CardIcon>
          </CardHeader>
          <CardValue>
            {formatCurrency(totalSpent, subscription.currency)}
          </CardValue>
          <CardSubtext>
            {invoices.filter(inv => inv.status === 'paid').length} {language === 'bg' ? 'фактури' : 'invoices'}
          </CardSubtext>
        </Card>
      </Grid>

      <Section>
        <SectionHeader>
          <SectionTitle>
            {language === 'bg' ? 'Детайли на абонамента' : 'Subscription Details'}
          </SectionTitle>
          <Button variant="outline" size="medium" onClick={onUpdatePlan}>
            {language === 'bg' ? 'Промени план' : 'Change Plan'}
          </Button>
        </SectionHeader>

        <Grid style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <CardSubtext style={{ marginBottom: '0.5rem' }}>
              {language === 'bg' ? 'Текущ период' : 'Current Period'}
            </CardSubtext>
            <CardValue style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
              {formatDate(new Date())} - {formatDate(subscription.currentPeriodEnd)}
            </CardValue>
          </div>
          <div>
            <CardSubtext style={{ marginBottom: '0.5rem' }}>
              {language === 'bg' ? 'Цикъл на фактуриране' : 'Billing Cycle'}
            </CardSubtext>
            <CardValue style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>
              {subscription.interval === 'month'
                ? language === 'bg' ? 'Месечно' : 'Monthly'
                : language === 'bg' ? 'Годишно' : 'Annual'}
            </CardValue>
          </div>
        </Grid>
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>
            {language === 'bg' ? 'Методи на плащане' : 'Payment Methods'}
          </SectionTitle>
          <Button variant="primary" size="medium" onClick={onAddPaymentMethod}>
            {language === 'bg' ? 'Добави метод' : 'Add Method'}
          </Button>
        </SectionHeader>

        {paymentMethods.length > 0 ? (
          paymentMethods.map(method => (
            <PaymentMethodCard key={method.id}>
              <CardIconLarge>
                <CreditCard />
              </CardIconLarge>
              <PaymentMethodInfo>
                <PaymentMethodName>
                  {method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} •••• {method.last4}
                  {method.isDefault && (
                    <StatusBadge $status="active" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                      {language === 'bg' ? 'По подразбиране' : 'Default'}
                    </StatusBadge>
                  )}
                </PaymentMethodName>
                <PaymentMethodDetails>
                  {language === 'bg' ? 'Изтича' : 'Expires'} {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                </PaymentMethodDetails>
              </PaymentMethodInfo>
              <PaymentMethodActions>
                <IconButton onClick={() => onEditPaymentMethod?.(method.id)}>
                  <Edit />
                </IconButton>
                {!method.isDefault && (
                  <IconButton onClick={() => onDeletePaymentMethod?.(method.id)}>
                    <Trash2 />
                  </IconButton>
                )}
              </PaymentMethodActions>
            </PaymentMethodCard>
          ))
        ) : (
          <EmptyState>
            <EmptyStateIcon>
              <CreditCard />
            </EmptyStateIcon>
            <EmptyStateText>
              {language === 'bg'
                ? 'Няма добавени методи на плащане'
                : 'No payment methods added'}
            </EmptyStateText>
            <Button variant="primary" size="medium" onClick={onAddPaymentMethod}>
              {language === 'bg' ? 'Добави метод' : 'Add Payment Method'}
            </Button>
          </EmptyState>
        )}
      </Section>

      <Section>
        <SectionHeader>
          <SectionTitle>
            {language === 'bg' ? 'История на фактурите' : 'Invoice History'}
          </SectionTitle>
        </SectionHeader>

        {invoices.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <TableHeader>{language === 'bg' ? 'Фактура' : 'Invoice'}</TableHeader>
                <TableHeader>{language === 'bg' ? 'Дата' : 'Date'}</TableHeader>
                <TableHeader>{language === 'bg' ? 'Сума' : 'Amount'}</TableHeader>
                <TableHeader>{language === 'bg' ? 'Статус' : 'Status'}</TableHeader>
                <TableHeader></TableHeader>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <strong>{invoice.number}</strong>
                  </TableCell>
                  <TableCell>{formatDate(invoice.date)}</TableCell>
                  <TableCell>
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatus $status={invoice.status}>
                      {language === 'bg'
                        ? invoice.status === 'paid' ? 'Платена' : invoice.status === 'pending' ? 'Изчакваща' : 'Неуспешна'
                        : invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </InvoiceStatus>
                  </TableCell>
                  <TableCell>
                    <IconButton onClick={() => onDownloadInvoice?.(invoice.id)}>
                      <Download />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState>
            <EmptyStateIcon>
              <FileText />
            </EmptyStateIcon>
            <EmptyStateText>
              {language === 'bg'
                ? 'Няма фактури'
                : 'No invoices yet'}
            </EmptyStateText>
          </EmptyState>
        )}
      </Section>
    </DashboardContainer>
  );
};

export default BillingDashboard;
