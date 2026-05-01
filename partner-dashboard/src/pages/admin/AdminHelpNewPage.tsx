import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  adminHelpService,
  TicketPriority,
  TicketCategory,
} from '../../services/adminHelp.service';

const palette = {
  bg: '#faf9f5', surface: '#ffffff', border: '#e8e5dc',
  text: '#141413', textMuted: '#605a50', textSubtle: '#8c8678',
  accent: '#c96442', accentSoft: '#f3e8de',
  danger: '#b54327',
};

const PageShell = styled.div`background: ${palette.bg}; min-height: calc(100vh - 4rem); padding: 2rem 2.5rem;`;
const PageHeader = styled.div`margin-bottom: 2rem;`;
const Eyebrow = styled.p`font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${palette.textSubtle}; margin-bottom: 0.25rem;`;
const PageTitle = styled.h1`font-size: 1.75rem; font-weight: 800; color: ${palette.text}; margin: 0 0 0.25rem;`;
const PageSubtitle = styled.p`font-size: 0.9375rem; color: ${palette.textMuted}; margin: 0;`;
const Card = styled.div`background: ${palette.surface}; border: 1px solid ${palette.border}; border-radius: 0.75rem; padding: 2rem; max-width: 42rem;`;
const Form = styled.form`display: flex; flex-direction: column; gap: 1.5rem;`;
const Row = styled.div`display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;`;
const FieldGroup = styled.div`display: flex; flex-direction: column; gap: 0.375rem;`;
const Label = styled.label`font-size: 0.875rem; font-weight: 600; color: ${palette.text};`;
const Required = styled.span`color: ${palette.danger}; margin-left: 0.15rem;`;
const Hint = styled.p`font-size: 0.75rem; color: ${palette.textSubtle}; margin: 0;`;

const Input = styled.input`
  padding: 0.5rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; background: ${palette.bg}; color: ${palette.text}; outline: none;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const Select = styled.select`
  padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer;
  &:focus { border-color: ${palette.accent}; }
`;

const Textarea = styled.textarea`
  padding: 0.625rem 0.875rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; font-family: inherit; background: ${palette.bg}; color: ${palette.text};
  outline: none; resize: vertical; min-height: 8rem;
  &:focus { border-color: ${palette.accent}; box-shadow: 0 0 0 2px ${palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
  &:disabled { opacity: 0.6; }
`;

const SubmitBtn = styled.button`
  align-self: flex-start; padding: 0.625rem 1.5rem; border: none; border-radius: 0.5rem;
  background: ${palette.accent}; color: #fff; font-size: 0.9375rem; font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #b5522e; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

export default function AdminHelpNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');

  const createMutation = useMutation({
    mutationFn: () =>
      adminHelpService.create({ subject: subject.trim(), body: body.trim(), category: category as TicketCategory, priority }),
    onSuccess: () => {
      toast.success('Заявката е изпратена успешно');
      qc.invalidateQueries({ queryKey: ['admin-help-mine'] });
      qc.invalidateQueries({ queryKey: ['admin-help-all'] });
      navigate('/admin/help/mine');
    },
    onError: () => toast.error('Грешка при изпращане на заявката'),
  });

  const canSubmit = subject.trim().length >= 5 && body.trim().length >= 10 && category !== '';

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Помощ</Eyebrow>
        <PageTitle>Нова заявка</PageTitle>
        <PageSubtitle>Подайте вътрешна заявка към support@boomcard.bg</PageSubtitle>
      </PageHeader>

      <Card>
        <Form onSubmit={(e) => { e.preventDefault(); if (canSubmit && !createMutation.isPending) createMutation.mutate(); }}>
          <FieldGroup>
            <Label htmlFor="subject">Тема <Required>*</Required></Label>
            <Input
              id="subject"
              type="text"
              placeholder="Кратко описание на проблема…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              disabled={createMutation.isPending}
            />
            <Hint>Минимум 5 символа.</Hint>
          </FieldGroup>

          <Row>
            <FieldGroup>
              <Label htmlFor="category">Категория <Required>*</Required></Label>
              <Select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory | '')}
                disabled={createMutation.isPending}
              >
                <option value="">— Изберете категория —</option>
                <option value="CASHBACK">Кешбек</option>
                <option value="ACCOUNT">Акаунт</option>
                <option value="PAYMENT">Плащане</option>
                <option value="TECHNICAL">Техническо</option>
                <option value="OTHER">Друго</option>
              </Select>
            </FieldGroup>
            <FieldGroup>
              <Label htmlFor="priority">Приоритет</Label>
              <Select
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                disabled={createMutation.isPending}
              >
                <option value="LOW">Нисък</option>
                <option value="MEDIUM">Среден</option>
                <option value="HIGH">Висок</option>
                <option value="URGENT">Спешен</option>
              </Select>
            </FieldGroup>
          </Row>

          <FieldGroup>
            <Label htmlFor="body">Съобщение <Required>*</Required></Label>
            <Textarea
              id="body"
              placeholder="Опишете подробно проблема…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={7}
              maxLength={5000}
              disabled={createMutation.isPending}
            />
            <Hint>Минимум 10 символа.</Hint>
          </FieldGroup>

          <SubmitBtn type="submit" disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? 'Изпращане…' : 'Изпрати заявка'}
          </SubmitBtn>
        </Form>
      </Card>
    </PageShell>
  );
}
