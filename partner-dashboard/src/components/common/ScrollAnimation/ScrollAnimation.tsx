import React, { useRef } from 'react';
import { motion, useScroll, useTransform, useSpring, useInView } from 'framer-motion';

interface ScrollAnimationProps {
  children: React.ReactNode;
  className?: string;
  type?: 'fadeIn' | 'slideUp' | 'slideLeft' | 'slideRight' | 'scale' | 'parallax';
  delay?: number;
  duration?: number;
}

/**
 * WHOOP-inspired scroll animations
 * Smooth, performant animations triggered on scroll
 */
export const ScrollAnimation: React.FC<ScrollAnimationProps> = ({
  children,
  className,
  type = 'fadeIn',
  delay = 0,
  duration = 0.6,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const variants = {
    fadeIn: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    },
    slideUp: {
      hidden: { opacity: 0, y: 60 },
      visible: { opacity: 1, y: 0 },
    },
    slideLeft: {
      hidden: { opacity: 0, x: 60 },
      visible: { opacity: 1, x: 0 },
    },
    slideRight: {
      hidden: { opacity: 0, x: -60 },
      visible: { opacity: 1, x: 0 },
    },
    scale: {
      hidden: { opacity: 0, scale: 0.8 },
      visible: { opacity: 1, scale: 1 },
    },
    parallax: {
      hidden: { opacity: 0, y: 40 },
      visible: { opacity: 1, y: 0 },
    },
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={variants[type]}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.1, 0.25, 1], // Smooth cubic-bezier easing
      }}
    >
      {children}
    </motion.div>
  );
};

interface ParallaxSectionProps {
  children: React.ReactNode;
  speed?: number;
  className?: string;
}

/**
 * Parallax scrolling effect inspired by WHOOP
 */
export const ParallaxSection: React.FC<ParallaxSectionProps> = ({
  children,
  speed = 50,
  className,
}) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [-speed, speed]);
  const smoothY = useSpring(y, { stiffness: 100, damping: 30 });

  return (
    <motion.div ref={ref} style={{ y: smoothY }} className={className}>
      {children}
    </motion.div>
  );
};

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  threshold?: number;
}

/**
 * Reveals content progressively as user scrolls
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className,
  threshold = 0.5,
}) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, threshold, 1], [0, 1, 1]);
  const scale = useTransform(scrollYProgress, [0, threshold], [0.8, 1]);

  return (
    <motion.div ref={ref} style={{ opacity, scale }} className={className}>
      {children}
    </motion.div>
  );
};

interface CountUpProps {
  end: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

/**
 * Animated counter that counts up when in view
 */
export const CountUp: React.FC<CountUpProps> = ({
  end,
  duration = 2,
  prefix = '',
  suffix = '',
  decimals = 0,
  className,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  const countRef = useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!isInView || !countRef.current) return;

    const startTime = Date.now();
    const endTime = startTime + duration * 1000;

    const updateCount = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / (endTime - startTime), 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      const current = easeOutQuart * end;

      if (countRef.current) {
        countRef.current.textContent = `${prefix}${current.toFixed(decimals)}${suffix}`;
      }

      if (progress < 1) {
        requestAnimationFrame(updateCount);
      }
    };

    updateCount();
  }, [isInView, end, duration, prefix, suffix, decimals]);

  return (
    <span ref={ref} className={className}>
      <span ref={countRef}>
        {prefix}0{suffix}
      </span>
    </span>
  );
};

interface StaggerChildrenProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}

/**
 * Staggers animation of children elements
 */
export const StaggerChildren: React.FC<StaggerChildrenProps> = ({
  children,
  staggerDelay = 0.1,
  className,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={{
        visible: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
    >
      {React.Children.map(children, (child) => (
        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
};

export default ScrollAnimation;
