/**
 * imageUpload.service unit tests
 *
 * Sharp and the AWS S3 client are mocked so no real image processing
 * or network I/O occurs.
 *
 * Key invariants tested:
 *   - uploadImage rejects disallowed MIME types before calling sharp/S3
 *   - uploadImage rejects files larger than 10 MB before calling sharp/S3
 *   - dev-mode bypass (R2_ACCESS_KEY_ID === 'test') returns a placeholder URL,
 *     skips S3.send, and builds the correct key structure
 *   - downloadImageFromUrl throws for placehold.co (dev-mode placeholder)
 *   - downloadImageFromUrl throws for unrecognised storage hosts
 *   - downloadImageFromUrl succeeds for *.r2.dev and *.amazonaws.com URLs
 */

// ─── Sharp mock ───────────────────────────────────────────────────────────────

const MOCK_PROCESSED_BUFFER = Buffer.from('processed-image');

const mockSharpChain: any = {
  resize:    jest.fn(() => mockSharpChain),
  png:       jest.fn(() => mockSharpChain),
  jpeg:      jest.fn(() => mockSharpChain),
  webp:      jest.fn(() => mockSharpChain),
  grayscale: jest.fn(() => mockSharpChain),
  raw:       jest.fn(() => mockSharpChain),
  toBuffer:  jest.fn(async (opts?: any) =>
    opts?.resolveWithObject
      ? { data: Buffer.alloc(16 * 16, 100), info: {} }
      : MOCK_PROCESSED_BUFFER,
  ),
  metadata:  jest.fn(async () => ({ width: 800, height: 600, format: 'jpeg', size: 1024, hasAlpha: false })),
};

jest.mock('sharp', () => jest.fn(() => mockSharpChain));

// ─── AWS S3 mock ──────────────────────────────────────────────────────────────

const mockS3Send = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client:           jest.fn(() => ({ send: mockS3Send })),
  PutObjectCommand:   jest.fn((a: any) => a),
  DeleteObjectCommand:jest.fn((a: any) => a),
  GetObjectCommand:   jest.fn((a: any) => a),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(async () => 'https://signed-url.example.com'),
}));

import { ImageUploadService } from '../../src/services/imageUpload.service';

let service: ImageUploadService;

beforeEach(() => {
  jest.clearAllMocks();
  // Restore chain returns after clearAllMocks resets them
  mockSharpChain.resize.mockReturnValue(mockSharpChain);
  mockSharpChain.png.mockReturnValue(mockSharpChain);
  mockSharpChain.jpeg.mockReturnValue(mockSharpChain);
  mockSharpChain.webp.mockReturnValue(mockSharpChain);
  mockSharpChain.grayscale.mockReturnValue(mockSharpChain);
  mockSharpChain.raw.mockReturnValue(mockSharpChain);
  mockSharpChain.toBuffer.mockImplementation(async (opts?: any) =>
    opts?.resolveWithObject
      ? { data: Buffer.alloc(16 * 16, 100), info: {} }
      : MOCK_PROCESSED_BUFFER,
  );
  service = new ImageUploadService();
});

const SMALL_BUFFER = Buffer.alloc(1024, 0xff);                    // 1 KB
const LARGE_BUFFER = Buffer.alloc(11 * 1024 * 1024, 0xff);        // 11 MB — over 10 MB limit

// ─── uploadImage — MIME type validation ──────────────────────────────────────

describe('ImageUploadService.uploadImage — MIME type validation', () => {
  it('throws for image/gif (not in allowed list)', async () => {
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'a.gif', mimeType: 'image/gif' }))
      .rejects.toThrow('Invalid file type');
  });

  it('throws for application/pdf', async () => {
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'a.pdf', mimeType: 'application/pdf' }))
      .rejects.toThrow('Invalid file type');
  });

  it('throws before calling sharp when MIME is invalid', async () => {
    const sharp = require('sharp');
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'a.gif', mimeType: 'image/gif' }))
      .rejects.toThrow();
    expect(sharp).not.toHaveBeenCalled();
  });

  it('accepts image/jpeg', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test';
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'p.jpg', mimeType: 'image/jpeg' }))
      .resolves.toBeDefined();
    delete process.env.R2_ACCESS_KEY_ID;
  });

  it('accepts image/jpg', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test';
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'p.jpg', mimeType: 'image/jpg' }))
      .resolves.toBeDefined();
    delete process.env.R2_ACCESS_KEY_ID;
  });

  it('accepts image/png', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test';
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'p.png', mimeType: 'image/png' }))
      .resolves.toBeDefined();
    delete process.env.R2_ACCESS_KEY_ID;
  });

  it('accepts image/webp', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test';
    await expect(service.uploadImage({ file: SMALL_BUFFER, fileName: 'p.webp', mimeType: 'image/webp' }))
      .resolves.toBeDefined();
    delete process.env.R2_ACCESS_KEY_ID;
  });
});

// ─── uploadImage — file size validation ──────────────────────────────────────

