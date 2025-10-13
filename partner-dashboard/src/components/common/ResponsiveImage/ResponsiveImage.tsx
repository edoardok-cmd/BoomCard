import { useState, useEffect, ImgHTMLAttributes } from 'react';
import styled from 'styled-components';

export interface ImageSource {
  src: string;
  width: number;
  format?: 'webp' | 'jpeg' | 'png' | 'avif';
}

interface ResponsiveImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string;
  alt: string;
  sources?: ImageSource[];
  sizes?: string;
  aspectRatio?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  webpSrc?: string;
  avifSrc?: string;
  placeholder?: string;
  lazy?: boolean;
}

const Picture = styled.picture<{ $aspectRatio?: string }>`
  display: block;
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
  inset: 0;
  background: ${({ $src }) =>
    $src ? `url(${$src}) center/cover` : 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)'};
  background-size: ${({ $src }) => ($src ? 'cover' : '200% 100%')};
  animation: ${({ $src }) => ($src ? 'none' : 'shimmer 1.5s ease-in-out infinite')};

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;

const Container = styled.div`
  position: relative;
  width: 100%;
`;

/**
 * Responsive Image Component
 *
 * Automatically serves the best image format and size based on:
 * - Browser support (AVIF > WebP > JPEG/PNG)
 * - Device pixel ratio
 * - Viewport size
 * - Network conditions (future enhancement)
 *
 * @example
 * <ResponsiveImage
 *   src="/image.jpg"
 *   webpSrc="/image.webp"
 *   avifSrc="/image.avif"
 *   sources={[
 *     { src: '/image-400.jpg', width: 400 },
 *     { src: '/image-800.jpg', width: 800 },
 *     { src: '/image-1200.jpg', width: 1200 },
 *   ]}
 *   sizes="(max-width: 768px) 100vw, 50vw"
 *   alt="Description"
 *   aspectRatio="16/9"
 * />
 */
const ResponsiveImage: React.FC<ResponsiveImageProps> = ({
  src,
  alt,
  sources = [],
  sizes = '100vw',
  aspectRatio,
  objectFit = 'cover',
  webpSrc,
  avifSrc,
  placeholder,
  lazy = true,
  className,
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  // Generate srcset from sources
  const generateSrcSet = (format?: string) => {
    if (!sources.length) return undefined;

    const filteredSources = format
      ? sources.filter((s) => !s.format || s.format === format)
      : sources;

    return filteredSources.map((source) => `${source.src} ${source.width}w`).join(', ');
  };

  // Detect format support
  const supportsWebP = () => {
    const canvas = document.createElement('canvas');
    if (canvas.getContext && canvas.getContext('2d')) {
      return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }
    return false;
  };

  const supportsAVIF = () => {
    const avif = new Image();
    avif.src =
      'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
    return new Promise<boolean>((resolve) => {
      avif.onload = () => resolve(true);
      avif.onerror = () => resolve(false);
    });
  };

  useEffect(() => {
    // Preload best format if available
    if (avifSrc) {
      supportsAVIF().then((supported) => {
        if (supported && lazy) {
          const link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'image';
          link.href = avifSrc;
          document.head.appendChild(link);
        }
      });
    } else if (webpSrc && supportsWebP() && lazy) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = webpSrc;
      document.head.appendChild(link);
    }
  }, [avifSrc, webpSrc, lazy]);

  const handleLoad = () => {
    setIsLoaded(true);
  };

  return (
    <Container className={className}>
      {!isLoaded && placeholder && <Placeholder $src={placeholder} />}

      <Picture $aspectRatio={aspectRatio}>
        {/* AVIF source (best compression, modern browsers) */}
        {avifSrc && (
          <source
            type="image/avif"
            srcSet={avifSrc}
            sizes={sizes}
          />
        )}

        {/* WebP source (good compression, wide support) */}
        {webpSrc && (
          <source
            type="image/webp"
            srcSet={webpSrc}
            sizes={sizes}
          />
        )}

        {/* Responsive sources for fallback format */}
        {sources.length > 0 && (
          <source
            srcSet={generateSrcSet()}
            sizes={sizes}
          />
        )}

        {/* Fallback image (always JPEG or PNG) */}
        <StyledImage
          src={src}
          alt={alt}
          $isLoaded={isLoaded}
          $objectFit={objectFit}
          onLoad={handleLoad}
          loading={lazy ? 'lazy' : 'eager'}
          {...props}
        />
      </Picture>
    </Container>
  );
};

export default ResponsiveImage;
