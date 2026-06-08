import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { palette } from '../../styles/adminTheme';
import {
  adminHelpService,
  TicketPriority,
  TicketCategory,
} from '../../services/adminHelp.service';


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
const HintRow = styled.div`display: flex; justify-content: space-between; align-items: center;`;
const Hint = styled.p<{ $error?: boolean }>`
  font-size: 0.75rem;
  color: ${p => p.$error ? palette.danger : palette.textSubtle};
  margin: 0;
`;
const Counter = styled.span<{ $warn?: boolean }>`
  font-size: 0.75rem;
  color: ${p => p.$warn ? palette.danger : palette.textSubtle};
  white-space: nowrap;
`;

const Input = styled.input<{ $invalid?: boolean }>`
  padding: 0.5rem 0.875rem; border: 1px solid ${p => p.$invalid ? palette.danger : palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; background: ${palette.bg}; color: ${palette.text}; outline: none;
  &:focus { border-color: ${p => p.$invalid ? palette.danger : palette.accent}; box-shadow: 0 0 0 2px ${p => p.$invalid ? palette.dangerSoft : palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
`;

const Select = styled.select`
  padding: 0.5rem 0.75rem; border: 1px solid ${palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; background: ${palette.bg}; color: ${palette.text}; outline: none; cursor: pointer;
  &:focus { border-color: ${palette.accent}; }
`;

const Textarea = styled.textarea<{ $invalid?: boolean }>`
  padding: 0.625rem 0.875rem; border: 1px solid ${p => p.$invalid ? palette.danger : palette.border}; border-radius: 0.5rem;
  font-size: 0.9375rem; font-family: inherit; background: ${palette.bg}; color: ${palette.text};
  outline: none; resize: vertical; min-height: 8rem;
  &:focus { border-color: ${p => p.$invalid ? palette.danger : palette.accent}; box-shadow: 0 0 0 2px ${p => p.$invalid ? palette.dangerSoft : palette.accentSoft}; }
  &::placeholder { color: ${palette.textSubtle}; }
  &:disabled { opacity: 0.6; }
`;

const SubmitBtn = styled.button`
  align-self: flex-start; padding: 0.625rem 1.5rem; border: none; border-radius: 0.5rem;
  background: ${palette.accent}; color: ${palette.onAccent}; font-size: 0.9375rem; font-weight: 600;
  cursor: pointer;
  &:hover:not(:disabled) { background: #b5522e; }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

export default function AdminHelpNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<TicketCategory | ''>('');
  const [priority, setPriority] = useState<TicketPriority>('MEDIUM');
  const [touched, setTouched] = useState({ subject: false, body: false, category: false });

  const subjectTrimmed = subject.trim();
  const bodyTrimmed = body.trim();

  const subjectError =
    touched.subject && subjectTrimmed.length < 5 ? 'Минимум 5 символа.' :
    touched.subject && subjectTrimmed.length > SUBJECT_MAX ? `Максимум ${SUBJECT_MAX} символа.` : null;

  const bodyError =
    touched.body && bodyTrimmed.length < 10 ? 'Минимум 10 символа.' :
    touched.body && bodyTrimmed.length > BODY_MAX ? `Максимум ${BODY_MAX} символа.` : null;

  const categoryError = touched.category && category === '' ? 'Изберете категория.' : null;

  const canSubmit =
    subjectTrimmed.length >= 5 &&
    subjectTrimmed.length <= SUBJECT_MAX &&
    bodyTrimmed.length >= 10 &&
    bodyTrimmed.length <= BODY_MAX &&
    category !== '';

  const createMutation = useMutation({
    mutationFn: () =>
      adminHelpService.create({ subject: subjectTrimmed, body: bodyTrimmed, category: category as TicketCategory, priority }),
    onSuccess: () => {
      toast.success('Заявката е изпратена успешно');
      qc.invalidateQueries({ queryKey: ['admin-help-mine'] });
      qc.invalidateQueries({ queryKey: ['admin-help-all'] });
      qc.invalidateQueries({ queryKey: ['admin-help-new-count'] });
      navigate('/admin/help/mine');
    },
    onError: () => toast.error('Грешка при изпращане на заявката'),
  });

  return (
    <PageShell>
      <PageHeader>
        <Eyebrow>Помощ</Eyebrow>
        <PageTitle>Нова заявка</PageTitle>
        <PageSubtitle>Подайте вътрешна заявка към support@boomcard.bg</PageSubtitle>
      </PageHeader>

      <Card>
        <Form onSubmit={(e) => {
          e.preventDefault();
          setTouched({ subject: true, body: true, category: true });
          if (canSubmit && !createMutation.isPending) createMutation.mutate();
        }}>
          <FieldGroup>
            <Label htmlFor="subject">Тема <Required>*</Required></Label>
            <Input
              id="subject"
              type="text"
              placeholder="Кратко описание на проблема…"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={() => setTouched(t => ({ ...t, subject: true }))}
              maxLength={SUBJECT_MAX}
              disabled={createMutation.isPending}
              $invalid={!!subjectError}
            />
            <HintRow>
              {subjectError
                ? <Hint $error>{subjectError}</Hint>
                : <Hint>Минимум 5 символа.</Hint>
              }
              <Counter $warn={subject.length > SUBJECT_MAX * 0.9}>
                {subject.length}/{SUBJECT_MAX}
              </Counter>
            </HintRow>
          </FieldGroup>

          <Row>
            <FieldGroup>
              <Label htmlFor="category">Категория <Required>*</Required></Label>
              <Select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as TicketCategory | '')}
                onBlur={() => setTouched(t => ({ ...t, category: true }))}
                disabled={createMutation.isPending}
                style={categoryError ? { borderColor: palette.danger } : undefined}
              >
                <option value="">— Изберете категория —</option>
                <option value="CASHBACK">Кешбек</option>
                <option value="ACCOUNT">Акаунт</option>
                <option value="PAYMENT">Плащане</option>
                <option value="TECHNICAL">Техническо</option>
                <option value="OTHER">Друго</option>
              </Select>
              {categoryError && <Hint $error>{categoryError}</Hint>}
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
              onBlur={() => setTouched(t => ({ ...t, body: true }))}
              rows={7}
              maxLength={BODY_MAX}
              disabled={createMutation.isPending}
              $invalid={!!bodyError}
            />
            <HintRow>
              {bodyError
                ? <Hint $error>{bodyError}</Hint>
                : <Hint>Минимум 10 символа.</Hint>
              }
              <Counter $warn={body.length > BODY_MAX * 0.9}>
                {body.length}/{BODY_MAX}
              </Counter>
            </HintRow>
          </FieldGroup>

          <SubmitBtn type="submit" disabled={!canSubmit || createMutation.isPending}>
            {createMutation.isPending ? 'Изпращане…' : 'Изпрати заявка'}
          </SubmitBtn>
        </Form>
      </Card>
    </PageShell>
  );
}
