import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import styled from 'styled-components';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Button from '../components/common/Button/Button';
import Card from '../components/common/Card/Card';

const PageContainer = styled.div`
  min-height: 100vh;
  background: white;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const Hero = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

  /* Vibrant mode - explosive gradient hero */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  color: white;
  padding: 6rem 0 4rem;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.05) 100%);
  }

  @media (max-width: 768px) {
    padding: 4rem 0 3rem;
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 1.5rem;
  position: relative;
  z-index: 1;
`;

const HeroContent = styled.div`
  max-width: 700px;
  margin: 0 auto;
  text-align: center;
`;

const Title = styled.h1`
  font-size: 4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  line-height: 1.1;

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const Subtitle = styled.p`
  font-size: 1.5rem;
  opacity: 0.9;
  line-height: 1.6;
  margin-bottom: 2.5rem;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const HeroButtons = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
`;

const MicroTrust = styled.p`
  font-size: 0.9rem;
  opacity: 0.7;
  margin: 0;
`;

const Section = styled.section`
  padding: 5rem 0;

  @media (max-width: 768px) {
    padding: 3rem 0;
  }
`;

const SectionTitle = styled.h2`
  font-size: 3rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 1rem;
  text-align: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const SectionSubtitle = styled.p`
  font-size: 1.25rem;
  color: #6b7280;
  text-align: center;
  max-width: 800px;
  margin: 0 auto 4rem;
  line-height: 1.7;

  [data-theme="dark"] & {
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const BenefitsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const BenefitCard = styled(motion.div)`
  text-align: center;
  display: flex;
  flex-direction: column;

  > div {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
`;

const BenefitImageContainer = styled.div<{ $imageUrl?: string }>`
  width: 100%;
  height: 200px;
  background: ${props => props.$imageUrl ? `url(${props.$imageUrl})` : '#f3f4f6'};
  background-size: cover;
  background-position: center;
  overflow: hidden;
  transition: all 300ms;
  border-radius: 0.75rem 0.75rem 0 0;

  ${BenefitCard}:hover & {
    transform: scale(1.05);
  }
`;

const BenefitContent = styled.div`
  padding: 2rem;
  flex: 1;
  display: flex;
  flex-direction: column;

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const BenefitTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.75rem;
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const BenefitText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.6;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const StatsSection = styled.div`
  background: #f9fafb;
  padding: 4rem 0;
  text-align: center;

  [data-theme="dark"] & {
    background: #111827;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 3rem;
  max-width: 1000px;
  margin: 0 auto;
`;

const StatCard = styled.div``;

const StatNumber = styled.div`
  font-size: 3.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;
  line-height: 1;

  [data-theme="dark"] & {
    color: #f9fafb;
  }

  @media (max-width: 768px) {
    font-size: 2.5rem;
  }
`;

const StatLabel = styled.div`
  font-size: 1rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const ProcessSection = styled(Section)`
  background: white;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const ProcessSteps = styled.div`
  max-width: 900px;
  margin: 0 auto;
`;

const ProcessStep = styled(motion.div)`
  display: flex;
  gap: 2rem;
  margin-bottom: 3rem;
  align-items: start;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }
`;

const StepNumber = styled.div`
  flex-shrink: 0;
  width: 3.5rem;
  height: 3.5rem;
  background: #000000;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 700;

  [data-theme="dark"] & {
    background: #f9fafb;
    color: #000000;
  }
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const StepText = styled.p`
  font-size: 1rem;
  color: #6b7280;
  line-height: 1.7;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const CTASection = styled.div`
  background: linear-gradient(135deg, #000000 0%, #1f2937 100%);

  /* Vibrant mode - explosive gradient hero */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #1a0a2e 0%, #6a0572 25%, #ab2567 50%, #ff006e 75%, #ff4500 100%);
    background-size: 200% 200%;
    animation: heroGradientFlow 10s ease infinite;
    box-shadow:
      inset 0 -8px 40px -10px rgba(255, 69, 0, 0.3),
      inset 0 -4px 30px -10px rgba(255, 0, 110, 0.2);
  }

  @keyframes heroGradientFlow {
    0%, 100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
  color: white;
  padding: 5rem 0;
  text-align: center;

  @media (max-width: 768px) {
    padding: 3rem 0;
  }
`;

const CTATitle = styled.h2`
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const CTAText = styled.p`
  font-size: 1.25rem;
  opacity: 0.9;
  margin-bottom: 2.5rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.7;
  text-align: center;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const FormSection = styled.div`
  max-width: 900px;
  margin: 0 auto;
  background: white;
  padding: 3rem;
  border-radius: 1rem;

  [data-theme="dark"] & {
    background: #1f2937;
  }

  @media (max-width: 768px) {
    padding: 2rem;
  }
`;

const FormTitle = styled.h3`
  font-size: 1.75rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1.5rem;
  text-align: center;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const FormGrid = styled.div`
  display: grid;
  gap: 2rem;
`;

const FormGroup = styled.div``;

const Label = styled.label`
  display: block;
  font-size: 0.9375rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.5rem;
  padding-top: 0.5rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const Input = styled.input<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : '#d1d5db'};
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  transition: all 200ms;
  background: ${props => props.$hasError ? '#fef2f2' : 'white'};

  [data-theme="dark"] & {
    background: ${props => props.$hasError ? '#7f1d1d' : '#374151'};
    border-color: ${props => props.$hasError ? '#ef4444' : '#4b5563'};
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#000000'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.1)'};

    [data-theme="dark"] & {
      border-color: ${props => props.$hasError ? '#ef4444' : '#60a5fa'};
      box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(96, 165, 250, 0.2)'};
    }
  }

  &::placeholder {
    color: #9ca3af;

    [data-theme="dark"] & {
      color: #6b7280;
    }
  }

  &:disabled {
    background: #f9fafb;
    cursor: not-allowed;

    [data-theme="dark"] & {
      background: #1f2937;
    }
  }
