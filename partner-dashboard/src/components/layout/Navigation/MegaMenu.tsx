import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { MenuItem } from '../../../types/navigation';

interface MegaMenuProps {
  items: MenuItem[];
  language?: 'en' | 'bg';
  autoExpandOnMobile?: boolean;
}

const NavWrapper = styled.nav`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  @media (max-width: 1024px) {
    flex-direction: column;
    align-items: stretch;
    gap: 0;
  }
`;

const NavItem = styled.div`
  position: relative;
`;

const NavLink = styled(Link)<{ $hasChildren?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--color-text-primary);
  text-decoration: none;
  border-radius: 0.5rem;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background-color: var(--color-background-secondary);
    color: var(--color-primary);
  }

  @media (max-width: 1024px) {
    padding: 1rem;
    border-radius: 0;
    border-bottom: 1px solid var(--color-border);
  }
`;

const ChevronIcon = styled.svg<{ $isOpen?: boolean }>`
  width: 1rem;
  height: 1rem;
  transition: transform 200ms;
  transform: rotate(${props => props.$isOpen ? '180deg' : '0deg'});
`;

const DropdownContainer = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  min-width: 280px;
  max-width: 400px;
  background: #ffffff;
  border-radius: 1rem;
  box-shadow:
    0 20px 60px -15px rgba(0, 0, 0, 0.3),
    0 10px 25px -5px rgba(0, 0, 0, 0.2);
  padding: 0.75rem;
  z-index: 1000;
  margin-top: 0.75rem;
  overflow: hidden;
  border: 2px solid #e5e7eb;

  /* Light mode with gradient */
  background: linear-gradient(to bottom, #ffffff 0%, #f9fafb 100%);

  /* Dark mode */
  [data-theme="dark"] & {
    background: linear-gradient(to bottom, #1e293b 0%, #0f172a 100%);
    border-color: #334155;
    box-shadow:
      0 20px 60px -15px rgba(0, 0, 0, 0.6),
      0 10px 25px -5px rgba(0, 0, 0, 0.4);
  }

  /* Color mode - vibrant explosive gradient */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 50%, #e8f4ff 100%);
    border: 3px solid transparent;
    border-image: linear-gradient(135deg, #ff4500, #ff006e, #00d4ff) 1;
    border-radius: 1rem;
    box-shadow:
      0 20px 60px -15px rgba(255, 69, 0, 0.4),
      0 15px 40px -5px rgba(255, 0, 110, 0.3),
      0 10px 30px -5px rgba(0, 212, 255, 0.2);
  }

  /* Ensure dropdown stays within viewport */
  @media (min-width: 1024px) {
    max-width: min(400px, calc(100vw - 2rem));
  }

  @media (max-width: 1024px) {
    position: static;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    margin-top: 0;
    background: #f9fafb;
    border: none;

    [data-theme="dark"] & {
      background: #1e293b;
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 100%);
    }
  }
`;

const MegaDropdownContainer = styled(motion.div)<{ $alignRight?: boolean }>`
  position: absolute;
  top: 100%;
  ${props => props.$alignRight ? 'right: 0;' : 'left: 0;'}
  width: 750px;
  max-width: calc(100vw - 4rem);
  background: #ffffff;
  border-radius: 1rem;
  box-shadow:
    0 25px 70px -15px rgba(0, 0, 0, 0.35),
    0 15px 30px -5px rgba(0, 0, 0, 0.25);
  padding: 2rem;
  z-index: 1000;
  margin-top: 0.75rem;
  overflow: hidden;
  border: 2px solid #e5e7eb;

  /* Light mode with gradient */
  background: linear-gradient(to bottom, #ffffff 0%, #f8f9fa 100%);

  /* Dark mode */
  [data-theme="dark"] & {
    background: linear-gradient(to bottom, #1e293b 0%, #0f172a 100%);
    border-color: #334155;
    box-shadow:
      0 25px 70px -15px rgba(0, 0, 0, 0.7),
      0 15px 30px -5px rgba(0, 0, 0, 0.5);
  }

  /* Color mode - vibrant mega menu */
  [data-theme="color"] & {
    background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 30%, #e8f4ff 70%, #fff5e1 100%);
    border: 3px solid transparent;
    border-image: linear-gradient(135deg, #ff4500 0%, #ff006e 30%, #00d4ff 70%, #b24bf3 100%) 1;
    border-radius: 1rem;
    box-shadow:
      0 25px 70px -15px rgba(255, 69, 0, 0.5),
      0 20px 50px -10px rgba(255, 0, 110, 0.4),
      0 15px 40px -5px rgba(0, 212, 255, 0.3);
  }

  @media (max-width: 1400px) {
    width: 650px;
  }

  @media (max-width: 1280px) {
    width: 550px;
    max-width: calc(100vw - 3rem);
    padding: 1.5rem;
  }

  @media (max-width: 1024px) {
    position: static;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    margin-top: 0;
    background: #f9fafb;
    width: 100%;
    max-width: none;
    border: none;

    [data-theme="dark"] & {
      background: #1e293b;
    }

    [data-theme="color"] & {
      background: linear-gradient(135deg, #fff5e1 0%, #ffe4f1 100%);
    }
  }
`;

const MegaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
  max-width: 100%;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    gap: 0;
  }
`;

const DropdownSection = styled.div`
  padding: 0.75rem 0;

  /* Add subtle separation between sections */
  & + & {
    border-left: 1px solid var(--color-border);
    padding-left: 2rem;
  }

  @media (max-width: 1024px) {
    padding: 0;

    & + & {
      border-left: none;
      padding-left: 0;
      border-top: 2px solid var(--color-border);
    }
  }
`;

const SectionTitle = styled.h3`
  font-size: 0.8125rem;
  font-weight: 800;
  color: var(--color-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 1rem;
  padding: 0 0.75rem;
  padding-bottom: 0.625rem;
  border-bottom: 3px solid var(--color-primary);
  position: relative;

  /* Accent line under the border */
  &::after {
    content: '';
    position: absolute;
    bottom: -3px;
    left: 0.75rem;
    width: 50%;
    height: 3px;
    background: var(--color-accent);
  }

  @media (max-width: 1024px) {
    padding: 0.875rem 1rem;
    background: var(--color-background-secondary);
    margin-bottom: 0;
    border-bottom: 3px solid var(--color-primary);

    &::after {
      left: 1rem;
    }
  }
`;

const DropdownLink = styled(Link)`
  display: block;
  padding: 0.75rem 0.875rem;
  font-size: 0.9375rem;
  font-weight: 400;
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: 0.5rem;
  transition: all 250ms cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  letter-spacing: -0.01em;
  line-height: 1.5;

  /* Subtle left border accent on hover */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 0;
    background: var(--color-accent);
    border-radius: 0 2px 2px 0;
    transition: height 250ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Vibrant mode styling */
  [data-theme="color"] & {
    color: #6a0572;
    font-weight: 500;

    &::before {
      background: linear-gradient(180deg, #ff4500 0%, #ff006e 50%, #00d4ff 100%);
    }
  }

  &:hover {
    background-color: var(--color-background-secondary);
    color: var(--color-primary);
    font-weight: 500;
    transform: translateX(4px);
    padding-left: 1rem;

    &::before {
      height: 60%;
    }

    [data-theme="color"] & {
      background: linear-gradient(90deg, rgba(255, 69, 0, 0.1) 0%, rgba(255, 0, 110, 0.1) 100%);
      color: #ff006e;
    }
  }

  @media (max-width: 1024px) {
    border-radius: 0;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }
`;

const SubItemDescription = styled.div`
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
  opacity: 0.7;
  margin-top: 0.125rem;
  line-height: 1.4;
`;

const dropdownVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 }
};

const mobileDropdownVariants = {
  hidden: { height: 0, opacity: 0 },
  visible: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 }
};

const NavMenuItem: React.FC<{
  item: MenuItem;
  language: 'en' | 'bg';
  isMobile: boolean;
  index: number;
  totalItems: number;
  autoExpandOnMobile?: boolean;
}> = ({ item, language, isMobile, index, totalItems, autoExpandOnMobile }) => {
  const [isOpen, setIsOpen] = useState(isMobile && autoExpandOnMobile);
  const [hoveredSubItem, setHoveredSubItem] = useState<string | null>(null);

  const label = language === 'bg' ? item.labelBg : item.label;
  const hasChildren = item.children && item.children.length > 0;
  const isMegaMenu = hasChildren && item.children && item.children.some(child => child.children && child.children.length > 0);

  // Determine if item is on the right side of navigation (last 3 items)
  const isRightSide = index >= totalItems - 3;

  const handleMouseEnter = () => {
    if (!isMobile) setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsOpen(false);
      setHoveredSubItem(null);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (isMobile && hasChildren) {
      e.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  const renderSubMenu = (children: MenuItem[]) => {
    if (isMegaMenu) {
      return (
        <MegaDropdownContainer
          $alignRight={isRightSide}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={isMobile ? mobileDropdownVariants : dropdownVariants}
          transition={{ duration: 0.2 }}
        >
          <MegaGrid>
            {children.map((child) => (
              <DropdownSection key={child.id}>
                <SectionTitle>{language === 'bg' ? child.labelBg : child.label}</SectionTitle>
                {child.children ? (
                  child.children.map((subChild) => (
                    <DropdownLink key={subChild.id} to={subChild.path}>
                      <div>{language === 'bg' ? subChild.labelBg : subChild.label}</div>
                    </DropdownLink>
                  ))
                ) : (
                  <DropdownLink to={child.path}>
                    <div>{language === 'bg' ? child.labelBg : child.label}</div>
                  </DropdownLink>
                )}
              </DropdownSection>
            ))}
          </MegaGrid>
        </MegaDropdownContainer>
      );
    }

    return (
      <DropdownContainer
        initial="hidden"
        animate="visible"
        exit="exit"
        variants={isMobile ? mobileDropdownVariants : dropdownVariants}
        transition={{ duration: 0.2 }}
      >
        {children.map((child) => (
          <div
            key={child.id}
            onMouseEnter={() => !isMobile && setHoveredSubItem(child.id)}
            onMouseLeave={() => !isMobile && setHoveredSubItem(null)}
            style={{ position: 'relative' }}
          >
            <DropdownLink to={child.path}>
              <div>{language === 'bg' ? child.labelBg : child.label}</div>
              {child.children && child.children.length > 0 && (
                <SubItemDescription>
                  {child.children.length} items
                </SubItemDescription>
              )}
            </DropdownLink>

            {/* Third level submenu */}
            {child.children && child.children.length > 0 && hoveredSubItem === child.id && !isMobile && (
              <AnimatePresence>
                <DropdownContainer
                  style={{
                    position: 'absolute',
                    left: '100%',
                    top: 0,
                    marginLeft: '0.5rem',
                    marginTop: 0
                  }}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={dropdownVariants}
                  transition={{ duration: 0.2 }}
                >
                  {child.children.map((subChild) => (
                    <DropdownLink key={subChild.id} to={subChild.path}>
                      {language === 'bg' ? subChild.labelBg : subChild.label}
                    </DropdownLink>
                  ))}
                </DropdownContainer>
              </AnimatePresence>
            )}
          </div>
        ))}
      </DropdownContainer>
    );
  };

  return (
    <NavItem
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <NavLink
        to={item.path}
        onClick={handleClick}
        $hasChildren={hasChildren}
      >
        {label}
        {hasChildren && (
          <ChevronIcon
            $isOpen={isOpen}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </ChevronIcon>
        )}
      </NavLink>

      <AnimatePresence>
        {isOpen && hasChildren && item.children && renderSubMenu(item.children)}
      </AnimatePresence>
    </NavItem>
  );
};

export const MegaMenu: React.FC<MegaMenuProps> = ({ items, language = 'en', autoExpandOnMobile = false }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <NavWrapper>
      {items.map((item, index) => (
        <NavMenuItem
          key={item.id}
          item={item}
          language={language}
          isMobile={isMobile}
          index={index}
          totalItems={items.length}
          autoExpandOnMobile={autoExpandOnMobile}
        />
      ))}
    </NavWrapper>
  );
};

export default MegaMenu;
