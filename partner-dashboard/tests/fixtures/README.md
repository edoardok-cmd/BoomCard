# Test Fixtures

This directory contains test fixtures (sample files) used in E2E tests.

## Files

### test-receipt.png

A sample receipt image used for testing OCR functionality and receipt upload.

**Usage:**
- Receipt scanning E2E tests
- Upload functionality tests
- OCR processing tests

**How to create:**
You can create a test receipt image using any graphics tool or take a photo of a real receipt. The image should contain:
- Merchant name
- Total amount
- Date
- Some line items

**Recommended size:** 800x1200px or actual photo resolution

### test-document.txt

A sample text file used for testing file type validation.

**Usage:**
- File upload validation tests
- File type restriction tests

**Content:**
```
This is a test document file.
It should be rejected when uploading receipts
because only images (PNG, JPG) are accepted.
```

## Adding New Fixtures

To add new test fixtures:

1. Create the file in this directory
2. Update this README with the fixture description
3. Reference the fixture in your test files:

```typescript
const filePath = path.join(__dirname, '../fixtures/your-fixture-file.ext');
```

## Best Practices

- Keep fixture files small (< 1MB)
- Use realistic sample data
- Don't commit sensitive or real user data
- Document the purpose of each fixture
- Use descriptive file names
