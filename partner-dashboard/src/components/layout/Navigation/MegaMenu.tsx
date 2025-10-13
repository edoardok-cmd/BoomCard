import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import styled from 'styled-components';
import { MenuItem } from '../../../types/navigation';

interface MegaMenuProps {
  items: MenuItem[];
  language?: 'en' | 'bg';
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
  color: #1f2937;
  text-decoration: none;
  border-radius: 0.5rem;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    background-color: #f3f4f6;
    color: #000000;
  }

  @media (max-width: 1024px) {
    padding: 1rem;
    border-radius: 0;
    border-bottom: 1px solid #e5e7eb;
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
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1),
              0 2px 8px -2px rgba(0, 0, 0, 0.05);
  padding: 0.5rem;
  z-index: 50;
  margin-top: 0.5rem;

  @media (max-width: 1024px) {
    position: static;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    margin-top: 0;
    background: #f9fafb;
  }
`;

const MegaDropdownContainer = styled(motion.div)`
  position: absolute;
  top: 100%;
  left: 0;
  width: 100vw;
  max-width: 1200px;
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.1),
              0 2px 8px -2px rgba(0, 0, 0, 0.05);
  padding: 2rem;
  z-index: 50;
  margin-top: 0.5rem;
  left: 50%;
  transform: translateX(-50%);

  @media (max-width: 1024px) {
    position: static;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    margin-top: 0;
    background: #f9fafb;
    width: 100%;
    transform: none;
  }
`;

const MegaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;

  @media (max-width: 1024px) {
    grid-template-columns: 1fr;
    gap: 0;
  }
`;

const DropdownSection = styled.div`
  padding: 0.5rem 0;

  @media (max-width: 1024px) {
    padding: 0;
  }
`;

const SectionTitle = styled.h3`
  font-size: 0.875rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.75rem;
  padding: 0 0.75rem;

  @media (max-width: 1024px) {
    padding: 0.75rem 1rem;
    background: #f3f4f6;
    margin-bottom: 0;
  }
`;

const DropdownLink = styled(Link)`
  display: block;
  padding: 0.625rem 0.75rem;
  font-size: 0.9375rem;
  color: #4b5563;
  text-decoration: none;
  border-radius: 0.5rem;
  transition: all 200ms;

  &:hover {
    background-color: #f3f4f6;
    color: #000000;
  }

  @media (max-width: 1024px) {
    border-radius: 0;
    padding: 0.875rem 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
`;

const SubItemDescription = styled.div`
  font-size: 0.8125rem;
  color: #9ca3af;
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
}> = ({ item, language, isMobile }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredSubItem, setHoveredSubItem] = useState<string | null>(null);

  const label = language === 'bg' ? item.labelBg : item.label;
  const hasChildren = item.children && item.children.length > 0;
  const isMegaMenu = hasChildren && item.children && item.children.some(child => child.children && child.children.length > 0);

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

export const MegaMenu: React.FC<MegaMenuProps> = ({ items, language = 'en' }) => {
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
      {items.map((item) => (
        <NavMenuItem
          key={item.id}
          item={item}
          language={language}
          isMobile={isMobile}
        />
      ))}
    </NavWrapper>
  );
};

export default MegaMenu;
