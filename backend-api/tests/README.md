# BoomCard Backend Integration Tests

## Overview

This directory contains integration tests for the BoomCard backend API, specifically focusing on the Developer B implementation tasks:

- **Card Management API** - Testing card CRUD operations, QR code generation, validation, and tier upgrades
- **Cashback Flow** - Testing the end-to-end cashback integration with wallet system

## Test Files

### `integration/card.test.ts`

Tests all Card API endpoints:

- Auto-creation of STANDARD card on registration
- Card number format validation (BOOM-XXXX-XXXX-XXXX)
- QR code generation
- Card tier benefits
- Card upgrade/downgrade logic
- Card activation/deactivation
- Card statistics
- Card validation for QR scanning

### `integration/cashback-flow.test.ts`

Tests the complete cashback flow:

- Wallet auto-creation on registration
- Receipt cashback crediting
- Sticker scan cashback crediting
- Wallet transaction history
- Card tier cashback rates
- Concurrent cashback operations
- Wallet balance integrity checks

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- card.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run with verbose output
npm test -- --verbose
```

## Test Structure

Each test suite follows this pattern:

1. **beforeAll**: Creates test user, gets auth token, retrieves auto-created resources
2. **Test cases**: Execute API calls and verify responses
3. **afterAll**: Cleanup test data and disconnect from database

## Key Test Scenarios

### Card Tests

- ✅ Card auto-creation on user registration
- ✅ Duplicate card prevention
- ✅ Card number format validation
- ✅ QR code generation
- ✅ Tier upgrade validation (requires subscription)
- ✅ Card activation/deactivation
- ✅ Card statistics tracking

### Cashback Flow Tests

- ✅ Wallet auto-creation on registration
- ✅ Receipt approval credits wallet
- ✅ Sticker scan approval credits wallet
- ✅ Transaction history accuracy
- ✅ Card tier affects cashback amount
- ✅ Concurrent cashback operations
- ✅ Wallet balance integrity

## Test Data

Tests create temporary users with unique email addresses to avoid conflicts:
- Card tests: `card-test-{timestamp}@example.com`
- Cashback tests: `cashback-test-{timestamp}@example.com`

All test data is cleaned up in the `afterAll` hook.

## Configuration

- **Timeout**: 30 seconds (configured in jest.config.js)
- **Environment**: Node.js
- **Database**: Uses same database as development (ensure test DB is separate in production)

## Assertions

Tests use Jest's expect API with matchers like:
- `toBe()` - Strict equality
- `toEqual()` - Deep equality
- `toHaveProperty()` - Object has property
- `toContain()` - Array/string contains value
- `toMatch()` - Regex match
- `toBeGreaterThanOrEqual()` - Numeric comparison

## Notes

- Tests require a running database connection
- Card auto-creation is tested as part of the registration flow
- Wallet integration is tested separately from the API endpoints
- All monetary amounts are in BGN (Bulgarian Lev)

## Future Enhancements

- [ ] Add tests for subscription integration with card upgrades
- [ ] Add tests for wallet withdrawal functionality
- [ ] Add tests for fraud detection scenarios
- [ ] Add performance tests for concurrent operations
- [ ] Add tests for S3 image upload integration
