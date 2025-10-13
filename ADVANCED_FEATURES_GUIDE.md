# Advanced Features Guide

Complete guide for the advanced features implemented in BoomCard Partner Dashboard:
- Analytics Tracking
- Booking/Reservation System
- Enhanced Authentication with Token Refresh

**Created:** October 13, 2025

---

## Table of Contents

1. [Analytics System](#analytics-system)
2. [Booking/Reservation System](#bookingreservation-system)
3. [Enhanced Authentication](#enhanced-authentication)
4. [Implementation Examples](#implementation-examples)
5. [Best Practices](#best-practices)

---

## Analytics System

### Overview

Comprehensive analytics tracking system supporting:
- Google Analytics 4 (GA4) integration
- Custom backend analytics
- User behavior tracking
- Conversion tracking
- Performance monitoring (Core Web Vitals)
- A/B testing support

### Files Created

1. **`src/services/analytics.service.ts`** - Complete analytics service
2. **`src/hooks/useAnalytics.ts`** - React hooks for analytics

### Key Features

✅ Automatic page view tracking
✅ Custom event tracking
✅ Conversion tracking
✅ Search tracking
✅ Error tracking
✅ Performance metrics (LCP, FID, CLS)
✅ Scroll depth tracking
✅ Session tracking
✅ A/B testing support
✅ Event batching and queuing

### Setup

#### 1. Configure Environment Variables

```bash
# .env
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_API_BASE_URL=https://api.boomcard.com
```

#### 2. Initialize Analytics in App

```typescript
// App.tsx
import { usePageTracking } from './hooks/useAnalytics';

function App() {
  // Automatically track all page views
  usePageTracking();

  return (
    <Router>
      {/* Your routes */}
    </Router>
  );
}
```

### Usage Examples

#### Track Page Views (Automatic)

```typescript
import { usePageTracking } from './hooks/useAnalytics';

function App() {
  usePageTracking(); // That's it!
  return <YourApp />;
}
```

#### Track Custom Events

```typescript
import { useTrackEvent } from './hooks/useAnalytics';

function MyComponent() {
  const trackEvent = useTrackEvent();

  const handleClick = () => {
    trackEvent('click', 'button_subscribe', 1, {
      plan: 'premium',
      price: 29.99
    });
  };

  return <button onClick={handleClick}>Subscribe</button>;
}
```

#### Track Button Clicks

```typescript
import { useTrackClick } from './hooks/useAnalytics';

function MyButton() {
  const handleClick = useTrackClick('cta_button', () => {
    console.log('Button clicked!');
  });

  return <button onClick={handleClick}>Click Me</button>;
}
```

#### Track Element Visibility

```typescript
import { useTrackVisibility } from './hooks/useAnalytics';

function ProductCard({ product }) {
  const ref = useTrackVisibility(`product_${product.id}_view`, 0.5);

  return (
    <div ref={ref}>
      {/* Product content */}
    </div>
  );
}
```

#### Track Search

```typescript
import { useTrackSearch } from './hooks/useAnalytics';

function SearchBar() {
  const trackSearch = useTrackSearch();

  const handleSearch = (query: string, results: any[]) => {
    trackSearch(query, results.length, {
      category: 'restaurants',
      city: 'Sofia'
    });
  };

  return <SearchInput onSearch={handleSearch} />;
}
```

#### Track Offer Views (Automatic)

```typescript
import { useTrackOfferView } from './hooks/useAnalytics';

function OfferDetailPage() {
  const { data: offer } = useOffer(offerId);

  // Automatically tracks when offer is viewed
  useTrackOfferView(offer?.id, offer?.title);

  return <OfferDetails offer={offer} />;
}
```

#### Track Conversions

```typescript
import { useTrackOfferRedemption } from './hooks/useAnalytics';

function RedeemButton({ offerId, value }) {
  const trackRedemption = useTrackOfferRedemption();

  const handleRedeem = async () => {
    await redeemOffer(offerId);
    trackRedemption(offerId, value);
  };

  return <button onClick={handleRedeem}>Redeem</button>;
}
```

#### Track Form Interactions

```typescript
import { useTrackForm } from './hooks/useAnalytics';

function ContactForm() {
  const { trackFormStart, trackFormSubmit, trackFieldFocus } = useTrackForm('contact');

  useEffect(() => {
    trackFormStart();
  }, []);

  const handleSubmit = async (data) => {
    try {
      await submitForm(data);
      trackFormSubmit(true);
    } catch (error) {
      trackFormSubmit(false, error.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input onFocus={() => trackFieldFocus('email')} />
      {/* More fields */}
    </form>
  );
}
```

#### Track Media Interactions

```typescript
import { useTrackMedia } from './hooks/useAnalytics';

function VideoPlayer({ videoId }) {
  const { trackPlay, trackPause, trackComplete, trackProgress } = useTrackMedia('video', videoId);

  return (
    <video
      onPlay={trackPlay}
      onPause={trackPause}
      onEnded={trackComplete}
      onTimeUpdate={(e) => {
        const percent = (e.currentTarget.currentTime / e.currentTarget.duration) * 100;
        trackProgress(percent);
      }}
    />
  );
}
```

#### A/B Testing

```typescript
import { useABTest } from './hooks/useAnalytics';

function PricingPage() {
  const { variant, trackConversion } = useABTest('pricing_layout', ['layout_a', 'layout_b']);

  const handlePurchase = () => {
    trackConversion();
    // Complete purchase...
  };

  return variant === 'layout_a' ? <LayoutA /> : <LayoutB />;
}
```

#### Get Analytics Data

```typescript
import { usePartnerAnalytics } from './hooks/useAnalytics';

function AnalyticsDashboard({ partnerId }) {
  const { data, isLoading } = usePartnerAnalytics(
    partnerId,
    '2025-01-01',
    '2025-10-13'
  );

  if (isLoading) return <Loading />;

  return (
    <div>
      <h2>Total Views: {data.totalViews}</h2>
      <h2>Conversion Rate: {data.conversionRate}%</h2>
      <h2>Revenue: ${data.revenue}</h2>
    </div>
  );
}
```

---

## Booking/Reservation System

### Overview

Complete booking and reservation management system supporting:
- Restaurant reservations
- Hotel bookings
- Spa appointments
- Experience bookings
- Event tickets
- Activity reservations

### Files Created

1. **`src/services/bookings.service.ts`** - Complete bookings service
2. **`src/hooks/useBookings.ts`** - React Query hooks for bookings

### Key Features

✅ Availability checking
✅ Real-time booking creation
✅ Booking management (confirm, cancel, reschedule)
✅ Guest management
✅ Special requests
✅ Promo code support
✅ QR code generation
✅ Email confirmations & reminders
✅ Cancellation policies
✅ Booking statistics
✅ Calendar view
✅ Price calculation

### Usage Examples

#### Check Availability

```typescript
import { useAvailability } from './hooks/useBookings';

function BookingForm({ venueId, offerId }) {
  const [date, setDate] = useState('2025-10-15');
  const [guests, setGuests] = useState(2);

  const { data: availability, isLoading } = useAvailability(
    venueId,
    date,
    guests,
    offerId
  );

  if (isLoading) return <Loading />;

  return (
    <div>
      <h3>Available Times</h3>
      {availability.slots.map(slot => (
        <button
          key={slot.time}
          disabled={!slot.available}
        >
          {slot.time} - ${slot.price}
        </button>
      ))}
    </div>
  );
}
```

#### Create Booking

```typescript
import { useCreateBooking } from './hooks/useBookings';

function BookingCheckout() {
  const createBooking = useCreateBooking();

  const handleSubmit = async (data) => {
    try {
      const booking = await createBooking.mutateAsync({
        type: 'restaurant',
        venueId: 'venue-123',
        offerId: 'offer-456',
        date: '2025-10-15',
        time: '19:00',
        guestCount: 2,
        guests: [
          {
            name: 'John Doe',
            email: 'john@example.com',
            phone: '+359888123456',
          }
        ],
        specialRequests: 'Window seat preferred',
      });

      console.log('Booking created:', booking.bookingNumber);
    } catch (error) {
      console.error('Booking failed:', error);
    }
  };

  return <CheckoutForm onSubmit={handleSubmit} />;
}
```

#### View User Bookings

```typescript
import { useUserBookings } from './hooks/useBookings';

function MyBookings({ userId }) {
  const { data, isLoading } = useUserBookings(userId, {
    status: 'confirmed',
    page: 1,
    limit: 10,
  });

  if (isLoading) return <Loading />;

  return (
    <div>
      {data.data.map(booking => (
        <BookingCard key={booking.id} booking={booking} />
      ))}
    </div>
  );
}
```

#### Cancel Booking

```typescript
import { useCancelBooking } from './hooks/useBookings';

function BookingActions({ bookingId }) {
  const cancelBooking = useCancelBooking();

  const handleCancel = async () => {
    const confirmed = confirm('Are you sure you want to cancel?');
    if (confirmed) {
      await cancelBooking.mutateAsync({
        id: bookingId,
        reason: 'Changed plans',
      });
    }
  };

  return <button onClick={handleCancel}>Cancel Booking</button>;
}
```

#### Reschedule Booking

```typescript
import { useRescheduleBooking } from './hooks/useBookings';

function RescheduleForm({ bookingId }) {
  const reschedule = useRescheduleBooking();

  const handleReschedule = async (newDate, newTime) => {
    await reschedule.mutateAsync({
      id: bookingId,
      date: newDate,
      time: newTime,
    });
  };

  return (
    <DateTimePicker
      onSelect={(date, time) => handleReschedule(date, time)}
    />
  );
}
```

#### Venue Booking Calendar

```typescript
import { useBookingCalendar } from './hooks/useBookings';

function VenueCalendar({ venueId }) {
  const { data: calendar } = useBookingCalendar(
    venueId,
    '2025-10-01',
    '2025-10-31'
  );

  return (
    <Calendar>
      {Object.entries(calendar).map(([date, bookings]) => (
        <Day key={date} date={date}>
          {bookings.length} bookings
        </Day>
      ))}
    </Calendar>
  );
}
```

#### Booking Statistics

```typescript
import { useVenueBookingStatistics } from './hooks/useBookings';

function BookingStats({ venueId }) {
  const { data: stats } = useVenueBookingStatistics(
    venueId,
    '2025-01-01',
    '2025-10-13'
  );

  return (
    <div>
      <Stat label="Total Bookings" value={stats.total} />
      <Stat label="Confirmed" value={stats.confirmed} />
      <Stat label="Cancelled" value={stats.cancelled} />
      <Stat label="Revenue" value={`$${stats.totalRevenue}`} />
      <Stat label="Cancellation Rate" value={`${stats.cancellationRate}%`} />
    </div>
  );
}
```

#### QR Code for Booking

```typescript
import { useBookingQRCode } from './hooks/useBookings';

function BookingConfirmation({ bookingId }) {
  const { data: qrCode, isLoading } = useBookingQRCode(bookingId);

  if (isLoading) return <Loading />;

  return (
    <div>
      <h2>Your Booking QR Code</h2>
      <img src={qrCode} alt="Booking QR Code" />
      <p>Show this at the venue</p>
    </div>
  );
}
```

#### Verify Booking with QR

```typescript
import { useVerifyBookingQR } from './hooks/useBookings';

function QRScanner() {
  const verifyBooking = useVerifyBookingQR();

  const handleScan = async (qrCode) => {
    try {
      const booking = await verifyBooking.mutateAsync(qrCode);
      console.log('Booking verified:', booking);
    } catch (error) {
      alert('Invalid QR code');
    }
  };

  return <QRCodeScanner onScan={handleScan} />;
}
```

---

## Enhanced Authentication

### Overview

Enhanced API service with:
- Automatic token refresh
- Request queuing during refresh
- Proper error handling
- Environment variable configuration

### Files Modified

1. **`src/services/api.service.ts`** - Enhanced with token refresh

### Key Features

✅ Automatic token refresh on 401 errors
✅ Request queuing during refresh
✅ Proper logout on refresh failure
✅ Environment variable configuration
✅ PATCH method support
✅ Enhanced error handling
✅ Token management methods

### Configuration

```bash
# .env
VITE_API_BASE_URL=https://api.boomcard.com
VITE_API_TIMEOUT=30000
```

### How It Works

1. **Initial Request Fails with 401**
   - Service detects expired token
   - Pauses all new requests
   - Attempts to refresh token

2. **Token Refresh**
   - Calls `/auth/refresh` endpoint
   - Gets new access and refresh tokens
   - Stores new tokens
   - Updates authorization header

3. **Retry Failed Requests**
   - Retries original request with new token
   - Processes all queued requests
   - Continues normal operation

4. **Refresh Failure**
   - Clears all tokens
   - Redirects to login page
   - Shows appropriate error message

### Backend Requirements

Your backend must provide a refresh endpoint:

```typescript
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}

Response:
{
  "accessToken": "new-access-token",
  "refreshToken": "new-refresh-token"
}
```

### Usage

The token refresh is **completely automatic**. Just use the API service as normal:

```typescript
import { apiService } from './services/api.service';

// This will automatically refresh token if expired
const data = await apiService.get('/venues');
```

### Manual Token Management

```typescript
import { apiService } from './services/api.service';

// Set token after login
apiService.setAuthToken(token);

// Clear token on logout
apiService.clearAuthToken();

// Get current token
const token = apiService.getAuthToken();
```

---

## Implementation Examples

### Complete Authentication Flow

```typescript
// LoginPage.tsx
import { apiService } from './services/api.service';
import analyticsService from './services/analytics.service';

function LoginPage() {
  const handleLogin = async (email, password) => {
    try {
      const response = await apiService.post('/auth/login', {
        email,
        password,
      });

      // Store tokens
      localStorage.setItem('token', response.accessToken);
      localStorage.setItem('refreshToken', response.refreshToken);
      apiService.setAuthToken(response.accessToken);

      // Set user ID for analytics
      analyticsService.setUserId(response.user.id);

      // Track login
      analyticsService.trackConversion({
        type: 'signup',
        value: 0,
      });

      // Redirect to dashboard
      navigate('/dashboard');
    } catch (error) {
      toast.error('Login failed');
    }
  };

  return <LoginForm onSubmit={handleLogin} />;
}
```

### Complete Booking Flow with Analytics

```typescript
function BookingFlow({ venueId, offerId }) {
  const [step, setStep] = useState(1);
  const createBooking = useCreateBooking();
  const trackConversion = useTrackConversion();
  const trackEvent = useTrackEvent();

  useEffect(() => {
    trackEvent('view', 'booking_started', undefined, { venueId, offerId });
  }, []);

  const handleComplete = async (bookingData) => {
    try {
      const booking = await createBooking.mutateAsync(bookingData);

      // Track conversion
      trackConversion({
        type: 'booking',
        value: booking.finalPrice,
        venueId,
        offerId,
      });

      // Track completion
      trackEvent('submit', 'booking_completed', booking.finalPrice, {
        bookingId: booking.id,
        venueId,
        offerId,
      });

      navigate(`/bookings/${booking.id}`);
    } catch (error) {
      trackEvent('submit', 'booking_failed', undefined, {
        error: error.message,
        venueId,
        offerId,
      });
    }
  };

  return (
    <BookingWizard
      step={step}
      onStepChange={(newStep) => {
        setStep(newStep);
        trackEvent('click', `booking_step_${newStep}`, newStep);
      }}
      onComplete={handleComplete}
    />
  );
}
```

---

## Best Practices

### Analytics

1. **Page Tracking**
   - Add `usePageTracking()` once in your main App component
   - Don't call it in multiple places

2. **Event Naming**
   - Use consistent naming conventions
   - Group related events with prefixes
   - Example: `form_start_contact`, `form_submit_contact`

3. **Privacy**
   - Don't track sensitive personal information
   - Respect user privacy settings
   - Implement opt-out functionality

4. **Performance**
   - Events are automatically batched
   - Don't worry about too many events
   - The service handles queuing and flushing

### Bookings

1. **Availability Checking**
   - Always check availability before showing booking form
   - Refresh availability periodically
   - Show real-time availability

2. **Error Handling**
   - Handle booking conflicts gracefully
   - Show clear error messages
   - Provide alternative dates/times

3. **Confirmations**
   - Always send confirmation emails
   - Generate QR codes for check-in
   - Send reminders before booking date

4. **Cancellation Policy**
   - Display policy clearly before booking
   - Calculate refunds accurately
   - Process cancellations promptly

### Authentication

1. **Token Storage**
   - Store refresh token securely
   - Never expose tokens in URL
   - Clear tokens on logout

2. **Error Handling**
   - Handle 401 errors gracefully
   - Show appropriate login prompts
   - Don't expose error details

3. **Security**
   - Use HTTPS only
   - Implement CSRF protection
   - Validate tokens on backend

---

## Environment Variables

Complete list of environment variables:

```bash
# API Configuration
VITE_API_BASE_URL=https://api.boomcard.com
VITE_API_TIMEOUT=30000

# Analytics
VITE_GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# Feature Flags (optional)
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_BOOKINGS=true
```

---

## Backend API Requirements

### Authentication Endpoints

```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
```

### Analytics Endpoints

```
POST   /api/analytics/events
GET    /api/analytics/metrics
GET    /api/analytics/partners/:id
GET    /api/analytics/offers/:id
GET    /api/analytics/venues/:id
GET    /api/analytics/export
```

### Booking Endpoints

```
GET    /api/bookings
POST   /api/bookings
GET    /api/bookings/:id
PUT    /api/bookings/:id
POST   /api/bookings/:id/confirm
POST   /api/bookings/:id/cancel
POST   /api/bookings/:id/reschedule
GET    /api/bookings/availability
GET    /api/bookings/calendar
GET    /api/bookings/statistics
GET    /api/bookings/:id/qr-code
POST   /api/bookings/verify-qr
```

---

## Testing

### Analytics Testing

```typescript
// Test event tracking
it('should track button click', () => {
  const trackEvent = jest.fn();
  render(<MyButton trackEvent={trackEvent} />);

  fireEvent.click(screen.getByText('Click Me'));

  expect(trackEvent).toHaveBeenCalledWith(
    'click',
    'button_label',
    1,
    expect.any(Object)
  );
});
```

### Booking Testing

```typescript
// Test booking creation
it('should create booking', async () => {
  const { mutateAsync } = useCreateBooking();

  const booking = await mutateAsync({
    type: 'restaurant',
    venueId: 'venue-123',
    // ... more data
  });

  expect(booking).toHaveProperty('id');
  expect(booking.status).toBe('pending');
});
```

---

## Troubleshooting

### Analytics Not Tracking

1. Check GA4 Measurement ID in .env
2. Check browser console for errors
3. Verify network requests to Google Analytics
4. Check ad blockers aren't blocking requests

### Token Refresh Failing

1. Check refresh token is stored
2. Verify backend refresh endpoint works
3. Check token expiration times
4. Verify CORS configuration

### Bookings Not Creating

1. Check availability first
2. Verify all required fields
3. Check backend validation rules
4. Verify user authentication

---

## Summary

You now have:
- ✅ Complete analytics tracking system
- ✅ Full booking/reservation system
- ✅ Enhanced authentication with token refresh
- ✅ Production-ready implementations
- ✅ Comprehensive documentation

All systems are integrated and ready to use! 🚀