`;

const Select = styled.select<{ $hasError?: boolean }>`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid ${props => props.$hasError ? '#ef4444' : '#d1d5db'};
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  background: ${props => props.$hasError ? '#fef2f2' : 'white'};
  cursor: pointer;
  transition: all 200ms;

  [data-theme="dark"] & {
    background: ${props => props.$hasError ? '#7f1d1d' : '#374151'};
    border-color: ${props => props.$hasError ? '#ef4444' : '#4b5563'};
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: ${props => props.$hasError ? '#ef4444' : '#000000'};
    box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0, 0, 0, 0.1)'};

    [data-theme="dark"] & {
      border-color: ${props => props.$hasError ? '#ef4444' : '#60a5fa'};
      box-shadow: 0 0 0 3px ${props => props.$hasError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(96, 165, 250, 0.2)'};
    }
  }

  &:disabled {
    background: #f9fafb;
    cursor: not-allowed;

    [data-theme="dark"] & {
      background: #1f2937;
    }
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 0.875rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 0.5rem;
  font-size: 1rem;
  color: #111827;
  min-height: 120px;
  resize: vertical;
  transition: all 200ms;
  font-family: inherit;

  [data-theme="dark"] & {
    background: #374151;
    border-color: #4b5563;
    color: #f9fafb;
  }

  &:focus {
    outline: none;
    border-color: #000000;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);

    [data-theme="dark"] & {
      border-color: #60a5fa;
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
    }
  }

  &::placeholder {
    color: #9ca3af;

    [data-theme="dark"] & {
      color: #6b7280;
    }
  }
`;

const FormSubSection = styled.div`
  padding: 1.5rem;
  background: #f9fafb;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    background: #111827;
    border-color: #374151;
  }
`;

const FormSubTitle = styled.h3`
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;

  &:last-child {
    margin-bottom: 0;
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
    gap: 2rem;
  }
`;

const ErrorMessage = styled(motion.span)`
  font-size: 0.875rem;
  color: #ef4444;
  margin-top: 0.25rem;
  display: block;
`;

const CheckboxGroup = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const Checkbox = styled.input`
  width: 1rem;
  height: 1rem;
  margin-top: 0.125rem;
  border: 1px solid #d1d5db;
  border-radius: 0.25rem;
  cursor: pointer;
  flex-shrink: 0;

  &:checked {
    background-color: #111827;
    border-color: #111827;
  }
`;

const CheckboxLabel = styled.label<{ $hasError?: boolean }>`
  font-size: 0.875rem;
  color: ${props => props.$hasError ? '#ef4444' : '#374151'};
  cursor: pointer;
  user-select: none;
  line-height: 1.4;

  [data-theme="dark"] & {
    color: ${props => props.$hasError ? '#ef4444' : '#d1d5db'};
  }

  a {
    color: #111827;
    font-weight: 600;
    text-decoration: none;
    transition: color 200ms;

    [data-theme="dark"] & {
      color: #60a5fa;
    }

    &:hover {
      color: #6b7280;

      [data-theme="dark"] & {
        color: #93c5fd;
      }
    }
  }
`;

const InfoBox = styled.div`
  padding: 1rem;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  color: #0c4a6e;
  line-height: 1.5;

  [data-theme="dark"] & {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(96, 165, 250, 0.3);
    color: #93c5fd;
  }
