# BoomCard Mobile App

React Native mobile application for iOS and Android with **full web feature parity** and **GPS-based receipt validation** (60-meter radius requirement).

## 🎯 Key Features

### ✅ Implemented (MVP)

1. **Authentication System**
   - User registration and login
   - JWT token management with automatic refresh
   - Secure token storage using Expo SecureStore
   - Profile management

2. **🔴 CRITICAL: GPS Receipt Validation System (60-meter requirement)**
   - High-accuracy GPS coordinate capture
   - Haversine formula for precise distance calculation
   - Real-time location proximity validation
   - 60-meter radius enforcement before submission
   - User feedback with distance from venue
   - Location permission management

3. **Receipt Scanner**
   - Camera integration for receipt photo capture
   - Gallery picker for existing images
   - OCR processing placeholder (ready for Tesseract.js or ML Kit)
   - GPS-validated receipt submission
   - Upload progress tracking
   - Duplicate detection via image hashing

4. **QR Sticker Scanner**
   - QR code scanning at partner venues
   - GPS validation for venue proximity
   - Cashback calculation display
   - Scan history tracking

5. **Digital Card Wallet**
   - Card tier display (Standard/Premium/Platinum)
   - QR code for venue redemption
   - Card benefits overview

6. **Navigation & UI**
   - Bottom tab navigation
   - Stack navigation for auth flow
   - Responsive design for all screen sizes
   - Toast notifications
   - Loading states and error handling

### 🚧 Planned Features

- Venue map with GPS-based discovery
- Offers & promotions browsing
- Loyalty points dashboard
- Receipt analytics
- Payment integration (Stripe)
- Push notifications
- Biometric authentication (Face ID/Touch ID)

## 📁 Project Structure

```
boomcard-mobile/
├── src/
│   ├── api/                    # API client and endpoint handlers
│   │   ├── client.ts           # Axios client with JWT auth
│   │   ├── auth.api.ts         # Authentication endpoints
│   │   ├── receipts.api.ts     # Receipt submission & management
│   │   └── stickers.api.ts     # QR sticker scanning
│   │
│   ├── services/               # Business logic services
│   │   ├── location.service.ts # 🔴 GPS location management (60m validation)
│   │   └── storage.service.ts  # Secure token & data storage
│   │
│   ├── utils/                  # Utility functions
│   │   └── distance.ts         # 🔴 Haversine formula (GPS calculations)
│   │
│   ├── store/                  # State management
│   │   └── AuthContext.tsx     # React Context + React Query
│   │
│   ├── navigation/             # Navigation configuration
│   │   └── AppNavigator.tsx    # Root navigator with auth flow
│   │
│   ├── screens/                # Screen components
│   │   ├── Auth/               # Login, Register
│   │   ├── Dashboard/          # Home dashboard
│   │   ├── Receipts/           # 🔴 Receipt scanner & list
│   │   ├── Stickers/           # QR code scanner
│   │   ├── Card/               # Digital card wallet
│   │   └── Profile/            # User profile
│   │
│   ├── components/             # Reusable components
│   ├── types/                  # TypeScript type definitions
│   └── constants/              # App configuration
│       └── config.ts           # API endpoints, GPS config, etc.
│
├── App.tsx                     # Root component with providers
├── app.json                    # Expo configuration
├── package.json                # Dependencies
└── README.md                   # This file
```

## 🔴 Critical Feature: GPS Receipt Validation

The app enforces a **60-meter radius** requirement for receipt submissions. Users must be physically at the venue to submit receipts.

### Implementation Details

**Files:**
- [src/utils/distance.ts](src/utils/distance.ts) - Haversine formula implementation
- [src/services/location.service.ts](src/services/location.service.ts) - GPS management
- [src/screens/Receipts/ReceiptScannerScreen.tsx](src/screens/Receipts/ReceiptScannerScreen.tsx) - Receipt scanner with validation

**Workflow:**
1. User captures receipt photo
2. App requests high-accuracy GPS location
3. System calculates distance to venue using Haversine formula
4. If distance > 60 meters: **REJECT** with error message
5. If within radius: Allow submission with GPS coordinates
6. Backend validates GPS on server side

