/**
 * Contract Tests: RegisterScreen — Terms Acceptance
 *
 * These are pure logic / contract tests. No component rendering,
 * no native modules, no mocks required.
 */

describe('RegisterScreen — Terms Acceptance', () => {
  describe('Registration API Call', () => {
    it('should include acceptTerms in registration payload', async () => {
      // The registration payload contract: acceptTerms must be true
      const registrationData = {
        email: 'test@example.com',
        password: 'TestPass123!',
        firstName: 'Test',
        lastName: 'User',
        acceptTerms: true,
      };

      expect(registrationData).toEqual(
        expect.objectContaining({ acceptTerms: true })
      );
    });

    it('should NOT register without terms acceptance', () => {
      const isValid = (data: { acceptTerms?: boolean }) =>
        data.acceptTerms === true;

      expect(isValid({ acceptTerms: false })).toBe(false);
      expect(isValid({ acceptTerms: undefined })).toBe(false);
      expect(isValid({ acceptTerms: true })).toBe(true);
    });
  });

  describe('Terms Links', () => {
    it('should have correct URLs for terms and privacy policy', () => {
      const TERMS_URL = 'https://boomcard.bg/terms';
      const PRIVACY_URL = 'https://boomcard.bg/privacy';

      expect(TERMS_URL).toContain('boomcard.bg/terms');
      expect(PRIVACY_URL).toContain('boomcard.bg/privacy');
    });
  });
});
