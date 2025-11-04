# BoomCard Mobile App - Testing Guide

This guide provides instructions for testing the mobile app implementation completed as part of DEVELOPER_C_MOBILE_APP.md.

## Prerequisites

### 1. Backend API Running
```bash
cd backend-api
npm install
npm run dev
```

Backend should be running on `http://localhost:3001`

### 2. Mobile App Setup
```bash
cd boomcard-mobile
npm install
```

### 3. Stripe Test Credentials

The app is configured with Stripe test keys:
- **Publishable Key**: `pk_test_51SPa5NFFte7x2hqqQrZJf25fX8yHIfZOrO7vvc11LFvWcPoDGonM0ggtIp2c3QVJCC2z0QqnMSlnf0RbqDT8pMqu00gDH6DuZc`

---

## Phase 1: Payment Screens Testing

### Task 1.2: Stripe Provider Integration ✓
**Test**: Verify Stripe is initialized
```bash
# Run the app
npm start
# Select iOS simulator or Android emulator
```

**Expected**: App launches without Stripe-related errors

---

### Task 1.3 & 1.4: Wallet Screen
**Navigation**: Dashboard → Wallet (add navigation button if needed)

**Test Cases**:
1. **Load Wallet Data**
   - Open Wallet screen
   - Verify balance displays (0.00 BGN for new users)
   - Verify pending balance shows if > 0
   - Verify statistics display (Total Cashback, Total Spent)

2. **Recent Transactions**
   - Verify "No transactions yet" shows for new users
   - Verify transaction list displays after making transactions
   - Verify transaction icons and colors are correct

3. **Pull to Refresh**
   - Pull down to refresh
   - Verify loading indicator shows
   - Verify data reloads

**Expected API Calls**:
- `GET /api/payments/wallet/balance`
- `GET /api/payments/wallet/transactions?limit=10`
- `GET /api/payments/wallet/statistics`

---

### Task 1.5: Top Up Screen
**Navigation**: Wallet → Top Up FAB button

**Test Cases**:
1. **Preset Amounts**
   - Tap preset amount buttons (10, 20, 50, 100, 200 BGN)
   - Verify amount field updates

2. **Custom Amount**
   - Enter custom amount (e.g., 25.50)
   - Test minimum validation (< 5 BGN should show error)
   - Test maximum validation (> 10,000 BGN should show error)

3. **Card Input**
   - Enter test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., 12/25)
   - CVC: Any 3 digits (e.g., 123)
   - Verify card validation works

4. **Payment Processing**
   - Enter valid amount and card details
   - Tap "Pay" button
   - Verify loading state shows
   - Verify success alert appears
   - Verify navigation back to Wallet
   - Verify balance updated

**Test Cards**:
- ✅ Success: `4242 4242 4242 4242`
- ❌ Declined: `4000 0000 0000 0002`
- 🔐 3D Secure: `4000 0025 0000 3155`

**Expected API Calls**:
- `POST /api/payments/wallet/topup` - Body: `{ amount: 50 }`
- Response: `{ paymentIntent: { clientSecret: "..." }, transaction: {...} }`

---

### Task 1.6 & 1.7: Payment Methods Screen
**Navigation**: Dashboard → Payment Methods

**Test Cases**:
1. **Empty State**
   - Verify "No saved cards" message for new users
   - Verify "Add Card" FAB button visible

2. **View Saved Cards**
   - After adding cards, verify list displays
   - Verify card brand (VISA, MASTERCARD)
   - Verify last 4 digits
   - Verify expiry date
   - Verify DEFAULT badge for default card

3. **Set Default Card**
   - Tap "Set Default" on non-default card
   - Verify success alert
   - Verify DEFAULT badge moves to selected card

4. **Remove Card**
   - Tap delete icon
   - Verify confirmation dialog
   - Tap "Remove"
   - Verify success alert
   - Verify card removed from list

**Expected API Calls**:
- `GET /api/payments/cards`
- `POST /api/payments/cards/:id/default`
- `DELETE /api/payments/cards/:id`

---

