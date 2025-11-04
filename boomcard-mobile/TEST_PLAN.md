# BoomCard Mobile App - Comprehensive Test Plan

**Version:** 1.0.0
**Last Updated:** November 4, 2025
**Test Environment:** iOS Simulator + Android Emulator + Physical Devices

---

## 📋 Table of Contents

1. [Test Strategy](#test-strategy)
2. [Test Environments](#test-environments)
3. [Critical Path Testing](#critical-path-testing)
4. [Feature Testing](#feature-testing)
5. [Payment Flow Testing](#payment-flow-testing)
6. [Security Testing](#security-testing)
7. [Performance Testing](#performance-testing)
8. [Device Testing Matrix](#device-testing-matrix)
9. [Test Execution Checklist](#test-execution-checklist)
10. [Bug Reporting](#bug-reporting)

---

## Test Strategy

### Testing Phases

**Phase 1: Unit Testing** ✅ (Already Complete)
- Payment service unit tests
- API client tests
- Utility function tests

**Phase 2: Simulator Testing** (Current Phase)
- iOS Simulator testing
- Android Emulator testing
- Local backend connection

**Phase 3: Preview Build Testing**
- TestFlight (iOS)
- Internal Testing (Android)
- Real device testing

**Phase 4: Production Testing**
- Production API connection
- Real payment processing
- End-to-end validation

### Success Criteria

- ✅ All critical path tests pass
- ✅ No crash-causing bugs
- ✅ Payment flow completes successfully
- ✅ GPS validation works within 60m
- ✅ Deep linking returns to app correctly
- ✅ All permissions granted properly

---

## Test Environments

### Local Development
```bash
API_URL=http://localhost:3001
PAYSERA_TEST_MODE=true
BACKEND_ENV=development
```

### Staging (Preview Builds)
```bash
API_URL=https://api-staging.boomcard.bg
PAYSERA_TEST_MODE=true
BACKEND_ENV=staging
```

### Production (Final Testing)
```bash
API_URL=https://api.boomcard.bg
PAYSERA_TEST_MODE=false
BACKEND_ENV=production
```

---

## Critical Path Testing

### 🔴 Critical Path 1: User Registration → First Payment

**Objective:** New user can register and make their first wallet top-up

**Steps:**
1. ✅ Open app (first launch)
2. ✅ Tap "Register" on login screen
3. ✅ Fill in registration form:
   - Email: `test-{timestamp}@boomcard.bg`
   - Password: `TestPass123!`
   - Confirm password
4. ✅ Submit registration
5. ✅ Verify email verification prompt (if required)
6. ✅ Login with new credentials
7. ✅ Navigate to Dashboard
8. ✅ Tap "Wallet" or wallet icon
9. ✅ Tap "Top Up" FAB button
10. ✅ Select amount: 20 BGN
11. ✅ Tap "Top Up 20 BGN"
12. ✅ WebBrowser opens with Paysera
13. ✅ Complete payment (test card)
14. ✅ Redirects back to app
15. ✅ Success message shown
16. ✅ Wallet balance updates to 20 BGN
17. ✅ Transaction appears in history

**Expected Time:** 3-5 minutes
**Critical:** YES - This is the core user journey

---

### 🔴 Critical Path 2: Receipt Submission with GPS

**Objective:** User scans receipt at venue and earns cashback

**Prerequisites:**
- User logged in
- GPS enabled
- Camera permission granted
- At least 1 BGN in wallet (for potential fees)

**Steps:**
1. ✅ Navigate to Dashboard
2. ✅ Tap "Scan Receipt" or camera icon
3. ✅ Grant camera permission if prompted
4. ✅ Grant location permission if prompted
5. ✅ Camera opens
6. ✅ Take photo of receipt OR select from gallery
7. ✅ Review photo
8. ✅ Verify GPS location captured
9. ✅ Verify "Within 60m of venue" message
10. ✅ Tap "Submit Receipt"
11. ✅ Upload progress shown
12. ✅ Success message shown
13. ✅ Receipt appears in "Receipts" tab
14. ✅ Status shows "Pending" or "Processing"
15. ✅ Cashback pending amount shown

**Expected Time:** 2-3 minutes
**Critical:** YES - Core feature for cashback

---

### 🔴 Critical Path 3: QR Sticker Scan

**Objective:** User scans venue QR code and earns instant cashback

**Prerequisites:**
- User logged in
- GPS enabled
- Camera permission granted
- Physical distance from venue < 60m

**Steps:**
1. ✅ Navigate to "Scan" tab
2. ✅ Grant camera permission if prompted
3. ✅ Grant location permission if prompted
4. ✅ Point camera at venue QR sticker
5. ✅ QR code detected automatically
6. ✅ Verify GPS location captured
7. ✅ Verify "Within 60m" validation
8. ✅ Venue information displayed
9. ✅ Cashback amount shown
10. ✅ Tap "Claim Cashback"
11. ✅ Success message shown
12. ✅ Cashback added to wallet
13. ✅ Scan appears in history
14. ✅ Wallet balance updated

**Expected Time:** 1-2 minutes
**Critical:** YES - Quick cashback feature

---

## Feature Testing

### Authentication

#### Login
- [ ] **TC-AUTH-001**: Login with valid credentials
  - Email: `test@boomcard.bg`
  - Password: `TestPass123!`
  - Expected: Login successful, navigate to Dashboard

- [ ] **TC-AUTH-002**: Login with invalid email
  - Email: `invalid@boomcard.bg`
  - Password: `TestPass123!`
  - Expected: Error message "Invalid credentials"

- [ ] **TC-AUTH-003**: Login with invalid password
  - Email: `test@boomcard.bg`
  - Password: `WrongPass123!`
  - Expected: Error message "Invalid credentials"

- [ ] **TC-AUTH-004**: Login with empty fields
  - Expected: Validation errors shown

- [ ] **TC-AUTH-005**: Remember me functionality
  - Login → Close app → Reopen
  - Expected: Still logged in

#### Registration
- [ ] **TC-AUTH-101**: Register new user
  - Email: `newuser-{timestamp}@boomcard.bg`
  - Password: `TestPass123!`
  - Expected: Registration successful

- [ ] **TC-AUTH-102**: Register with existing email
  - Expected: Error "Email already registered"

- [ ] **TC-AUTH-103**: Register with weak password
  - Password: `123`
  - Expected: Validation error

- [ ] **TC-AUTH-104**: Register with mismatched passwords
  - Password: `TestPass123!`
  - Confirm: `Different123!`
  - Expected: Validation error "Passwords do not match"

#### Token Refresh
- [ ] **TC-AUTH-201**: JWT token auto-refresh
  - Wait for token expiry (15 minutes)
  - Make API call
  - Expected: Token refreshed automatically, API call succeeds

- [ ] **TC-AUTH-202**: Expired refresh token
  - Wait for refresh token expiry (7 days)
  - Make API call
  - Expected: Redirected to login screen

#### Logout
- [ ] **TC-AUTH-301**: Logout functionality
  - Tap profile → Logout
  - Expected: Redirected to login, tokens cleared

---

### Wallet & Payments

#### Wallet Display
- [ ] **TC-WALLET-001**: Display wallet balance
  - Expected: Balance shown in BGN
  - Format: "20.00 BGN"

- [ ] **TC-WALLET-002**: Display pending balance
  - Expected: Pending cashback shown separately
  - Format: "5.00 BGN pending"

- [ ] **TC-WALLET-003**: Display statistics
  - Expected: Total cashback, Total spent shown

- [ ] **TC-WALLET-004**: Pull-to-refresh
  - Pull down on wallet screen
  - Expected: Balance updates

#### Top-Up Flow (Paysera)
- [ ] **TC-PAY-001**: Top-up with preset amount (10 BGN)
  - Select 10 BGN → Tap Top Up
  - Expected: Paysera opens in WebBrowser

- [ ] **TC-PAY-002**: Top-up with custom amount (25.50 BGN)
  - Enter 25.50 → Tap Top Up
  - Expected: Paysera opens with correct amount

- [ ] **TC-PAY-003**: Complete payment successfully
  - Select amount → Pay on Paysera (test card)
  - Expected: Returns to app, success message, balance updated

- [ ] **TC-PAY-004**: Cancel payment
  - Select amount → Cancel on Paysera
  - Expected: Returns to app, cancel message, balance unchanged

- [ ] **TC-PAY-005**: Payment validation (minimum)
  - Enter 4 BGN (below minimum)
  - Expected: Error "Minimum top-up amount is 5 BGN"

- [ ] **TC-PAY-006**: Payment validation (maximum)
  - Enter 15,000 BGN (above maximum)
  - Expected: Error "Maximum top-up amount is 10,000 BGN"

- [ ] **TC-PAY-007**: Deep linking return
  - Complete payment → Check deep link triggers
  - Expected: App resumes, payment verified

- [ ] **TC-PAY-008**: Network interruption during payment
  - Start payment → Disable WiFi → Complete on Paysera
  - Expected: App handles gracefully, verifies when reconnected

- [ ] **TC-PAY-009**: Payment status polling
  - Complete payment → Monitor logs
  - Expected: App polls status up to 10 times, 2s interval

#### Transaction History
- [ ] **TC-TRANS-001**: Display transaction history
  - Navigate to Wallet → View All Transactions
  - Expected: List of transactions shown

- [ ] **TC-TRANS-002**: Transaction details
  - Tap on transaction
  - Expected: Details shown (amount, date, type, status)

- [ ] **TC-TRANS-003**: Filter transactions
  - Filter by type (Top-up, Cashback, Purchase)
  - Expected: Filtered list shown

- [ ] **TC-TRANS-004**: Empty transaction history
  - New user, no transactions
  - Expected: "No transactions yet" message

---

### Receipt Scanner

#### Camera & Permissions
- [ ] **TC-RECEIPT-001**: Camera permission prompt
  - First time opening scanner
  - Expected: Permission prompt shown

- [ ] **TC-RECEIPT-002**: Camera permission denied
  - Deny camera permission
  - Expected: Message with instructions to enable

- [ ] **TC-RECEIPT-003**: Camera opens correctly
  - Grant permission
  - Expected: Camera preview shown

#### Photo Capture
- [ ] **TC-RECEIPT-101**: Capture photo
  - Tap capture button
  - Expected: Photo taken, preview shown

- [ ] **TC-RECEIPT-102**: Retake photo
  - Capture → Tap "Retake"
  - Expected: Returns to camera

- [ ] **TC-RECEIPT-103**: Select from gallery
  - Tap gallery icon
  - Expected: Photo picker opens

- [ ] **TC-RECEIPT-104**: Photo quality check
  - Take blurry photo
  - Expected: Warning or auto-reject

#### GPS Validation
- [ ] **TC-RECEIPT-201**: Within 60m of venue
  - At venue → Take photo
  - Expected: "Within 60m" message, can submit

- [ ] **TC-RECEIPT-202**: Beyond 60m from venue
  - Away from venue → Take photo
  - Expected: "Too far from venue" error, cannot submit

- [ ] **TC-RECEIPT-203**: GPS permission denied
  - Deny location permission
  - Expected: Error message, instructions to enable

- [ ] **TC-RECEIPT-204**: GPS disabled on device
  - Turn off GPS → Try to submit
  - Expected: Prompt to enable GPS

- [ ] **TC-RECEIPT-205**: GPS accuracy check
  - Expected: Accuracy better than 50m preferred

#### Receipt Submission
- [ ] **TC-RECEIPT-301**: Upload receipt successfully
  - Capture → Submit
  - Expected: Upload progress, success message

- [ ] **TC-RECEIPT-302**: Upload with slow network
  - Slow connection → Submit
  - Expected: Progress indicator, eventual success

- [ ] **TC-RECEIPT-303**: Upload failure (network error)
  - No network → Submit
  - Expected: Error message, retry option

- [ ] **TC-RECEIPT-304**: Large file upload (>5MB)
  - Select large image
  - Expected: Compression or size warning

- [ ] **TC-RECEIPT-305**: Duplicate receipt detection
  - Submit same receipt twice
  - Expected: "Duplicate receipt" warning

---

### Sticker Scanner

#### QR Code Scanning
- [ ] **TC-STICKER-001**: Scan valid QR code
  - Point at venue sticker
  - Expected: QR detected, venue info shown

- [ ] **TC-STICKER-002**: Scan invalid QR code
  - Point at random QR code
  - Expected: "Invalid sticker" message

- [ ] **TC-STICKER-003**: Scan speed
  - Point at QR code
  - Expected: Detection within 1-2 seconds

- [ ] **TC-STICKER-004**: Scan at angle
  - Hold phone at 45° angle
  - Expected: Still detects QR code

- [ ] **TC-STICKER-005**: Scan in low light
  - Test in dim environment
  - Expected: Detection still works (flashlight toggle?)

#### Cashback Claiming
- [ ] **TC-STICKER-101**: Claim cashback within 60m
  - At venue → Scan → Claim
  - Expected: Cashback added, success message

- [ ] **TC-STICKER-102**: Claim cashback beyond 60m
  - Away from venue → Scan → Try to claim
  - Expected: Error "Not within range"

- [ ] **TC-STICKER-103**: Claim same sticker twice
  - Scan same sticker again
  - Expected: "Already claimed" or cooldown message

- [ ] **TC-STICKER-104**: Cashback amount display
  - Scan sticker
  - Expected: Correct cashback amount shown

---

### Digital Card

#### Display
- [ ] **TC-CARD-001**: Display digital card
  - Navigate to Card tab
  - Expected: Card with QR code shown

- [ ] **TC-CARD-002**: QR code generation
  - Expected: QR code contains user ID

- [ ] **TC-CARD-003**: Card tier display
  - Expected: Correct tier shown (Standard/Premium/Platinum)

- [ ] **TC-CARD-004**: Card benefits display
  - Expected: Cashback percentage shown

#### QR Code
- [ ] **TC-CARD-101**: QR code readable
  - Expected: Can be scanned by venue POS

- [ ] **TC-CARD-102**: QR code refresh
  - Expected: QR code updates if user ID changes

---

### Profile & Settings

#### Profile Display
- [ ] **TC-PROFILE-001**: Display user profile
  - Navigate to Profile tab
  - Expected: User email, name shown

- [ ] **TC-PROFILE-002**: Edit profile
  - Update name → Save
  - Expected: Name updated successfully

- [ ] **TC-PROFILE-003**: Change password
  - Enter old/new password → Save
  - Expected: Password changed, still logged in

#### Settings
- [ ] **TC-PROFILE-101**: App version display
  - Expected: Version "1.0.0" shown

- [ ] **TC-PROFILE-102**: Logout
  - Tap Logout
  - Expected: Confirmation prompt, then logout

- [ ] **TC-PROFILE-103**: Delete account (if implemented)
  - Tap Delete Account
  - Expected: Warning prompt, confirmation required

---

## Payment Flow Testing

### Detailed Payment Test Cases

#### Paysera Integration
```
Test Card Numbers (Paysera Test Mode):
- Success: 4111111111111111
- Decline: 4000000000000002
- 3D Secure: 4000000000003055
```

- [ ] **TC-PAYSERA-001**: Successful payment (test card)
  ```
  Amount: 20 BGN
  Card: 4111111111111111
  Expected: Payment completes, balance +20 BGN
  ```

- [ ] **TC-PAYSERA-002**: Declined payment
  ```
  Amount: 20 BGN
  Card: 4000000000000002
  Expected: Decline message, balance unchanged
  ```

- [ ] **TC-PAYSERA-003**: 3D Secure payment
  ```
  Amount: 20 BGN
  Card: 4000000000003055
  Expected: 3DS challenge, then success
  ```

- [ ] **TC-PAYSERA-004**: WebBrowser opens correctly
  ```
  Expected: In-app browser, not external browser
  ```

- [ ] **TC-PAYSERA-005**: WebBrowser close button
  ```
  Tap X during payment
  Expected: Returns to app, payment cancelled
  ```

- [ ] **TC-PAYSERA-006**: Deep link return
  ```
  Complete payment → Check URL
  Expected: boomcard://payment-result?orderId=XXX&status=success
  ```

- [ ] **TC-PAYSERA-007**: Status polling
  ```
  Complete payment → Check network logs
  Expected: GET /api/payments/:orderId/status (10 retries max)
  ```

- [ ] **TC-PAYSERA-008**: Concurrent payments
  ```
  Start payment → Background app → Start another payment
  Expected: Handled gracefully, no conflicts
  ```

---

## Security Testing

### Authentication Security
- [ ] **SEC-AUTH-001**: JWT token storage
  - Check SecureStore
  - Expected: Tokens encrypted

- [ ] **SEC-AUTH-002**: Password masking
  - Type password
  - Expected: Characters masked

- [ ] **SEC-AUTH-003**: Token expiration handling
  - Wait for expiry
  - Expected: Refresh or logout

### Data Security
- [ ] **SEC-DATA-001**: Receipt images encrypted
  - Upload receipt → Check storage
  - Expected: Images not visible in plain text

- [ ] **SEC-DATA-002**: Sensitive data not logged
  - Check console logs
  - Expected: No passwords, tokens in logs

- [ ] **SEC-DATA-003**: HTTPS only
  - Check network traffic
  - Expected: All requests use HTTPS

### Permission Security
- [ ] **SEC-PERM-001**: Camera permission revoke
  - Revoke camera → Try to scan
  - Expected: Graceful error, re-request

- [ ] **SEC-PERM-002**: Location permission revoke
  - Revoke location → Try to submit receipt
  - Expected: Error message, instructions

---

## Performance Testing

### App Launch
- [ ] **PERF-001**: Cold start time
  - Kill app → Launch
  - Expected: < 3 seconds to Dashboard

- [ ] **PERF-002**: Warm start time
  - Background → Foreground
  - Expected: < 1 second

### Navigation
- [ ] **PERF-101**: Tab switching
  - Switch between tabs
  - Expected: Instant, no lag

- [ ] **PERF-102**: Screen transitions
  - Navigate between screens
  - Expected: Smooth 60 FPS

### API Performance
- [ ] **PERF-201**: API call timeout
  - Expected: Timeout after 30 seconds

- [ ] **PERF-202**: Image upload speed
  - Upload 2MB image
  - Expected: < 10 seconds on 4G

### Memory
- [ ] **PERF-301**: Memory usage
  - Use app for 10 minutes
  - Expected: No memory leaks, stable usage

- [ ] **PERF-302**: Camera memory
  - Take 20 photos
  - Expected: Memory released after each

---

## Device Testing Matrix

### iOS Devices

| Device | OS Version | Screen Size | Priority | Status |
|--------|------------|-------------|----------|--------|
| iPhone 15 Pro | iOS 18 | 6.1" | High | ⏳ |
| iPhone 14 | iOS 17 | 6.1" | High | ⏳ |
| iPhone 13 | iOS 16 | 6.1" | Medium | ⏳ |
| iPhone SE (3rd) | iOS 16 | 4.7" | Medium | ⏳ |
| iPad Pro 12.9" | iPadOS 17 | 12.9" | Low | ⏳ |
| iPad Air | iPadOS 16 | 10.9" | Low | ⏳ |

### Android Devices

| Device | OS Version | Screen Size | Priority | Status |
|--------|------------|-------------|----------|--------|
| Samsung Galaxy S24 | Android 14 | 6.2" | High | ⏳ |
| Google Pixel 8 | Android 14 | 6.2" | High | ⏳ |
| Samsung Galaxy S22 | Android 13 | 6.1" | Medium | ⏳ |
| OnePlus 11 | Android 13 | 6.7" | Medium | ⏳ |
| Samsung Galaxy A54 | Android 13 | 6.4" | Medium | ⏳ |
| Xiaomi Redmi Note 12 | Android 12 | 6.67" | Low | ⏳ |

### Network Conditions

- [ ] WiFi (Fast: 100+ Mbps)
- [ ] 5G (Fast: 50-100 Mbps)
- [ ] 4G (Medium: 10-50 Mbps)
- [ ] 3G (Slow: 1-10 Mbps)
- [ ] Offline mode
- [ ] Network switching (WiFi → 4G)

---

## Test Execution Checklist

### Before Testing
- [ ] Backend API running (local or staging)
- [ ] Test user account created
- [ ] Test venue data available
- [ ] Test QR stickers prepared
- [ ] Test receipts prepared (photos)
- [ ] Paysera test mode enabled
- [ ] Device/simulator GPS enabled
- [ ] Screen recording tools ready

### During Testing
- [ ] Document all steps taken
- [ ] Record screen for critical paths
- [ ] Note any unexpected behavior
- [ ] Take screenshots of errors
- [ ] Log network traffic for payment flow
- [ ] Monitor device logs (console)

### After Testing
- [ ] Compile test results
- [ ] Create bug reports for failures
- [ ] Update test case status
- [ ] Notify team of critical issues
- [ ] Prepare summary report

---

## Bug Reporting

### Bug Report Template

```markdown
## Bug ID: BOOM-XXX

**Title:** [Short description]

**Severity:** Critical / High / Medium / Low

**Priority:** P1 / P2 / P3 / P4

**Environment:**
- Platform: iOS / Android
- OS Version: X.X
- App Version: 1.0.0
- Device: iPhone 15 Pro / Samsung Galaxy S24
- Network: WiFi / 4G / 5G

**Steps to Reproduce:**
1. Step 1
2. Step 2
3. Step 3

**Expected Result:**
What should happen

**Actual Result:**
What actually happened

**Screenshots/Videos:**
[Attach screenshots or screen recording]

**Logs:**
```
[Console logs if applicable]
```

**Additional Notes:**
Any other relevant information
```

### Severity Definitions

**Critical (P1):**
- App crashes on launch
- Cannot login/register
- Cannot make payments
- Data loss

**High (P2):**
- Feature completely broken
- Payment fails inconsistently
- GPS validation fails
- Deep linking doesn't work

**Medium (P3):**
- Feature partially broken
- UI/UX issues
- Performance problems
- Minor data inconsistencies

**Low (P4):**
- Cosmetic issues
- Text/translation errors
- Minor UI glitches

---

## Test Summary Report Template

```markdown
# Test Execution Summary - [Date]

## Overview
- Test Phase: Simulator / Preview / Production
- Test Duration: [Start] - [End]
- Tester(s): [Names]
- Platform(s): iOS / Android

## Statistics
- Total Test Cases: XXX
- Passed: XXX (XX%)
- Failed: XXX (XX%)
- Blocked: XXX (XX%)
- Not Executed: XXX (XX%)

## Critical Issues Found
1. [BOOM-XXX] [Title] - Severity: Critical
2. [BOOM-XXX] [Title] - Severity: High

## Pass/Fail by Feature
- Authentication: XX/XX passed
- Wallet & Payments: XX/XX passed
- Receipt Scanner: XX/XX passed
- Sticker Scanner: XX/XX passed
- Profile: XX/XX passed

## Recommendations
- [ ] Recommendation 1
- [ ] Recommendation 2

## Sign-off
Ready for next phase: YES / NO
```

---

## Automated Testing Scripts

### Pre-Test Setup Script
```bash
#!/bin/bash
# pre-test-setup.sh

echo "Setting up test environment..."

# 1. Start backend
cd backend-api
npm run start &
BACKEND_PID=$!

# 2. Wait for backend to be ready
sleep 10

# 3. Create test user
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@boomcard.bg",
    "password": "TestPass123!"
  }'

# 4. Create test venue
curl -X POST http://localhost:3001/api/venues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "Test Venue",
    "location": {"lat": 42.6977, "lng": 23.3219}
  }'

echo "Test environment ready!"
echo "Backend PID: $BACKEND_PID"
```

### Post-Test Cleanup Script
```bash
#!/bin/bash
# post-test-cleanup.sh

echo "Cleaning up test environment..."

# 1. Delete test users
curl -X DELETE http://localhost:3001/api/auth/users/test@boomcard.bg \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Stop backend
kill $BACKEND_PID

echo "Cleanup complete!"
```

---

## Next Steps

1. **Week 1: Simulator Testing**
   - Execute all critical path tests
   - Execute feature tests
   - Document all bugs found

2. **Week 2: Preview Build Testing**
   - Build preview versions
   - Test on physical devices
   - Execute full test matrix

3. **Week 3: Production Testing**
   - Build production versions
   - Execute smoke tests
   - Verify with production API

4. **Week 4: App Store Submission**
   - Submit to TestFlight/Internal Testing
   - Gather feedback from beta testers
   - Fix any critical issues
   - Submit to App Store/Play Store

---

**Test Coordinator:** [Name]
**Start Date:** [Date]
**Target Completion:** [Date]

**Generated with [Claude Code](https://claude.com/claude-code)**
**Version:** 1.0.0
**Last Updated:** November 4, 2025
