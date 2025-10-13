# BoomCard Platform - Quick Start Guide

## Getting Started

### 1. Installation

```bash
cd partner-dashboard
npm install
```

### 2. Environment Setup

Create a `.env` file:

```env
# API Configuration
REACT_APP_API_URL=https://api.boomcard.bg
REACT_APP_WS_URL=wss://api.boomcard.bg/ws

# POS System Credentials (Examples)
REACT_APP_BARSY_API_KEY=your_barsy_key_here
REACT_APP_POSTER_TOKEN=your_poster_token_here

# Environment
REACT_APP_ENV=development
```

### 3. Run Development Server

```bash
npm run dev
```

Access at: `http://localhost:5173`

---

## Using POS Integrations

### Initialize a POS Connection

```typescript
import { initPOSManager } from './lib/pos/POSManager';
import { POSIntegrationConfig } from './lib/pos/POSManager';

// Initialize manager for your partner
const posManager = initPOSManager('partner-123');

// Configure Barsy integration
const barsyConfig: POSIntegrationConfig = {
  provider: 'barsy',
  enabled: true,
  credentials: {
    apiKey: 'your-api-key',
    merchantId: 'merchant-123',
    environment: 'production',
  },
  webhookUrl: 'https://api.boomcard.bg/webhooks/barsy/partner-123',
};

// Initialize connection
const success = await posManager.initializeIntegration(barsyConfig);

if (success) {
  console.log('Barsy POS connected successfully!');
}
```

### Fetch Transactions

```typescript
// Get transactions from last 7 days
const endDate = new Date();
const startDate = new Date();
startDate.setDate(startDate.getDate() - 7);

const transactions = await posManager.fetchAllTransactions(startDate, endDate);

console.log(`Found ${transactions.length} transactions`);
```

### Apply Discount

```typescript
// Apply 30% BoomCard discount
const transaction = await posManager.applyDiscount(
  'barsy', // provider
  'txn-123', // transaction ID
  30, // discount percentage
  'BC-2024-001234' // BoomCard number
);

console.log(`Discount applied: ${transaction.discountAmount} BGN`);
```

---

## WebSocket Real-Time Updates

### Connect to WebSocket

```typescript
import { initWebSocket } from './lib/websocket/WebSocketService';

// Initialize for your partner
const ws = initWebSocket('partner-123');

// Connect
await ws.connect();

// Subscribe to events
ws.on('transaction.created', (transaction) => {
  console.log('New transaction:', transaction);
  // Update UI, show notification, etc.
});

ws.on('analytics.update', (analytics) => {
  console.log('Analytics updated:', analytics);
  // Refresh dashboard
});

// Send events
ws.send('partner.update', {
  status: 'online',
  lastActivity: Date.now(),
});
```

### Notification Integration

```typescript
import { NotificationCenter } from './components/common/NotificationCenter/NotificationCenter';

// In your main App component
function App() {
  return (
    <>
      <NotificationCenter />
      {/* Rest of your app */}
    </>
  );
}

// Notifications appear automatically when WebSocket events arrive
ws.on('notification.new', (notification) => {
  // NotificationCenter automatically displays these
});
```

---

## Using IntegrationsPage

### Open Integration Modal

```typescript
// Integration page handles this automatically
// Users click "Connect" or "Get Started" buttons

// The modal shows:
// 1. Configuration form with fields
// 2. Connection test button
// 3. Webhook URL (auto-generated)
// 4. Setup instructions
```

### Configuration Fields

For Barsy:
- API Key (password field)
- Merchant ID (text field)
- Environment (dropdown: Production/Sandbox)

For Poster:
- API Token (password field)
- Account Name (text field)

### Testing Connection

The modal includes a "Connect" button that:
1. Shows "Testing connection..." state
2. Makes API call to validate credentials
3. Displays success/error status
4. Auto-closes on success after 1.5s

---

## Scroll Animations

### Basic Usage

```typescript
import { ScrollAnimation } from './components/common/ScrollAnimation/ScrollAnimation';

// Fade in
<ScrollAnimation type="fadeIn" delay={0.2}>
  <YourComponent />
</ScrollAnimation>

// Slide up
<ScrollAnimation type="slideUp" duration={0.8}>
  <YourComponent />
</ScrollAnimation>

// Scale effect
<ScrollAnimation type="scale">
  <YourComponent />
</ScrollAnimation>
```

### Parallax Effect

```typescript
import { ParallaxSection } from './components/common/ScrollAnimation/ScrollAnimation';

<ParallaxSection speed={50}>
  <BackgroundImage />
</ParallaxSection>
```

### Animated Counters

```typescript
import { CountUp } from './components/common/ScrollAnimation/ScrollAnimation';

<CountUp
  end={1247}
  suffix=" BGN"
  decimals={2}
  duration={2}
/>
```

### Staggered Lists

