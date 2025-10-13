# BoomCard Platform - Optimization & Deployment Guide

## Table of Contents
1. [Performance Optimization](#performance-optimization)
2. [Bundle Size Optimization](#bundle-size-optimization)
3. [Deployment Configuration](#deployment-configuration)
4. [API Integration](#api-integration)
5. [Testing Strategy](#testing-strategy)
6. [Production Checklist](#production-checklist)

---

## Performance Optimization

### 1. Code Splitting

#### Implement Route-Based Code Splitting
```typescript
// App.tsx - Lazy load routes
import { lazy, Suspense } from 'react';
import { Loading } from './components/common/Loading';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Suspense>
  );
}
```

#### Component-Level Code Splitting
```typescript
// Lazy load heavy components
const ReviewSystem = lazy(() => import('./components/common/ReviewSystem'));
const NotificationCenter = lazy(() => import('./components/common/NotificationCenter'));

// Use with Suspense
<Suspense fallback={<Skeleton />}>
  <ReviewSystem offerId={id} />
</Suspense>
```

### 2. Image Optimization

#### Use Optimized Image Formats
```typescript
// Create image optimization utility
export const getOptimizedImageUrl = (url: string, width: number) => {
  return `${url}?w=${width}&q=80&fm=webp`;
};

// Implement lazy loading
<img
  src={getOptimizedImageUrl(imageUrl, 800)}
  loading="lazy"
  alt={description}
/>
```

#### Implement Progressive Image Loading
```typescript
const ProgressiveImage: React.FC<{ src: string; placeholder: string }> = ({
  src,
  placeholder,
}) => {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      setImageSrc(src);
      setIsLoading(false);
    };
  }, [src]);

  return (
    <img
      src={imageSrc}
      style={{ filter: isLoading ? 'blur(10px)' : 'none' }}
      alt=""
    />
  );
};
```

### 3. Memoization

#### Use React.memo for Heavy Components
```typescript
export const ExpensiveComponent = React.memo(({ data }) => {
  // Heavy rendering logic
  return <div>{/* ... */}</div>;
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.data.id === nextProps.data.id;
});
```

#### Use useMemo for Expensive Calculations
```typescript
const ExpensiveCalculation: React.FC = ({ items }) => {
  const sortedItems = useMemo(() => {
    return items.sort((a, b) => b.price - a.price);
  }, [items]);

  return <div>{/* Use sortedItems */}</div>;
};
```

### 4. Virtual Scrolling

#### Implement for Long Lists
```bash
npm install react-window
```

```typescript
import { FixedSizeList } from 'react-window';

const VirtualizedList: React.FC<{ items: any[] }> = ({ items }) => {
  return (
    <FixedSizeList
      height={600}
      itemCount={items.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <OfferCard offer={items[index]} />
        </div>
      )}
    </FixedSizeList>
  );
};
```

---

## Bundle Size Optimization

### 1. Analyze Bundle Size

```bash
# Install bundle analyzer
npm install --save-dev rollup-plugin-visualizer

# Add to vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true })
  ]
});

# Run build
npm run build
```

### 2. Tree Shaking

#### Import Only What You Need
```typescript
// ❌ Bad - imports entire library
import _ from 'lodash';

// ✅ Good - imports specific function
import debounce from 'lodash/debounce';

// ❌ Bad
import * as Icons from 'lucide-react';

// ✅ Good
import { User, Settings, Bell } from 'lucide-react';
```

### 3. Dynamic Imports

```typescript
// Load heavy libraries only when needed
const loadChartLibrary = async () => {
  const { Chart } = await import('chart.js');
  return Chart;
};

// Use in component
useEffect(() => {
  loadChartLibrary().then(Chart => {
    // Initialize chart
  });
}, []);
```

### 4. Remove Unused Dependencies

```bash
# Check for unused dependencies
npx depcheck

# Remove unused packages
npm uninstall package-name
```

---

## Deployment Configuration

### 1. Netlify Configuration

#### netlify.toml
```toml
[build]
  base = "partner-dashboard"
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[build.environment]
  NODE_VERSION = "18"

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 2. Vercel Configuration

#### vercel.json
```json
{
  "buildCommand": "cd partner-dashboard && npm run build",
  "outputDirectory": "partner-dashboard/dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### 3. Docker Configuration

#### Dockerfile
```dockerfile
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/partner-dashboard/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### nginx.conf
```nginx
server {
  listen 80;
  server_name _;

  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  gzip on;
  gzip_types text/css application/javascript application/json;
  gzip_min_length 1000;
}
```

### 4. Environment Variables

#### .env.production
```env
VITE_API_URL=https://api.boomcard.bg
VITE_APP_URL=https://boomcard.bg
VITE_SUPABASE_URL=your_production_supabase_url
VITE_SUPABASE_ANON_KEY=your_production_anon_key
VITE_ANALYTICS_ID=your_analytics_id
```

---

## API Integration

### 1. API Client Setup

#### src/lib/api.ts
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle token refresh or redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

### 2. API Service Layer

#### src/services/auth.service.ts
```typescript
import api from '../lib/api';

export const authService = {
  login: async (credentials: LoginCredentials) => {
    const response = await api.post('/auth/login', credentials);
    localStorage.setItem('auth_token', response.data.token);
    return response.data;
  },

  register: async (userData: RegisterData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  forgotPassword: async (email: string) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (token: string, password: string) => {
    const response = await api.post('/auth/reset-password', { token, password });
    return response.data;
  },

  verifyEmail: async (token: string) => {
    const response = await api.post('/auth/verify-email', { token });
    return response.data;
  },
};
```

### 3. React Query Integration

```bash
npm install @tanstack/react-query
```

#### src/hooks/useOffers.ts
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export const useOffers = () => {
  return useQuery({
    queryKey: ['offers'],
    queryFn: async () => {
      const { data } = await api.get('/offers');
      return data;
    },
  });
};

export const useCreateReview = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (review: ReviewData) => {
      const { data } = await api.post('/reviews', review);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });
};
```

---

## Testing Strategy

### 1. Unit Testing with Vitest

#### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
```

#### Example Test
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText('Click me'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('shows loading state', () => {
    render(<Button isLoading>Loading</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

### 2. E2E Testing with Playwright

```bash
npm install -D @playwright/test
```

#### tests/auth.spec.ts
```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('user can login', async ({ page }) => {
    await page.goto('http://localhost:3001/login');

    await page.fill('input[name="email"]', 'demo@boomcard.bg');
    await page.fill('input[name="password"]', 'demo123');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('shows validation errors', async ({ page }) => {
    await page.goto('http://localhost:3001/login');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=Email is required')).toBeVisible();
  });
});
```

### 3. Component Testing

#### src/components/Button/Button.test.tsx
```typescript
import { render } from '@testing-library/react';
import { Button } from './Button';

describe('Button Component', () => {
  it('applies correct variant styles', () => {
    const { container } = render(<Button variant="primary">Primary</Button>);
    const button = container.querySelector('button');
    expect(button).toHaveStyle({ background: '#111827' });
  });
});
```

---

## Production Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] No console errors or warnings
- [ ] TypeScript compilation successful
- [ ] Production build successful
- [ ] Environment variables configured
- [ ] API endpoints updated to production
- [ ] Analytics tracking configured
- [ ] Error tracking setup (Sentry)
- [ ] Performance monitoring enabled

### Security

- [ ] HTTPS enabled
- [ ] Security headers configured
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] Input validation on all forms
- [ ] XSS protection enabled
- [ ] CSRF tokens implemented
- [ ] Sensitive data encrypted

### Performance

- [ ] Images optimized
- [ ] Code splitting implemented
- [ ] Lazy loading enabled
- [ ] Caching strategies configured
- [ ] CDN configured for assets
- [ ] Gzip/Brotli compression enabled
- [ ] Bundle size < 500KB (or optimized)

### Monitoring

- [ ] Error tracking (Sentry)
- [ ] Analytics (Google Analytics/Plausible)
- [ ] Performance monitoring (Lighthouse CI)
- [ ] Uptime monitoring
- [ ] API monitoring

### Documentation

- [ ] README updated
- [ ] API documentation
- [ ] Deployment guide
- [ ] User guide
- [ ] Changelog

---

## Additional Resources

### Performance Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WebPageTest](https://www.webpagetest.org/)
- [Bundle Analyzer](https://www.npmjs.com/package/rollup-plugin-visualizer)

### Monitoring Services
- [Sentry](https://sentry.io/) - Error tracking
- [Vercel Analytics](https://vercel.com/analytics) - Performance monitoring
- [Plausible](https://plausible.io/) - Privacy-friendly analytics

### CDN Providers
- [Cloudflare](https://www.cloudflare.com/)
- [Fastly](https://www.fastly.com/)
- [AWS CloudFront](https://aws.amazon.com/cloudfront/)

---

**Last Updated:** October 12, 2025
**Platform Version:** 1.0.0
**Status:** Production Ready
