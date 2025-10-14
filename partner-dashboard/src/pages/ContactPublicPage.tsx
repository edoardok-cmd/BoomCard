import React, { useState } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import toast from 'react-hot-toast';

const PageContainer = styled.div`
  min-height: 100vh;
  background: var(--color-background);
  padding: 6rem 2rem 4rem;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled(motion.h1)`
  font-size: 3rem;
  font-weight: 800;
  text-align: center;
  margin-bottom: 1rem;
  color: var(--color-text-primary);
`;

const Subtitle = styled(motion.p)`
  font-size: 1.25rem;
  text-align: center;
  color: var(--color-text-secondary);
  margin-bottom: 4rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const ContactInfo = styled.div`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
`;

const InfoItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const IconWrapper = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 0.75rem;
  background: var(--color-background-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-primary);
  flex-shrink: 0;
`;

const InfoContent = styled.div`
  flex: 1;
`;

const InfoTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--color-text-primary);
`;

const InfoText = styled.p`
  font-size: 1rem;
  color: var(--color-text-secondary);
`;

const Form = styled.form`
  background: var(--color-background);
  border-radius: 1rem;
  padding: 2.5rem;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--color-border);
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

const Input = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 1rem;
  background: var(--color-background);
  color: var(--color-text-primary);
  min-height: 150px;
  resize: vertical;
  transition: all 0.2s;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 1rem;
  background: var(--color-primary);
  color: var(--color-secondary);
  border: none;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.3s;

  &:hover {
    background: var(--color-primary-hover);
    transform: translateY(-2px);
    box-shadow: var(--shadow-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

const ContactPublicPage: React.FC = () => {
  const { language } = useLanguage();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success(language === 'bg' 
        ? 'Съобщението е изпратено успешно!' 
        : 'Message sent successfully!');
      setFormData({ name: '', email: '', phone: '', message: '' });
    } catch (error) {
      toast.error(language === 'bg' 
        ? 'Грешка при изпращане' 
        : 'Error sending message');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <PageContainer>
      <Container>
        <Title
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {language === 'bg' ? 'Свържете се с нас' : 'Contact Us'}
        </Title>
        <Subtitle
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          {language === 'bg'
            ? 'Имате въпроси? Ние сме тук, за да помогнем.'
            : 'Have questions? We\'re here to help.'}
        </Subtitle>

        <Grid>
          <ContactInfo>
            <InfoItem>
              <IconWrapper>
                <Mail size={24} />
              </IconWrapper>
              <InfoContent>
                <InfoTitle>{language === 'bg' ? 'Имейл' : 'Email'}</InfoTitle>
                <InfoText>support@boomcard.com</InfoText>
                <InfoText>sales@boomcard.com</InfoText>
              </InfoContent>
            </InfoItem>

            <InfoItem>
              <IconWrapper>
                <Phone size={24} />
              </IconWrapper>
              <InfoContent>
                <InfoTitle>{language === 'bg' ? 'Телефон' : 'Phone'}</InfoTitle>
                <InfoText>+359 2 123 4567</InfoText>
                <InfoText>{language === 'bg' ? 'Пон-Пет 9:00-18:00' : 'Mon-Fri 9:00-18:00'}</InfoText>
              </InfoContent>
            </InfoItem>

            <InfoItem>
              <IconWrapper>
                <MapPin size={24} />
              </IconWrapper>
              <InfoContent>
                <InfoTitle>{language === 'bg' ? 'Адрес' : 'Address'}</InfoTitle>
                <InfoText>Sofia Tech Park</InfoText>
                <InfoText>111 Tsarigradsko Shose Blvd.</InfoText>
                <InfoText>Sofia, Bulgaria</InfoText>
              </InfoContent>
            </InfoItem>
          </ContactInfo>

          <Form onSubmit={handleSubmit}>
            <FormGroup>
              <Label>{language === 'bg' ? 'Име' : 'Name'} *</Label>
              <Input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder={language === 'bg' ? 'Вашето име' : 'Your name'}
              />
            </FormGroup>

            <FormGroup>
              <Label>{language === 'bg' ? 'Имейл' : 'Email'} *</Label>
              <Input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                placeholder={language === 'bg' ? 'your@email.com' : 'your@email.com'}
              />
            </FormGroup>

            <FormGroup>
              <Label>{language === 'bg' ? 'Телефон' : 'Phone'}</Label>
              <Input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder={language === 'bg' ? '+359 ...' : '+359 ...'}
              />
            </FormGroup>

            <FormGroup>
              <Label>{language === 'bg' ? 'Съобщение' : 'Message'} *</Label>
              <Textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                placeholder={language === 'bg' 
                  ? 'Как можем да ви помогнем?' 
                  : 'How can we help you?'}
              />
            </FormGroup>

            <SubmitButton type="submit" disabled={isSubmitting}>
              <Send size={18} />
              {isSubmitting 
                ? (language === 'bg' ? 'Изпраща се...' : 'Sending...') 
                : (language === 'bg' ? 'Изпрати съобщение' : 'Send Message')}
            </SubmitButton>
          </Form>
        </Grid>
      </Container>
    </PageContainer>
  );
};

export default ContactPublicPage;