**Key Functions:**
```typescript
// Calculate distance between two GPS coordinates
calculateDistance(lat1, lon1, lat2, lon2): number

// Validate if user is within 60m radius
isWithinRadius(userLat, userLon, venueLat, venueLon, radius = 60): boolean

// Complete validation with error messages
validateLocationProximity(userCoords, venueCoords, radius = 60): GPSValidationResult
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator (macOS only) or Android Emulator

### Installation

```bash
# Navigate to mobile app directory
cd boomcard-mobile

# Install dependencies
npm install

# Start development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android
```

### Backend Connection

**Development:**
- Local backend: `http://localhost:3001`
- Configure in [src/constants/config.ts](src/constants/config.ts:9)

**Production:**
- API: `https://api.boomcard.bg`
- Auto-configured when `__DEV__` is false

## 📱 Building for Production

### iOS Build

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure EAS
eas build:configure

# Build for iOS
eas build --platform ios
```

**Requirements:**
- Apple Developer account ($99/year)
- Bundle ID: `bg.boomcard.mobile`

### Android Build

```bash
# Build for Android
eas build --platform android
```

**Requirements:**
- Google Play Console account ($25 one-time)
- Package name: `bg.boomcard.mobile`

## 🔒 Permissions

The app requires the following permissions:

### iOS (Info.plist)
- **NSCameraUsageDescription**: Scan receipts and QR codes
- **NSPhotoLibraryUsageDescription**: Upload receipt images
- **NSLocationWhenInUseUsageDescription**: 🔴 Verify 60m venue proximity
- **NSLocationAlwaysAndWhenInUseUsageDescription**: 🔴 Location verification

### Android (AndroidManifest.xml)
- `CAMERA`: Scan receipts and QR codes
- `ACCESS_FINE_LOCATION`: 🔴 High-accuracy GPS for 60m validation
- `ACCESS_COARSE_LOCATION`: Fallback location
- `READ_EXTERNAL_STORAGE`: Access gallery
- `WRITE_EXTERNAL_STORAGE`: Save images

## 📦 Core Dependencies

### Navigation
- `@react-navigation/native` - Navigation library
- `@react-navigation/stack` - Stack navigator
- `@react-navigation/bottom-tabs` - Tab navigator

### Camera & Scanning
- `expo-camera` - Camera access
- `expo-barcode-scanner` - QR code scanning
- `expo-image-picker` - Gallery picker

### GPS & Location (🔴 Critical for 60m validation)
- `expo-location` - GPS coordinate capture

### Storage & Security
- `expo-secure-store` - Encrypted token storage
- `expo-local-authentication` - Biometric auth (planned)

### API & State
- `axios` - HTTP client
- `@tanstack/react-query` - API state management

### Forms & Validation
- `react-hook-form` - Form handling
- `zod` - Schema validation

### UI Components
- `react-native-paper` - Material Design components
- `react-native-toast-message` - Toast notifications
- `react-native-qrcode-svg` - QR code generation

### Charts & Analytics
- `react-native-chart-kit` - Charts for analytics
- `react-native-svg` - SVG rendering

### Payments
- `@stripe/stripe-react-native` - Stripe integration (planned)

### Maps
- `react-native-maps` - Venue maps (planned)

## 🔧 Configuration

### API Endpoints

Edit [src/constants/config.ts](src/constants/config.ts):

```typescript
export const API_CONFIG = {
  BASE_URL: __DEV__
    ? 'http://localhost:3001'
    : 'https://api.boomcard.bg',
  ENDPOINTS: {
    AUTH: { /* ... */ },
    RECEIPTS: { /* ... */ },
    STICKERS: { /* ... */ },
    // ...
  },
};
```

### GPS Configuration

```typescript
export const GPS_CONFIG = {
  MAX_RADIUS_METERS: 60, // 🔴 Critical: 60-meter requirement
  HIGH_ACCURACY: {
    accuracy: 5, // Expo Location.Accuracy.Highest
  },
};
```

## 🧪 Testing

### GPS Validation Testing

To test the 60-meter radius enforcement:

1. **Simulator Testing:**
   - iOS: Use Xcode location simulation
   - Android: Use Android Studio location spoofing

2. **Real Device Testing:**
   - Required for accurate GPS testing
   - Test at actual partner venues
   - Verify distance calculations

3. **Test Cases:**
   ```typescript
   // Within radius (should pass)
   validateLocationProximity(
     { latitude: 42.6977, longitude: 23.3219 },
     { latitude: 42.6978, longitude: 23.3220 },
     60
   ); // distance ~15m → PASS

   // Outside radius (should fail)
   validateLocationProximity(
     { latitude: 42.6977, longitude: 23.3219 },
     { latitude: 42.6987, longitude: 23.3240 },
     60
   ); // distance ~150m → FAIL
   ```

## 📊 API Integration

### Authentication Flow

```typescript
// Login
const response = await AuthApi.login({
  email: 'user@example.com',
  password: 'password123',
});