`;

const LocationsSection = styled.div`
  padding: 4rem 0;
  background: #f9fafb;
  scroll-margin-top: 80px;

  [data-theme="dark"] & {
    background: #0a0a0a;
  }
`;

const CityFilter = styled.div`
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 3rem;
  justify-content: center;
`;

const CityChip = styled.button<{ $active: boolean }>`
  padding: 0.75rem 1.5rem;
  border: 2px solid ${props => props.$active ? '#000000' : '#e5e7eb'};
  background: ${props => props.$active ? '#000000' : 'white'};
  color: ${props => props.$active ? 'white' : '#6b7280'};
  border-radius: 2rem;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;

  [data-theme="dark"] & {
    border-color: ${props => props.$active ? '#60a5fa' : '#4b5563'};
    background: ${props => props.$active ? '#60a5fa' : '#374151'};
    color: ${props => props.$active ? '#000000' : '#d1d5db'};
  }

  &:hover {
    border-color: #000000;

    [data-theme="dark"] & {
      border-color: #60a5fa;
    }
  }
`;

const LocationsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LocationCard = styled(motion.div)`
  background: white;
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s, box-shadow 0.3s;
  cursor: pointer;

  [data-theme="dark"] & {
    background: #1f2937;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  }

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);

    [data-theme="dark"] & {
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.5);
    }
  }
`;

const LocationImage = styled.div<{ $bgImage: string }>`
  height: 200px;
  background-image: url(${props => props.$bgImage});
  background-size: cover;
  background-position: center;
  position: relative;
`;

const LocationBadge = styled.span`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: #10b981;
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
`;

const LocationContent = styled.div`
  padding: 1.5rem;
`;

const LocationName = styled.h3`
  font-size: 1.5rem;
  font-weight: 700;
  color: #111827;
  margin-bottom: 0.5rem;

  [data-theme="dark"] & {
    color: #f9fafb;
  }
`;

const LocationAddress = styled.p`
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const LocationDescription = styled.p`
  font-size: 1rem;
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 1.5rem;

  [data-theme="dark"] & {
    color: #d1d5db;
  }
`;

const LocationFooter = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 1rem;
  border-top: 1px solid #e5e7eb;

  [data-theme="dark"] & {
    border-top-color: #374151;
  }
`;

const LocationStats = styled.div`
  display: flex;
  gap: 1rem;
`;

const Stat = styled.div`
  font-size: 0.875rem;
  color: #6b7280;

  [data-theme="dark"] & {
    color: #9ca3af;
  }
