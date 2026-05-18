import React, { useState } from 'react';
import GenericPage from '../components/templates/GenericPage';
import { useLanguage } from '../contexts/LanguageContext';
import styled from 'styled-components';

const SupportGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
`;

const SupportCard = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
  transition: border-color 0.2s;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }

  &:hover {
    border-color: #000000;
  }
`;

const ExternalLinkedCard = styled.a`
  display: block;
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
  transition: border-color 0.2s;
  text-decoration: none;
  cursor: pointer;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }

  &:hover {
    border-color: #000000;
  }
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.75rem;
  color: #111827;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const CardText = styled.p`
  color: #6b7280;
  line-height: 1.6;
  margin: 0;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const FormSection = styled.div`
  background: white;
  border-radius: 1rem;
  border: 2px solid #e5e7eb;
  padding: 2rem;
  margin-top: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
    border-color: #374151;
  }
`;

const FormTitle = styled.h2`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin: 0 0 1.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-bottom: 1rem;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const Input = styled.input`
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  background: white;
  width: 100%;
  box-sizing: border-box;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const Textarea = styled.textarea`
  padding: 0.75rem 1rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.9375rem;
  color: #111827;
  background: white;
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 130px;
  font-family: inherit;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;
  }
`;

const SubmitButton = styled.button`
  padding: 0.75rem 2rem;
  background: #000000;
  color: white;
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: #1f2937;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const SuccessMsg = styled.div`
  padding: 1rem 1.25rem;
  background: #d1fae5;
  border: 1px solid #6ee7b7;
  border-radius: 0.5rem;
  color: #065f46;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const SupportPage: React.FC = () => {
  const { language } = useLanguage();
  const isBg = language === 'bg';
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch('https://formsubmit.co/ajax/support@boomcard.bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, message: form.message }),
      });
    } catch {
      // best-effort — show success regardless so the user isn't blocked
    }
    setSubmitted(true);
    setSubmitting(false);
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <GenericPage
      titleEn="Support Center"
      titleBg="Център за Поддръжка"
      subtitleEn="Find answers and get help with BoomCard"
      subtitleBg="Намерете отговори и получете помощ с BoomCard"
    >
      <SupportGrid>
        <ExternalLinkedCard href="/#faq">
          <CardTitle>{isBg ? 'Често Задавани Въпроси' : 'Frequently Asked Questions'}</CardTitle>
          <CardText>
            {isBg
              ? 'Намерете бързи отговори на най-често задаваните въпроси.'
              : 'Find quick answers to the most common questions.'}
          </CardText>
        </ExternalLinkedCard>

        <SupportCard>
          <CardTitle>{isBg ? 'Имейл Поддръжка' : 'Email Support'}</CardTitle>
          <CardText>
            {isBg
              ? <>Изпратете ни имейл на <a href="mailto:support@boomcard.bg" style={{ color: '#000000', fontWeight: 600 }}>support@boomcard.bg</a> и ние ще отговорим в рамките на 24 часа.</>
              : <>Send us an email at <a href="mailto:support@boomcard.bg" style={{ color: '#000000', fontWeight: 600 }}>support@boomcard.bg</a> and we&apos;ll respond within 24 hours.</>}
          </CardText>
        </SupportCard>
      </SupportGrid>

      <FormSection>
        <FormTitle>{isBg ? 'Изпрати съобщение' : 'Send a Message'}</FormTitle>

        {submitted && (
          <SuccessMsg>
            {isBg ? 'Благодарим! Ще се свържем с теб скоро.' : 'Thank you! We\'ll be in touch soon.'}
          </SuccessMsg>
        )}

        <form onSubmit={handleSubmit}>
          <FormRow>
            <FormGroup>
              <Label htmlFor="support-name">{isBg ? 'Иme' : 'Name'}</Label>
              <Input
                id="support-name"
                name="name"
                type="text"
                required
                value={form.name}
                onChange={handleChange}
                placeholder={isBg ? 'Вашето име' : 'Your name'}
              />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="support-email">{isBg ? 'Имейл' : 'Email'}</Label>
              <Input
                id="support-email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder={isBg ? 'вашият@имейл.com' : 'your@email.com'}
              />
            </FormGroup>
          </FormRow>
          <FormGroup>
            <Label htmlFor="support-message">{isBg ? 'Съобщение' : 'Message'}</Label>
            <Textarea
              id="support-message"
              name="message"
              required
              value={form.message}
              onChange={handleChange}
              placeholder={isBg ? 'Опишете проблема или въпроса си...' : 'Describe your issue or question...'}
            />
          </FormGroup>
          <SubmitButton type="submit" disabled={submitting}>
            {submitting
              ? (isBg ? 'Изпращане...' : 'Sending...')
              : (isBg ? 'Изпрати' : 'Send Message')}
          </SubmitButton>
        </form>
      </FormSection>
    </GenericPage>
  );
};

export default SupportPage;