describe('ImageUploadService.uploadImage — file size validation', () => {
  it('throws when file exceeds 10 MB', async () => {
    await expect(service.uploadImage({ file: LARGE_BUFFER, fileName: 'big.jpg', mimeType: 'image/jpeg' }))
      .rejects.toThrow('File too large');
  });

  it('error message includes the 10 MB limit', async () => {
    await expect(service.uploadImage({ file: LARGE_BUFFER, fileName: 'big.jpg', mimeType: 'image/jpeg' }))
      .rejects.toThrow('10MB');
  });

  it('throws before calling sharp when file is too large', async () => {
    const sharp = require('sharp');
    await expect(service.uploadImage({ file: LARGE_BUFFER, fileName: 'big.jpg', mimeType: 'image/jpeg' }))
      .rejects.toThrow();
    expect(sharp).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the 10 MB limit', async () => {
    process.env.R2_ACCESS_KEY_ID = 'test';
    const exactLimit = Buffer.alloc(10 * 1024 * 1024, 0xff);
    await expect(service.uploadImage({ file: exactLimit, fileName: 'edge.jpg', mimeType: 'image/jpeg' }))
      .resolves.toBeDefined();
    delete process.env.R2_ACCESS_KEY_ID;
  });
});

// ─── uploadImage — dev-mode bypass ───────────────────────────────────────────

describe('ImageUploadService.uploadImage — dev-mode bypass (R2_ACCESS_KEY_ID=test)', () => {
  beforeEach(() => { process.env.R2_ACCESS_KEY_ID = 'test'; });
  afterEach(() => { delete process.env.R2_ACCESS_KEY_ID; });

  it('returns a URL containing "placehold.co"', async () => {
    const result = await service.uploadImage({ file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(result.url).toContain('placehold.co');
  });

  it('does NOT call S3.send', async () => {
    await service.uploadImage({ file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('embeds folder name in the placeholder URL', async () => {
    const result = await service.uploadImage({
      file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg', folder: 'menus',
    });
    expect(result.url).toContain('menus');
  });

  it('key is {folder}/{userId}/{uuid}.{ext} when userId provided', async () => {
    const result = await service.uploadImage({
      file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg',
      folder: 'receipts', userId: 'u-123',
    });
    expect(result.key).toMatch(/^receipts\/u-123\/.+\.jpg$/);
  });

  it('key is {folder}/{uuid}.{ext} when userId is absent', async () => {
    const result = await service.uploadImage({
      file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg', folder: 'avatars',
    });
    expect(result.key).toMatch(/^avatars\/.+\.jpg$/);
    expect(result.key).not.toContain('undefined');
  });

  it('defaults folder to "receipts" when not specified', async () => {
    const result = await service.uploadImage({ file: SMALL_BUFFER, fileName: 'r.jpg', mimeType: 'image/jpeg' });
    expect(result.key).toMatch(/^receipts\//);
  });

  it('returns size equal to the processed image buffer length', async () => {
    const result = await service.uploadImage({ file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(result.size).toBe(MOCK_PROCESSED_BUFFER.length);
  });

  it('two uploads produce different keys (UUID uniqueness)', async () => {
    const r1 = await service.uploadImage({ file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    const r2 = await service.uploadImage({ file: SMALL_BUFFER, fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    expect(r1.key).not.toBe(r2.key);
  });
});

// ─── downloadImageFromUrl — host validation ───────────────────────────────────

describe('ImageUploadService.downloadImageFromUrl — host guards', () => {
  it('throws for placehold.co URLs (dev-mode placeholder)', async () => {
    await expect(service.downloadImageFromUrl('https://placehold.co/800x600/f59e0b/fff?text=receipts'))
      .rejects.toThrow('Cannot download placeholder image');
  });

  it('throws for arbitrary external host', async () => {
    await expect(service.downloadImageFromUrl('https://evil.example.com/image.jpg'))
      .rejects.toThrow('Refusing to download from unrecognised storage host');
  });

  it('throws for http:// URL on non-storage host', async () => {
    await expect(service.downloadImageFromUrl('http://other-cdn.net/image.jpg'))
      .rejects.toThrow('Refusing to download from unrecognised storage host');
  });

  it('accepts *.r2.dev URLs and calls S3.send', async () => {
    const fakeBody = (async function* () { yield Buffer.from('imgdata'); })();
    mockS3Send.mockResolvedValueOnce({ Body: fakeBody });

    const result = await service.downloadImageFromUrl(
      'https://pub-abc123.r2.dev/receipts/u-1/some-file.jpg',
    );
    expect(mockS3Send).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it('accepts *.amazonaws.com URLs and calls S3.send', async () => {
    const fakeBody = (async function* () { yield Buffer.from('imgdata'); })();
    mockS3Send.mockResolvedValueOnce({ Body: fakeBody });

    await service.downloadImageFromUrl(
      'https://my-bucket.s3.amazonaws.com/receipts/img.jpg',
    );
    expect(mockS3Send).toHaveBeenCalled();
  });

  it('extracts the object key from the URL path (strips leading /)', async () => {
    const fakeBody = (async function* () { yield Buffer.from('x'); })();
    mockS3Send.mockResolvedValueOnce({ Body: fakeBody });

    await service.downloadImageFromUrl(
      'https://pub-xyz.r2.dev/receipts/u-5/my-receipt.jpg',
    );
    const getObjectArg = mockS3Send.mock.calls[0][0];
    expect(getObjectArg.Key).toBe('receipts/u-5/my-receipt.jpg');
  });

  it('throws when S3 returns no body', async () => {
    mockS3Send.mockResolvedValueOnce({ Body: null });
    await expect(
      service.downloadImageFromUrl('https://pub-abc.r2.dev/receipts/missing.jpg'),
    ).rejects.toThrow('no body');
  });
});
