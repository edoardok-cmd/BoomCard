import { useState, useEffect, useRef, ImgHTMLAttributes } from 'react';
import styled from 'styled-components';

interface LazyImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  alt: string;
  placeholder?: string;
  threshold?: number;
  rootMargin?: string;
  onLoad?: () => void;
  onError?: () => void;
  aspectRatio?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
}

const ImageContainer = styled.div<{ $aspectRatio?: string }>`
  position: relative;
  width: 100%;
  ${({ $aspectRatio }) =>
    $aspectRatio &&
    `
    aspect-ratio: ${$aspectRatio};
    overflow: hidden;
  `}
`;

const StyledImage = styled.img<{
  $isLoaded: boolean;
  $objectFit?: string;
}>`
  width: 100%;
  height: 100%;
  object-fit: ${({ $objectFit }) => $objectFit || 'cover'};
  transition: opacity 0.3s ease-in-out;
  opacity: ${({ $isLoaded }) => ($isLoaded ? 1 : 0)};
`;

const Placeholder = styled.div<{ $src?: string }>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: ${({ $src }) =>
    $src ? `url(${$src}) center/cover` : 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)'};
  background-size: ${({ $src }) => ($src ? 'cover' : '200% 100%')};
  animation: ${({ $src }) => ($src ? 'none' : 'loading 1.5s ease-in-out infinite')};

  @keyframes loading {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  placeholder,
  threshold = 0.1,
  rootMargin = '50px',
  onLoad,
  onError,
  aspectRatio,
  objectFit = 'cover',
  className,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setError(true);
    onError?.();
  };

  return (
    <ImageContainer ref={containerRef} $aspectRatio={aspectRatio} className={className}>
      {!isLoaded && !error && <Placeholder $src={placeholder} />}

      {isInView && (
        <StyledImage
          ref={imgRef}
          src={error ? placeholder || '/placeholder.png' : src}
          alt={alt}
          $isLoaded={isLoaded}
          $objectFit={objectFit}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          {...props}
        />
      )}
    </ImageContainer>
  );
};

export default LazyImage;