### Task 1.8: Add Card Screen
**Navigation**: Payment Methods → Add Card FAB

**Test Cases**:
1. **Card Input**
   - Enter test card details
   - Verify validation works
   - Toggle "Set as default card" switch

2. **Add Card Success**
   - Fill valid card details
   - Tap "Add Card"
   - Verify success alert
   - Verify navigation back to Payment Methods
   - Verify new card appears in list

3. **Add Card Error**
   - Enter invalid card
   - Verify error message displays

**Expected API Calls**:
- Stripe: `createPaymentMethod()`
- `POST /api/payments/cards` - Body: `{ paymentMethodId: "pm_..." }`

---

### Transaction History Screen
**Navigation**: Wallet → View All Transactions

**Test Cases**:
1. **Filter Transactions**
   - Test "All" filter
   - Test "Top Ups" filter
   - Test "Cashback" filter
   - Test "Purchases" filter
   - Verify filtered results

2. **Transaction Display**
   - Verify transaction icon
   - Verify transaction color (green for credit, red for debit)
   - Verify amount format
   - Verify status chip
   - Verify date format

3. **Pull to Refresh**
   - Pull to refresh
   - Verify data reloads

---

## Phase 2: Card & QR Scanner Testing

### Task 2.1 & 2.2: My Card Screen
**Navigation**: Card Tab or Dashboard → My Card

**Test Cases**:
1. **Card Display**
   - Verify card gradient color matches card tier
   - Verify QR code displays
   - Verify card number displays
   - Verify member since year

2. **Benefits**
   - Verify benefits list displays
   - Verify features match card tier

3. **Statistics**
   - Verify receipts scanned count
   - Verify stickers scanned count
   - Verify total cashback earned

4. **Upgrade Card**
   - For non-PLATINUM cards, verify upgrade card shows
   - For PLATINUM cards, verify no upgrade card

**Expected API Calls**:
- `GET /api/cards/my-card`
- `GET /api/cards/:id/statistics`

---

### Task 2.3: Sticker Scanner Screen
**Navigation**: Scan Tab

**Test Cases**:
1. **Permissions**
   - First launch should request camera permission
   - First launch should request location permission
   - Verify permission denied shows error message
   - Tap "Grant Permissions" should re-request

2. **QR Scanning**
   - Point camera at BOOM-Sticker QR code
   - Verify scan area overlay displays
   - Verify corners highlight scan area

3. **Amount Input Modal**
   - After scanning, verify modal appears
   - Enter bill amount
   - Verify validation (must be > 0)
   - Tap "Continue"
   - Verify GPS location is captured

4. **Scan Success**
   - Verify navigation to Upload Receipt screen
   - Verify scan ID, bill amount, cashback percent passed

5. **Scan Error**
   - Test with invalid QR code
   - Verify error alert
   - Verify can scan again

**Expected API Calls**:
- `POST /api/stickers/scan` - Body: `{ stickerId, billAmount, gpsLatitude, gpsLongitude }`

---

### Task 2.4: Upload Receipt Screen
**Navigation**: After successful sticker scan

**Test Cases**:
1. **Receipt Info**
   - Verify bill amount displays
   - Verify expected cashback displays (calculated from percent)

2. **Image Selection - Camera**
   - Tap "Take Photo"
   - Verify camera launches
   - Take photo
   - Verify image preview displays
   - Verify "Remove Image" button works

3. **Image Selection - Gallery**
   - Tap "Choose from Gallery"
   - Verify gallery opens
   - Select image
   - Verify image preview displays

4. **Upload Success**
   - Select receipt image
   - Tap "Upload Receipt"
   - Verify loading state
   - Verify success alert with cashback amount
   - Verify navigation to Dashboard

5. **Upload Error**
   - Try upload without image
   - Verify error alert

**Expected API Calls**:
- `POST /api/stickers/scan/:id/receipt` - FormData with receipt image

---

## Integration Testing

### End-to-End Flow 1: Wallet Top-Up
1. Open app → Login
2. Navigate to Wallet
3. Tap "Top Up" FAB
4. Select 50 BGN preset
5. Enter card: 4242 4242 4242 4242
6. Tap "Pay 50 BGN"
7. ✅ Success alert
8. ✅ Balance shows 50 BGN
9. ✅ Transaction appears in history

