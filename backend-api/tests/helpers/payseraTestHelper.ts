/**
 * Test helpers for Paysera payment tests
 */

import crypto from 'crypto';

export const mockPayseraConfig = {
  projectId: process.env.PAYSERA_PROJECT_ID || '123456',
  signPassword: process.env.PAYSERA_SIGN_PASSWORD || 'test-password',
  apiUrl: process.env.PAYSERA_API_URL || 'https://www.paysera.com/pay',
  testMode: true,
};

export interface MockCallbackDataParams {
  orderId: string;
  amount: string; // In cents, as string
  currency: string;
  status: '0' | '1' | '2' | '3'; // 0=pending, 1=success, 2=failed, 3=cancelled
  requestId?: string;
  payment?: string;
  test?: '0' | '1';
}

/**
 * Create properly formatted Paysera callback data
 */
export function createMockCallbackData(params: MockCallbackDataParams) {
  return {
    projectid: mockPayseraConfig.projectId,
    orderid: params.orderId,
    amount: params.amount,
    currency: params.currency,
    payment: params.payment || 'card',
    status: params.status,
    requestid: params.requestId || `REQ-${Date.now()}`,
    payamount: params.amount,
    paycurrency: params.currency,
    paytext: `Payment for order ${params.orderId}`,
    test: params.test || '1',
  };
}

/**
 * Create signed Paysera callback
 */
export function createSignedCallback(params: MockCallbackDataParams) {
  const callbackData = createMockCallbackData(params);
  const encodedData = Buffer.from(JSON.stringify(callbackData)).toString('base64');

  const ss1 = crypto
    .createHash('md5')
    .update(`${encodedData}${mockPayseraConfig.signPassword}`)
    .digest('hex');

  const ss2 = crypto
    .createHash('sha256')
    .update(`${encodedData}${mockPayseraConfig.signPassword}`)
    .digest('hex');

  return {
    data: encodedData,
    ss1,
    ss2,
  };
}

/**
 * Decode payment URL to extract data
 */
export function decodePaymentUrl(paymentUrl: string) {
  const url = new URL(paymentUrl);
  const encodedData = url.searchParams.get('data');
  const signature = url.searchParams.get('sign');

  if (!encodedData) {
    throw new Error('No data found in payment URL');
  }

  const decodedData = JSON.parse(Buffer.from(encodedData, 'base64').toString());

  return {
    data: decodedData,
    signature,
    encodedData,
  };
}

/**
 * Verify payment URL signature
 */
export function verifyPaymentUrlSignature(paymentUrl: string, signPassword: string): boolean {
  const { encodedData, signature } = decodePaymentUrl(paymentUrl);

  const expectedSignature = crypto
    .createHash('md5')
    .update(`${encodedData}${signPassword}`)
    .digest('hex');

  return signature === expectedSignature;
}

/**
 * Create test transaction data for database
 */
export function createTestTransaction(userId: string, orderId: string) {
  return {
    userId,
    type: 'PAYMENT' as const,
    amount: 50.0,
    currency: 'BGN',
    status: 'PENDING' as const,
    description: `Test payment ${orderId}`,
    metadata: {
      orderId,
      source: 'test',
    },
  };
}

/**
 * Wait for async operations (helper for integration tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