```typescript
import { StaggerChildren } from './components/common/ScrollAnimation/ScrollAnimation';

<StaggerChildren staggerDelay={0.1}>
  {items.map(item => (
    <ItemCard key={item.id} {...item} />
  ))}
</StaggerChildren>
```

---

## QRCode Component

### Basic QR Code

```typescript
import QRCode from './components/common/QRCode/QRCode';

<QRCode
  data="https://boomcard.bg/redeem/BC-2024-001234"
  size={256}
  language="en"
/>
```

### With Logo and Download

```typescript
<QRCode
  data="https://boomcard.bg/redeem/BC-2024-001234"
  size={300}
  logo="/images/boomcard-logo.png"
  downloadable={true}
  title="Scan at Checkout"
  description="Show this QR code to apply your discount"
  language="bg"
/>
```

### In a Modal

```typescript
const [showQR, setShowQR] = useState(false);

<Button onClick={() => setShowQR(true)}>
  Show QR Code
</Button>

<AnimatePresence>
  {showQR && (
    <Modal>
      <QRCode data={cardUrl} size={256} />
    </Modal>
  )}
</AnimatePresence>
```

---

## Analytics Dashboard

### Date Filtering

The analytics page includes pre-built filters:
- Last 7 days
- Last 30 days
- Last 3 months
- Last year

```typescript
const [period, setPeriod] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
```

### Displaying Stats

Stats are automatically calculated and displayed with:
- Icon indicators
- Trend arrows (up/down)
- Percentage changes
- Color coding (green=positive, red=negative)

### Charts

Bar Chart (Savings Over Time):
- Animated bars
- Hover effects
- Day labels
- Auto-scaling

Pie Chart (Savings by Category):
- Animated segments
- Color-coded categories
- Legend with percentages
- Click to highlight

---

## Styling Guide

### Using Styled Components

```typescript
import styled from 'styled-components';

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1rem;
`;

const Card = styled.div`
  background: white;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
`;
```

### Responsive Breakpoints

```typescript
const ResponsiveGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;
```

### WHOOP-Inspired Colors

```typescript
const colors = {
  primary: '#000000',
  secondary: '#667eea',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    // ... etc
  }
};
```

---

## Testing

### Unit Tests

```bash
npm test
```

### Type Checking

```bash
npm run build
```

### Linting

```bash
npm run lint
```

---

## Common Tasks

### Add a New POS Integration

1. Create adapter in `src/lib/pos/YourPOS.ts`
2. Extend `POSAdapter` base class
3. Implement required methods
4. Add to `POSManager.createAdapter()`
5. Add integration data to `IntegrationsPage`

### Add a New Notification Type

1. Add event type to `WebSocketEventType`
2. Subscribe to event in component
3. Display using `NotificationCenter`

### Add a New Language

1. Update `LanguageContext`
2. Add translations to all text objects
3. Update type definitions (`'en' | 'bg' | 'newLang'`)

---

## Troubleshooting

### WebSocket Won't Connect

- Check `REACT_APP_WS_URL` environment variable
- Verify server is running
- Check browser console for errors
- Ensure proper CORS headers

### POS Integration Fails

- Verify credentials are correct
- Check API endpoint URLs
- Test in sandbox mode first
- Review webhook configuration

### Animations Not Working

- Ensure framer-motion is installed
- Check if `prefers-reduced-motion` is set
- Verify component is in viewport

### Build Errors

- Clear node_modules and reinstall
- Check TypeScript version compatibility
- Update dependencies: `npm update`

---

## Production Deployment

### Build for Production

```bash
npm run build
```

### Environment Variables

Set these on your hosting platform:
- `REACT_APP_API_URL`
- `REACT_APP_WS_URL`
- All POS credentials
- Feature flags

### Performance Optimization

- Enable gzip compression
- Set up CDN for static assets
- Configure caching headers
- Enable HTTP/2
- Minimize bundle size

---

## Support

- **Documentation:** [/FEATURES_IMPLEMENTED.md](./FEATURES_IMPLEMENTED.md)
- **Email:** support@boomcard.bg
- **Issues:** Create a GitHub issue

---

## Quick Reference

### Key Files

```
src/
├── lib/
│   ├── pos/
│   │   ├── POSAdapter.ts          # Base adapter
│   │   ├── BarsyPOS.ts            # Barsy integration
│   │   ├── PosterPOS.ts           # Poster integration
│   │   └── POSManager.ts          # Manager class
│   └── websocket/
│       └── WebSocketService.ts    # WebSocket client
├── components/
│   └── common/
│       ├── QRCode/                # QR code generator
│       ├── NotificationCenter/    # Notifications
│       └── ScrollAnimation/       # Scroll effects
└── pages/
    ├── IntegrationsPage.tsx       # POS integrations
    ├── AnalyticsPage.tsx          # Analytics dashboard
    └── DashboardPage.tsx          # Main dashboard
```

### Common Commands

```bash
# Development
npm run dev

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Preview production build
npm run preview
```

---

**Last Updated:** October 13, 2025