// Auto-stored: JWT tokens + user data
// Auto-refreshed: Access token on 401 errors
```

### Receipt Submission Flow

```typescript
// 1. Capture GPS location
const location = await LocationService.getCurrentLocation(true);

// 2. Validate proximity (60m radius) 🔴
const validation = await LocationService.validateProximityToVenue(
  venueLatitude,
  venueLongitude,
  60
);

if (!validation.isValid) {
  // Show error: "You must be within 60m of the venue"
  return;
}

// 3. Upload image
const upload = await ReceiptsApi.uploadReceiptImage(imageUri);

// 4. Submit receipt with GPS
const receipt = await ReceiptsApi.submitReceipt({
  merchantName,
  totalAmount,
  latitude: location.latitude,
  longitude: location.longitude,
  venueId,
});
```

## 🔐 Security

### Token Management
- JWT access tokens (short-lived)
- Refresh tokens (long-lived)
- Automatic token refresh on 401
- Secure storage with encryption

### GPS Validation
- Client-side validation (UX feedback)
- Server-side validation (security)
- High-accuracy GPS required
- Fraud detection on backend

### API Security
- Bearer token authentication
- HTTPS only in production
- Request timeout: 30 seconds
- Retry logic: 2 attempts

## 📈 Performance

- **Bundle Size:** TBD (after first build)
- **Startup Time:** < 2 seconds (target)
- **GPS Accuracy:** ≤5 meters (high accuracy mode)
- **Image Upload:** Compressed to 80% quality
- **API Caching:** 5 minutes (React Query)

## 🐛 Known Issues

1. **OCR Processing:** Placeholder implementation
   - TODO: Integrate Tesseract.js or ML Kit
   - Current: Manual input required

2. **Offline Support:** Limited
   - TODO: Implement offline queue for uploads
   - Current: Requires internet connection

3. **Biometric Auth:** Not implemented
   - TODO: Add Face ID / Touch ID support
   - Current: Password-only authentication

## 🗺 Roadmap

### Phase 1: MVP ✅ (Current)
- [x] Authentication system
- [x] GPS receipt validation (60m)
- [x] Receipt scanner with camera
- [x] QR sticker scanner
- [x] Digital card wallet
- [x] Basic navigation

### Phase 2: Core Features
- [ ] OCR integration (Tesseract.js or ML Kit)
- [ ] Venue map with GPS discovery
- [ ] Receipts list with filters
- [ ] Loyalty dashboard
- [ ] Offers browsing

### Phase 3: Advanced Features
- [ ] Stripe payment integration
- [ ] Push notifications
- [ ] Biometric authentication
- [ ] Offline support
- [ ] Receipt analytics

### Phase 4: Optimization
- [ ] Performance optimization
- [ ] Bundle size reduction
- [ ] Automated testing
- [ ] App Store submission

## 📞 Support

For issues or questions:
- Email: support@boomcard.bg
- GitHub: [Repository Issues](https://github.com/boomcard/mobile/issues)

## 📄 License

Proprietary - BoomCard © 2024

---

**Built with ❤️ using React Native + Expo**

**Critical Feature:** 🔴 GPS-based receipt validation (60-meter radius enforcement)