### End-to-End Flow 2: Sticker Scan
1. Open app → Login
2. Navigate to Scan tab
3. Grant permissions
4. Scan BOOM-Sticker QR
5. Enter bill amount: 100 BGN
6. Tap "Continue"
7. ✅ Navigate to Upload Receipt
8. Take/select receipt photo
9. Tap "Upload Receipt"
10. ✅ Success with cashback amount
11. ✅ Navigate to Dashboard

### End-to-End Flow 3: Payment Method Management
1. Open app → Login
2. Navigate to Payment Methods
3. Tap "Add Card" FAB
4. Enter card details
5. Toggle "Set as default"
6. Tap "Add Card"
7. ✅ Card appears in list with DEFAULT badge
8. Add another card
9. Tap "Set Default" on new card
10. ✅ DEFAULT badge moves
11. Delete first card
12. ✅ Card removed

---

## API Endpoint Verification

### Wallet Endpoints
- ✅ `GET /api/payments/wallet/balance`
- ✅ `GET /api/payments/wallet/transactions?type=TOP_UP&limit=10&offset=0`
- ✅ `GET /api/payments/wallet/statistics`
- ✅ `POST /api/payments/wallet/topup` - Body: `{ amount, paymentMethodId? }`

### Payment Methods Endpoints
- ✅ `GET /api/payments/cards`
- ✅ `POST /api/payments/cards` - Body: `{ paymentMethodId }`
- ✅ `DELETE /api/payments/cards/:id`
- ✅ `POST /api/payments/cards/:id/default`

### Card Endpoints
- ✅ `GET /api/cards/my-card`
- ✅ `GET /api/cards/:id/statistics`
- ✅ `GET /api/cards/benefits`
- ✅ `POST /api/cards/validate` - Body: `{ cardNumber }`

### Sticker Endpoints
- ✅ `POST /api/stickers/scan` - Body: `{ stickerId, billAmount, gpsLatitude, gpsLongitude }`
- ✅ `POST /api/stickers/scan/:id/receipt` - FormData
- ✅ `GET /api/stickers/my-scans`
- ✅ `GET /api/stickers/validate/:stickerId`

---

## Common Issues & Solutions

### Issue: "Stripe not initialized"
**Solution**: Verify StripeProvider wraps the app in App.tsx

### Issue: "Network error" on API calls
**Solution**:
- Verify backend is running on port 3001
- Check API_CONFIG.BASE_URL in constants/config.ts
- For iOS simulator: Use `http://localhost:3001`
- For Android emulator: Use `http://10.0.2.2:3001`

### Issue: Camera permission not working
**Solution**:
- For iOS: Add camera permission to app.json
- For Android: Verify CAMERA permission in AndroidManifest.xml

### Issue: GPS location always failing
**Solution**:
- Verify location permission granted
- For simulator: Set custom location (Debug → Location → Custom)
- For real device: Enable location services

### Issue: Stripe card validation always fails
**Solution**: Ensure using test cards in development mode

---

## Performance Testing

### Load Times
- Wallet Screen: < 2 seconds
- Transaction History: < 2 seconds
- Card Screen: < 1 second
- QR Scanner: < 1 second

### Memory Usage
- Monitor with React Native DevTools
- No memory leaks on screen navigation
- Images properly released after upload

---

## Accessibility Testing

1. **Screen Reader**: Test with VoiceOver (iOS) / TalkBack (Android)
2. **Touch Targets**: Minimum 44x44 points
3. **Color Contrast**: WCAG AA compliance
4. **Text Scaling**: Support dynamic type

---

## Next Steps After Testing

1. ✅ All screens functional
2. ✅ API integration complete
3. ✅ Payment flow working
4. ✅ Scanning flow working
5. 🚀 Ready for production testing
6. 📱 Submit to app stores (when backend is deployed)

---

## Test Reporting

Create issues for any bugs found:
- Screen name
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots/video