`;

const GradientButton = styled.button`
  width: 100%;
  padding: 1.125rem 2rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #1a1a1a;
  border: none;
  border-radius: 0.75rem;
  cursor: pointer;
  background: linear-gradient(135deg, #d4a843 0%, #c49b38 50%, #b8922f 100%);
  transition: all 300ms;
  box-shadow: 0 4px 20px rgba(212, 168, 67, 0.4);

  [data-theme="color"] & {
    background: linear-gradient(135deg, #e6b84d 0%, #d4a843 50%, #c49b38 100%);
    box-shadow: 0 6px 30px rgba(212, 168, 67, 0.5);
  }

  &:hover:not(:disabled) {
    transform: translateY(-1px);
    background: linear-gradient(135deg, #e0b44d 0%, #d4a843 50%, #c49b38 100%);
    box-shadow: 0 8px 30px rgba(212, 168, 67, 0.55);

    [data-theme="color"] & {
      box-shadow: 0 8px 35px rgba(212, 168, 67, 0.6);
    }
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const FormMicroTrust = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  text-align: center;
  margin-top: -0.5rem;

  [data-theme="dark"] & {
    color: #6b7280;
  }
`;

const ContactFallback = styled.div`
  text-align: center;
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid rgba(255, 255, 255, 0.15);

  button {
    color: white !important;
    border-color: rgba(255, 255, 255, 0.5) !important;

    &:hover {
      border-color: white !important;
      background: rgba(255, 255, 255, 0.1) !important;
    }
  }
`;

const ContactQuestion = styled.p`
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 1rem;
`;

interface Location {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string;
  imageUrl: string;
  offers: number;
  rating: number;
  openNow?: boolean;
}

const mockLocations: Location[] = [
  {
    id: '1',
    name: 'Downtown Restaurant & Bar',
    city: 'Sofia',
    address: 'Vitosha Blvd 123, Sofia 1000',
    description: 'Premium dining experience with rooftop terrace and city views. Specializing in Mediterranean cuisine.',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800',
    offers: 8,
    rating: 4.8,
    openNow: true,
  },
  {
    id: '2',
    name: 'Wellness Spa & Fitness Center',
    city: 'Sofia',
    address: 'Bulgaria Blvd 88, Sofia 1404',
    description: 'Full-service spa with modern fitness facilities, yoga studios, and relaxation areas.',
    imageUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800',
    offers: 5,
    rating: 4.9,
    openNow: true,
  },
  {
    id: '3',
    name: 'Seaside Beach Club',
    city: 'Varna',
    address: 'Sea Garden, Varna 9000',
    description: 'Exclusive beach club with water sports, pool bar, and sunset lounge area.',
    imageUrl: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800',
    offers: 12,
    rating: 4.7,
    openNow: false,
  },
  {
    id: '4',
    name: 'Mountain Resort & Ski Lodge',
    city: 'Bansko',
    address: 'Pirin Mountain, Bansko 2770',
    description: 'Alpine resort with ski slopes, cozy lodge, and après-ski entertainment.',
    imageUrl: 'https://images.unsplash.com/photo-1605870445919-838d190e8e1b?w=800',
    offers: 15,
    rating: 4.6,
  },
  {
    id: '5',
    name: 'Art Gallery & Café',
    city: 'Plovdiv',
    address: 'Old Town, Plovdiv 4000',
    description: 'Contemporary art space with specialty coffee and local artisan exhibitions.',
    imageUrl: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800',
    offers: 6,
    rating: 4.8,
    openNow: true,
  },
  {
    id: '6',
    name: 'Shopping Mall & Entertainment',
    city: 'Sofia',
    address: 'Tsarigradsko Shose 115, Sofia 1784',
    description: 'Modern shopping center with cinema, bowling, and diverse dining options.',
    imageUrl: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=800',
    offers: 25,
    rating: 4.5,
    openNow: true,
  },
];

interface FormErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  confirmPassword?: string;
  businessName?: string;
  businessCategory?: string;
  acceptTerms?: string;
  confirmBusiness?: string;
}

const PartnersPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { register, isLoading } = useAuth();
  const { language, t } = useLanguage();
  const [benefitsRef, benefitsInView] = useInView({ threshold: 0.2, triggerOnce: true });
  const [processRef, processInView] = useInView({ threshold: 0.2, triggerOnce: true });
  // City filter removed - locations now shown as showcase

  // Handle scrolling to hash anchor on page load
  useEffect(() => {
    if (location.hash) {
      // Remove the # from the hash
      const id = location.hash.replace('#', '');
      // Wait for the page to render, then scroll to the element
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          // Scroll to the element with smooth behavior and offset for header
          const headerOffset = 80; // Adjust this value based on your header height
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 100); // Small delay to ensure DOM is fully rendered
    }
  }, [location]);

  const categories = [
    { value: '', label: t('partnerRegistration.selectCategory') },
    { value: 'RESTAURANT', label: t('partnerRegistration.restaurant') },
    { value: 'HOTEL', label: t('partnerRegistration.hotel') },
    { value: 'SPA', label: t('partnerRegistration.spa') },
    { value: 'WINERY', label: t('partnerRegistration.winery') },
    { value: 'ENTERTAINMENT', label: t('partnerRegistration.entertainment') },
    { value: 'SPORTS', label: t('partnerRegistration.sports') },
    { value: 'BEAUTY', label: t('partnerRegistration.beauty') },
    { value: 'SHOPPING', label: t('partnerRegistration.shopping') },
    { value: 'TRAVEL', label: t('partnerRegistration.travel') },
  ];

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    businessName: '',
    businessNameBg: '',
    businessCategory: '',
    taxId: '',
    website: '',
    acceptTerms: false,
    confirmBusiness: false,
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const benefits = [
    {
      icon: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
      titleEn: 'More real customers',
      titleBg: 'Повече реални клиенти',
      textEn: 'BOOM Card users actively seek places with discounts. Your business appears in the app and attracts new visitors who are ready to spend.',
      textBg: 'Потребителите на BOOM Card активно търсят места с отстъпки. Вашият бизнес се показва в приложението и привлича нови посетители, готови да харчат.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=400&fit=crop',
      titleEn: 'Repeat visits and loyalty',
      titleBg: 'Повтаряеми посещения и лоялност',
      textEn: 'Discounts motivate customers to come back. Every visit builds a habit and turns a first-time guest into a regular.',
      textBg: 'Отстъпките мотивират клиентите да се връщат. Всяко посещение изгражда навик и превръща случайния гост в редовен.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=400&h=400&fit=crop',
      titleEn: 'Easy discount management',
      titleBg: 'Лесно управление на отстъпките',
      textEn: 'You set the discount levels, the system handles the rest. No complex integrations or extra work for your staff.',
      textBg: 'Вие задавате нивата на отстъпки, системата се грижи за останалото. Без сложни интеграции или допълнителна работа за персонала.'
    },
    {
      icon: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?w=400&h=400&fit=crop',
      titleEn: 'Secure and controlled platform',
      titleBg: 'Сигурна и контролирана платформа',
      textEn: 'Every visit is verified through QR code. You have full visibility over redeemed discounts and real statistics.',
      textBg: 'Всяко посещение се верифицира чрез QR код. Имате пълна видимост над използваните отстъпки и реални статистики.'
    }
  ];

  const steps = [
    {
      titleEn: 'Apply online',
      titleBg: 'Кандидатствате онлайн',
      textEn: 'Fill out a short form and our team will contact you within 24 hours.',
      textBg: 'Попълвате кратка форма, екипът се свързва с вас до 24 часа.'
    },
    {
      titleEn: 'Set up your profile',
      titleBg: 'Настройвате профила си',
      textEn: 'Set clear discounts and prepare for launch. Our team helps with every step.',
      textBg: 'Задавате ясни отстъпки и се подготвяте за старт. Нашият екип помага на всяка стъпка.'
    },
    {
      titleEn: 'Welcome customers',
      titleBg: 'Приемате клиенти',
      textEn: 'Customers scan a QR code and you get real visits. Simple and transparent.',
      textBg: 'Клиентите сканират QR код и вие получавате реални посещения. Просто и прозрачно.'
    }
  ];

  // Cities filter removed - locations now shown as showcase

  const getCategoryBg = (loc: Location) => {
    const map: Record<string, string> = {
      '1': 'Ресторант', '2': 'СПА и фитнес', '3': 'Плажен клуб',
      '4': 'Ски курорт', '5': 'Галерия и кафе', '6': 'Мол и развлечения',
    };
    return map[loc.id] || 'Бизнес';
  };

  const getCategoryEn = (loc: Location) => {
    const map: Record<string, string> = {
      '1': 'Restaurant', '2': 'Spa & Fitness', '3': 'Beach Club',
      '4': 'Ski Resort', '5': 'Gallery & Cafe', '6': 'Mall & Entertainment',
    };
    return map[loc.id] || 'Business';
  };

  const validateField = (field: string, value: any): string | undefined => {
    switch (field) {
      case 'firstName':
        if (!value) return t('partnerRegistration.firstNameRequired');
        if (value.length < 2) return t('partnerRegistration.firstNameMinLength');
        return undefined;

      case 'lastName':
        if (!value) return t('partnerRegistration.lastNameRequired');
        if (value.length < 2) return t('partnerRegistration.lastNameMinLength');
        return undefined;

      case 'email': {
        if (!value) return t('partnerRegistration.emailRequired');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) return t('partnerRegistration.emailInvalid');
        return undefined;
      }

      case 'phone':
        if (!value) return t('partnerRegistration.phoneRequired');
        if (!/^(\+359|0)[0-9\s-]{8,}$/.test(value)) {
          return t('partnerRegistration.phoneInvalid');
        }
        return undefined;

      case 'password':
        if (!value) return t('partnerRegistration.passwordRequired');
        if (value.length < 6) return t('partnerRegistration.passwordMinLength');
        return undefined;

      case 'confirmPassword':
        if (!value) return t('partnerRegistration.confirmPasswordRequired');
        if (value !== formData.password) return t('partnerRegistration.passwordsMismatch');
        return undefined;

      case 'businessName':
        if (!value) return t('partnerRegistration.businessNameRequired');
        if (value.length < 3) return t('partnerRegistration.businessNameMinLength');
        return undefined;

      case 'businessCategory':
        if (!value) return t('partnerRegistration.businessCategoryRequired');
        return undefined;

      case 'acceptTerms':
        if (!value) return t('partnerRegistration.acceptTermsRequired');
        return undefined;

      case 'confirmBusiness':
        if (!value) return t('partnerRegistration.confirmBusinessRequired');
        return undefined;

      default:
        return undefined;
    }
  };

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const value = formData[field as keyof typeof formData];
    const error = validateField(field, value);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    const newValue = type === 'checkbox' ? checked : value;

    setFormData(prev => ({ ...prev, [name]: newValue }));

    // Real-time validation for touched fields
    if (touched[name]) {
      const error = validateField(name, newValue);
      setErrors(prev => ({ ...prev, [name]: error }));
    }

    // Also validate confirmPassword when password changes
    if (name === 'password' && touched.confirmPassword) {
      const confirmError = formData.confirmPassword !== value
        ? t('partnerRegistration.passwordsMismatch')
        : undefined;
      setErrors(prev => ({ ...prev, confirmPassword: confirmError }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: FormErrors = {};
    const requiredFields = [
      'firstName', 'lastName', 'email', 'phone',
      'password', 'confirmPassword', 'businessName',
      'businessCategory', 'acceptTerms', 'confirmBusiness'
    ];

    requiredFields.forEach(field => {
      const error = validateField(field, formData[field as keyof typeof formData]);
      if (error) newErrors[field as keyof FormErrors] = error;
    });

    setErrors(newErrors);

    const newTouched: Record<string, boolean> = {};
    requiredFields.forEach(field => {
      newTouched[field] = true;
    });
    setTouched(newTouched);

    // If there are errors, don't submit
    if (Object.keys(newErrors).length > 0) {
      return;
    }

    try {
      await register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: formData.phone,
        acceptTerms: formData.acceptTerms,
        accountType: 'partner',
        businessInfo: {
          businessName: formData.businessName,
          businessNameBg: formData.businessNameBg || undefined,
          businessCategory: formData.businessCategory,
          taxId: formData.taxId || undefined,
          website: formData.website || undefined,
        },
      });

      // Redirect to dashboard after successful registration
      navigate('/dashboard', { replace: true });
    } catch (error) {
      // Error is handled by the AuthContext with toast
      console.error('Registration error:', error);
    }
  };

  return (
    <PageContainer>
      <Hero>
        <Container>
          <HeroContent>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Title>
                {t('partners.title')}
              </Title>
              <Subtitle>
                {t('partners.subtitle')}
              </Subtitle>
              <HeroButtons>
                <a href="#application" style={{ textDecoration: 'none' }}>
                  <Button variant="golden" size="large">
                    {t('partners.applyNow')}
                  </Button>
                </a>
                <MicroTrust>{t('partners.microTrust')}</MicroTrust>
              </HeroButtons>
            </motion.div>
          </HeroContent>
        </Container>
      </Hero>

      <StatsSection>
        <Container>
          <StatsGrid>
            <StatCard>
              <StatNumber>300+</StatNumber>
              <StatLabel>{t('partners.partnersCount')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>5 000+</StatNumber>
              <StatLabel>{t('partners.activeUsers')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>100 000+</StatNumber>
              <StatLabel>{t('partners.redeemedOffers')}</StatLabel>
            </StatCard>
            <StatCard>
              <StatNumber>95%</StatNumber>
              <StatLabel>{t('partners.satisfactionRate')}</StatLabel>
            </StatCard>
          </StatsGrid>
        </Container>
      </StatsSection>

      <Section ref={benefitsRef}>
        <Container>
          <SectionTitle>
            {t('partners.whyBoomCard')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.benefitsSubtitle')}
          </SectionSubtitle>

          <BenefitsGrid>
            {benefits.map((benefit, index) => (
              <BenefitCard
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={benefitsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card>
                  <BenefitImageContainer $imageUrl={benefit.icon} />
                  <BenefitContent>
                    <BenefitTitle>
                      {language === 'bg' ? benefit.titleBg : benefit.titleEn}
                    </BenefitTitle>
                    <BenefitText>
                      {language === 'bg' ? benefit.textBg : benefit.textEn}
                    </BenefitText>
                  </BenefitContent>
                </Card>
              </BenefitCard>
            ))}
          </BenefitsGrid>
        </Container>
      </Section>

      <ProcessSection ref={processRef}>
        <Container>
          <SectionTitle>
            {t('partners.howItWorks')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.stepsSubtitle')}
          </SectionSubtitle>

          <ProcessSteps>
            {steps.map((step, index) => (
              <ProcessStep
                key={index}
                initial={{ opacity: 0, x: -30 }}
                animate={processInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.2 }}
              >
                <StepNumber>{index + 1}</StepNumber>
                <StepContent>
                  <StepTitle>
                    {language === 'bg' ? step.titleBg : step.titleEn}
                  </StepTitle>
                  <StepText>
                    {language === 'bg' ? step.textBg : step.textEn}
                  </StepText>
                </StepContent>
              </ProcessStep>
            ))}
          </ProcessSteps>
        </Container>
      </ProcessSection>

      <LocationsSection id="locations">
        <Container>
          <SectionTitle>
            {t('partners.locationsTitle')}
          </SectionTitle>
          <SectionSubtitle>
            {t('partners.locationsSubtitle')}
          </SectionSubtitle>

          <LocationsGrid>
            {mockLocations.map((loc, index) => (
              <LocationCard
                key={loc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <LocationImage $bgImage={loc.imageUrl} />

                <LocationContent>
                  <LocationName>{loc.name}</LocationName>
                  <LocationAddress>
                    {loc.city} &middot; {language === 'bg' ? getCategoryBg(loc) : getCategoryEn(loc)}
                  </LocationAddress>
                </LocationContent>
              </LocationCard>
            ))}
          </LocationsGrid>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <Link to="/venues" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="large">
                {t('partners.viewBoomPlaces')}
              </Button>
            </Link>
          </div>
        </Container>
      </LocationsSection>

      <CTASection id="application">
        <Container>
          <CTATitle>
            {t('partners.readyToStart')}
          </CTATitle>
          <CTAText>
            {t('partners.ctaText')}
          </CTAText>

          <FormSection as="form" onSubmit={handleSubmit}>
            <FormTitle>
              {t('partners.partnershipApplication')}
            </FormTitle>
            <FormGrid>
              {/* Personal Information */}
              <FormSubSection>
                <FormSubTitle>
                  👤 {t('partnerRegistration.personalInfo')}
                </FormSubTitle>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="firstName">
                      {t('partnerRegistration.firstName')} *
                    </Label>
                    <Input
                      id="firstName"
                      type="text"
                      name="firstName"
                      value={formData.firstName}
                      onChange={handleChange}
                      onBlur={() => handleBlur('firstName')}
                      placeholder={t('partnerRegistration.firstNamePlaceholder')}
                      $hasError={touched.firstName && !!errors.firstName}
                      disabled={isLoading}
                      autoComplete="given-name"
                    />
                    {touched.firstName && errors.firstName && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.firstName}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label htmlFor="lastName">
                      {t('partnerRegistration.lastName')} *
                    </Label>
                    <Input
                      id="lastName"
                      type="text"
                      name="lastName"
                      value={formData.lastName}
                      onChange={handleChange}
                      onBlur={() => handleBlur('lastName')}
                      placeholder={t('partnerRegistration.lastNamePlaceholder')}
                      $hasError={touched.lastName && !!errors.lastName}
                      disabled={isLoading}
                      autoComplete="family-name"
                    />
                    {touched.lastName && errors.lastName && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.lastName}
                      </ErrorMessage>
                    )}
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="email">
                      {t('partnerRegistration.email')} *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={() => handleBlur('email')}
                      placeholder={t('partnerRegistration.emailPlaceholder')}
                      $hasError={touched.email && !!errors.email}
                      disabled={isLoading}
                      autoComplete="email"
                    />
                    {touched.email && errors.email && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.email}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label htmlFor="phone">
                      {t('partnerRegistration.phone')} *
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleChange}
                      onBlur={() => handleBlur('phone')}
                      placeholder={t('partnerRegistration.phonePlaceholder')}
                      $hasError={touched.phone && !!errors.phone}
                      disabled={isLoading}
                      autoComplete="tel"
                    />
                    {touched.phone && errors.phone && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.phone}
                      </ErrorMessage>
                    )}
                  </FormGroup>
                </FormRow>
              </FormSubSection>

              {/* Business Information */}
              <FormSubSection>
                <FormSubTitle>
                  🏢 {t('partnerRegistration.businessInfo')}
                </FormSubTitle>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="businessName">
                      {t('partnerRegistration.businessName')} *
                    </Label>
                    <Input
                      id="businessName"
                      type="text"
                      name="businessName"
                      value={formData.businessName}
                      onChange={handleChange}
                      onBlur={() => handleBlur('businessName')}
                      placeholder={t('partnerRegistration.businessNamePlaceholder')}
                      $hasError={touched.businessName && !!errors.businessName}
                      disabled={isLoading}
                    />
                    {touched.businessName && errors.businessName && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.businessName}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label htmlFor="businessNameBg">
                      {t('partnerRegistration.businessNameBg')}
                    </Label>
                    <Input
                      id="businessNameBg"
                      type="text"
                      name="businessNameBg"
                      value={formData.businessNameBg}
                      onChange={handleChange}
                      placeholder={t('partnerRegistration.businessNameBgPlaceholder')}
                      disabled={isLoading}
                    />
                  </FormGroup>
                </FormRow>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="businessCategory">
                      {t('partnerRegistration.businessCategory')} *
                    </Label>
                    <Select
                      id="businessCategory"
                      name="businessCategory"
                      value={formData.businessCategory}
                      onChange={handleChange}
                      onBlur={() => handleBlur('businessCategory')}
                      $hasError={touched.businessCategory && !!errors.businessCategory}
                      disabled={isLoading}
                    >
                      {categories.map(cat => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </Select>
                    {touched.businessCategory && errors.businessCategory && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.businessCategory}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label htmlFor="taxId">
                      {t('partnerRegistration.taxId')}
                    </Label>
                    <Input
                      id="taxId"
                      type="text"
                      name="taxId"
                      value={formData.taxId}
                      onChange={handleChange}
                      placeholder={t('partnerRegistration.taxIdPlaceholder')}
                      disabled={isLoading}
                    />
                  </FormGroup>
                </FormRow>

                <FormGroup>
                  <Label htmlFor="website">
                    {t('partnerRegistration.website')}
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder={t('partnerRegistration.websitePlaceholder')}
                    disabled={isLoading}
                  />
                </FormGroup>
              </FormSubSection>

              {/* Security */}
              <FormSubSection>
                <FormSubTitle>
                  🔒 {t('partnerRegistration.security')}
                </FormSubTitle>

                <FormRow>
                  <FormGroup>
                    <Label htmlFor="password">
                      {t('partnerRegistration.password')} *
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      onBlur={() => handleBlur('password')}
                      placeholder={t('partnerRegistration.passwordPlaceholder')}
                      $hasError={touched.password && !!errors.password}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    {touched.password && errors.password && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.password}
                      </ErrorMessage>
                    )}
                  </FormGroup>

                  <FormGroup>
                    <Label htmlFor="confirmPassword">
                      {t('partnerRegistration.confirmPassword')} *
                    </Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      onBlur={() => handleBlur('confirmPassword')}
                      placeholder={t('partnerRegistration.confirmPasswordPlaceholder')}
                      $hasError={touched.confirmPassword && !!errors.confirmPassword}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    {touched.confirmPassword && errors.confirmPassword && (
                      <ErrorMessage
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                      >
                        {errors.confirmPassword}
                      </ErrorMessage>
                    )}
                  </FormGroup>
                </FormRow>
              </FormSubSection>

              <div>
                <CheckboxGroup>
                  <Checkbox
                    id="acceptTerms"
                    type="checkbox"
                    name="acceptTerms"
                    checked={formData.acceptTerms}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                  <CheckboxLabel
                    htmlFor="acceptTerms"
                    $hasError={touched.acceptTerms && !!errors.acceptTerms}
                  >
                    {t('partnerRegistration.acceptTerms')} <Link to="/terms">{t('partnerRegistration.termsAndConditions')}</Link> {t('partnerRegistration.and')} <Link to="/privacy">{t('partnerRegistration.privacyPolicy')}</Link>
                  </CheckboxLabel>
                </CheckboxGroup>
                {touched.acceptTerms && errors.acceptTerms && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.acceptTerms}
                  </ErrorMessage>
                )}
              </div>

              <div>
                <CheckboxGroup>
                  <Checkbox
                    id="confirmBusiness"
                    type="checkbox"
                    name="confirmBusiness"
                    checked={formData.confirmBusiness}
                    onChange={handleChange}
                    disabled={isLoading}
                  />
                  <CheckboxLabel
                    htmlFor="confirmBusiness"
                    $hasError={touched.confirmBusiness && !!errors.confirmBusiness}
                  >
                    {t('partnerRegistration.confirmBusiness')}
                  </CheckboxLabel>
                </CheckboxGroup>
                {touched.confirmBusiness && errors.confirmBusiness && (
                  <ErrorMessage
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    {errors.confirmBusiness}
                  </ErrorMessage>
                )}
              </div>

              <InfoBox>
                <strong>📋 {t('partnerRegistration.note')}</strong> {t('partnerRegistration.noteText')}
              </InfoBox>

              <GradientButton
                type="submit"
                disabled={isLoading}
              >
                {isLoading
                  ? (language === 'bg' ? 'Изпращане...' : 'Submitting...')
                  : t('partnerRegistration.createPartnerAccount')}
              </GradientButton>
              <FormMicroTrust>
                {t('partners.formMicroTrust')}
              </FormMicroTrust>
            </FormGrid>
          </FormSection>

          <ContactFallback>
            <ContactQuestion>{t('partners.contactQuestion')}</ContactQuestion>
            <Link to="/contact" style={{ textDecoration: 'none' }}>
              <Button variant="outline" size="large">
                {t('partners.contactUs')}
              </Button>
            </Link>
          </ContactFallback>
        </Container>
      </CTASection>
    </PageContainer>
  );
};

export default PartnersPage;
