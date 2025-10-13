import React, { useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Facebook, Twitter, Linkedin, Mail, Link as LinkIcon, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const ShareContainer = styled.div`
  position: relative;
  display: inline-block;
`;

const ShareButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: #667eea;
    color: #667eea;
    background: #f9fafb;
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ShareMenu = styled(motion.div)`
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  padding: 0.5rem;
  min-width: 250px;
  z-index: 1000;

  @media (max-width: 640px) {
    right: auto;
    left: 50%;
    transform: translateX(-50%);
  }
`;

const ShareTitle = styled.div`
  padding: 0.75rem 1rem 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`;

const ShareOption = styled.button<{ $color: string }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  border-radius: 0.5rem;
  font-size: 0.95rem;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 20px;
    height: 20px;
    color: ${props => props.$color};
  }

  &:hover {
    background: ${props => props.$color}10;
    color: ${props => props.$color};
  }
`;

const Divider = styled.div`
  height: 1px;
  background: #e5e7eb;
  margin: 0.5rem 0;
`;

const CopyLinkButton = styled(ShareOption)<{ $copied: boolean }>`
  background: ${props => props.$copied ? '#10b98110' : 'transparent'};
  color: ${props => props.$copied ? '#10b981' : '#374151'};

  svg {
    color: ${props => props.$copied ? '#10b981' : props.$color};
  }
`;

interface ShareButtonProps {
  url: string;
  title: string;
  description?: string;
  className?: string;
  buttonText?: string;
}

export const SocialShareButton: React.FC<ShareButtonProps> = ({
  url,
  title,
  description = '',
  className,
  buttonText = 'Share',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareOptions = [
    {
      name: 'Facebook',
      icon: Facebook,
      color: '#1877F2',
      getUrl: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    },
    {
      name: 'Twitter',
      icon: Twitter,
      color: '#1DA1F2',
      getUrl: () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      color: '#0A66C2',
      getUrl: () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    },
    {
      name: 'Email',
      icon: Mail,
      color: '#EA4335',
      getUrl: () => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description + '\n\n' + url)}`,
    },
  ];

  const handleShare = (getUrl: () => string) => {
    const shareUrl = getUrl();
    window.open(shareUrl, '_blank', 'width=600,height=400');
    setIsOpen(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard!');
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy link');
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
        setIsOpen(false);
      } catch (error) {
        // User cancelled or error occurred
        console.error('Share failed:', error);
      }
    } else {
      setIsOpen(!isOpen);
    }
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('[data-share-container]')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <ShareContainer className={className} data-share-container>
      <ShareButton onClick={handleNativeShare}>
        <Share2 />
        {buttonText}
      </ShareButton>

      <AnimatePresence>
        {isOpen && (
          <ShareMenu
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <ShareTitle>Share via</ShareTitle>

            {shareOptions.map((option) => (
              <ShareOption
                key={option.name}
                $color={option.color}
                onClick={() => handleShare(option.getUrl)}
              >
                <option.icon />
                {option.name}
              </ShareOption>
            ))}

            <Divider />

            <CopyLinkButton
              $color="#6b7280"
              $copied={copied}
              onClick={handleCopyLink}
            >
              {copied ? <Check /> : <LinkIcon />}
              {copied ? 'Copied!' : 'Copy Link'}
            </CopyLinkButton>
          </ShareMenu>
        )}
      </AnimatePresence>
    </ShareContainer>
  );
};

export default SocialShareButton;
