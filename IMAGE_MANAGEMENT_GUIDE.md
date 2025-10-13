# Image Management Guide

Complete guide for managing venue, partner, and offer images in BoomCard Partner Dashboard.

## Table of Contents

1. [Overview](#overview)
2. [ImageUpload Component](#imageupload-component)
3. [Usage Examples](#usage-examples)
4. [Integration with Backend](#integration-with-backend)
5. [Best Practices](#best-practices)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The image management system provides a complete solution for:
- Uploading single or multiple images
- Drag-and-drop functionality
- Image preview before upload
- Progress tracking
- File validation (size, format, count)
- Bilingual support (EN/BG)
- Managing existing images (view, delete)

### Key Features

✅ **Drag & Drop** - Intuitive drag-and-drop interface
✅ **Validation** - File size, format, and count validation
✅ **Preview** - See images before uploading
✅ **Progress** - Real-time upload progress tracking
✅ **Bilingual** - Full EN/BG language support
✅ **Responsive** - Works on desktop and mobile
✅ **Error Handling** - Clear error messages

---

## ImageUpload Component

### Location
```
src/components/common/ImageUpload/ImageUpload.tsx
```

### Props

```typescript
interface ImageUploadProps {
  // REQUIRED: Function to handle upload
  onUpload: (files: File[]) => Promise<void>;

  // OPTIONAL: Upload configuration
  multiple?: boolean;              // Allow multiple files (default: true)
  maxFiles?: number;               // Max number of files (default: 10)
  maxSizeMB?: number;             // Max size per file in MB (default: 5)
  acceptedFormats?: string[];     // Accepted MIME types (default: ['image/jpeg', 'image/png', 'image/webp'])

  // OPTIONAL: Existing images management
  existingImages?: string[];      // Array of existing image URLs
  onRemoveExisting?: (imageUrl: string) => void;  // Handler for removing existing images

  // OPTIONAL: Styling
  className?: string;             // Additional CSS class
}
```

### Default Configuration

```typescript
{
  multiple: true,
  maxFiles: 10,
  maxSizeMB: 5,
  acceptedFormats: ['image/jpeg', 'image/png', 'image/webp']
}
```

---

## Usage Examples

### 1. Basic Venue Image Upload

```typescript
import ImageUpload from '../components/common/ImageUpload/ImageUpload';
import { venuesService } from '../services/venues.service';

function VenueImagesPage() {
  const venueId = 'venue-123';

  const handleUpload = async (files: File[]) => {
    // Upload to backend
    const imageUrls = await venuesService.uploadImages(venueId, files);
    console.log('Uploaded:', imageUrls);
  };

  return (
    <ImageUpload
      onUpload={handleUpload}
      maxFiles={10}
      maxSizeMB={5}
    />
  );
}
```

### 2. Partner Logo Upload (Single Image)

```typescript
import ImageUpload from '../components/common/ImageUpload/ImageUpload';
import { partnersService } from '../services/partners.service';

function PartnerLogoUpload() {
  const partnerId = 'partner-123';

  const handleUpload = async (files: File[]) => {
    // Only use first file for logo
    const logoUrl = await partnersService.uploadLogo(partnerId, files[0]);
    console.log('Logo uploaded:', logoUrl);
  };

  return (
    <ImageUpload
      onUpload={handleUpload}
      multiple={false}        // Single file only
      maxFiles={1}            // Only 1 file
      maxSizeMB={2}           // Smaller size for logos
    />
  );
}
```

### 3. Managing Existing Images

```typescript
import { useState } from 'react';
import ImageUpload from '../components/common/ImageUpload/ImageUpload';
import { venuesService } from '../services/venues.service';
import { useVenue } from '../hooks/useVenues';

function VenueImagesManager() {
  const venueId = 'venue-123';
  const { data: venue, refetch } = useVenue(venueId);

  const handleUpload = async (files: File[]) => {
    await venuesService.uploadImages(venueId, files);
    refetch(); // Refresh venue data
  };

  const handleRemoveExisting = async (imageUrl: string) => {
    await venuesService.deleteImage(venueId, imageUrl);
    refetch(); // Refresh venue data
  };

  return (
    <ImageUpload
      onUpload={handleUpload}
      existingImages={venue?.images || []}
      onRemoveExisting={handleRemoveExisting}
      maxFiles={15}
    />
  );
}
```

### 4. Custom Validation

```typescript
import ImageUpload from '../components/common/ImageUpload/ImageUpload';

function CustomValidationExample() {
  const handleUpload = async (files: File[]) => {
    // Additional custom validation
    for (const file of files) {
      // Check aspect ratio
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(resolve => img.onload = resolve);

      const aspectRatio = img.width / img.height;
      if (aspectRatio < 1.2 || aspectRatio > 1.8) {
        throw new Error('Images must have aspect ratio between 1.2:1 and 1.8:1');
      }
    }

    // Proceed with upload
    // ... upload logic
  };

  return (
    <ImageUpload
      onUpload={handleUpload}
      maxFiles={5}
      maxSizeMB={3}
      acceptedFormats={['image/jpeg', 'image/png']} // Only JPEG and PNG
    />
  );
}
```

### 5. Complete Example with Full Page

See the complete working example:
```
src/pages/VenueImagesUploadPage.EXAMPLE.tsx
```

This example shows:
- Loading venue data
- Displaying existing images
- Uploading new images
- Deleting images
- Success/error messages
- Bilingual support
- Navigation

---

## Integration with Backend

### Venue Images

```typescript
// services/venues.service.ts

class VenuesService {
  /**
   * Upload venue images
   * @param venueId - The venue ID
   * @param files - Array of image files
   * @returns Array of uploaded image URLs
   */
  async uploadImages(venueId: string, files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const response = await fetch(
      `${this.baseURL}/venues/${venueId}/images`,
      {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) throw new Error('Failed to upload images');
    return response.json();
  }

  /**
   * Delete venue image
   * @param venueId - The venue ID
   * @param imageUrl - The image URL to delete
   */
  async deleteImage(venueId: string, imageUrl: string): Promise<void> {
    return apiService.delete(`/venues/${venueId}/images`, {
      data: { imageUrl }
    });
  }
}
```

### Partner Logo

```typescript
// services/partners.service.ts

class PartnersService {
  /**
   * Upload partner logo
   * @param partnerId - The partner ID
   * @param file - Logo image file
   * @returns URL of uploaded logo
   */
  async uploadLogo(partnerId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('logo', file);

    const response = await fetch(
      `${this.baseURL}/partners/${partnerId}/logo`,
      {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) throw new Error('Failed to upload logo');
    const data = await response.json();
    return data.logoUrl;
  }
}
```

### Offer Images

```typescript
// services/offers.service.ts

class OffersService {
  /**
   * Upload offer image
   * @param offerId - The offer ID
   * @param file - Image file
   * @returns URL of uploaded image
   */
  async uploadImage(offerId: string, file: File): Promise<string> {
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(
      `${this.baseURL}/offers/${offerId}/image`,
      {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      }
    );

    if (!response.ok) throw new Error('Failed to upload image');
    const data = await response.json();
    return data.imageUrl;
  }
}
```

### React Query Integration

```typescript
// hooks/useVenues.ts

export function useUploadVenueImages(venueId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: File[]) => venuesService.uploadImages(venueId, files),
    onSuccess: () => {
      // Invalidate and refetch venue data
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] });
      queryClient.invalidateQueries({ queryKey: ['venues'] });
    },
  });
}
```

---

## Best Practices

### 1. Image Optimization

**Recommended Specifications:**
- **Format:** JPEG for photos, PNG for graphics, WebP for best compression
- **Size:** Max 5MB per file (adjust based on needs)
- **Dimensions:**
  - Venue photos: 1920x1080 or 1600x900 (16:9)
  - Partner logos: 512x512 (1:1)
  - Offer images: 1200x800 (3:2)
- **Quality:** 80-90% JPEG quality

**Client-side Optimization:**
```typescript
// Optional: Add image compression before upload
import imageCompression from 'browser-image-compression';

const handleUpload = async (files: File[]) => {
  const compressedFiles = await Promise.all(
    files.map(file =>
      imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      })
    )
  );

  await venuesService.uploadImages(venueId, compressedFiles);
};
```

### 2. Error Handling

```typescript
const handleUpload = async (files: File[]) => {
  try {
    await venuesService.uploadImages(venueId, files);
    showSuccessMessage('Images uploaded successfully');
  } catch (error) {
    if (error.response?.status === 413) {
      showErrorMessage('File too large. Please upload smaller images.');
    } else if (error.response?.status === 415) {
      showErrorMessage('Unsupported file format.');
    } else if (error.response?.status === 403) {
      showErrorMessage('You do not have permission to upload images.');
    } else {
      showErrorMessage('Upload failed. Please try again.');
    }
  }
};
```

### 3. Progressive Enhancement

```typescript
// Check for drag-and-drop support
const supportsDragAndDrop = 'draggable' in document.createElement('div');

// Fallback to file input only
{supportsDragAndDrop ? (
  <ImageUpload onUpload={handleUpload} />
) : (
  <input type="file" multiple onChange={handleFileInput} />
)}
```

### 4. Security

**Backend Validation (Required):**
- Validate file type on server
- Check file size on server
- Scan for malware
- Generate unique filenames
- Store in secure location
- Implement rate limiting

**Frontend Validation (User Experience):**
- Pre-validate before upload
- Show clear error messages
- Prevent duplicate uploads

### 5. Performance

**Lazy Loading:**
```typescript
// Lazy load images in grid
<img
  src={imageUrl}
  loading="lazy"
  alt="Venue photo"
/>
```

**Thumbnail Generation:**
```typescript
// Generate thumbnails on backend
const thumbnailUrl = imageUrl.replace('/images/', '/thumbnails/');
```

**Chunked Upload (for large files):**
```typescript
// Upload in chunks for files > 10MB
const chunkSize = 1024 * 1024; // 1MB chunks
// ... implement chunked upload
```

---

## Troubleshooting

### Issue: Images not uploading

**Possible Causes:**
1. File too large
2. Network error
3. Invalid authentication token
4. Backend not accepting multipart/form-data

**Solutions:**
```typescript
// Check file size
console.log('File size:', file.size / 1024 / 1024, 'MB');

// Check authentication
console.log('Token:', localStorage.getItem('token'));

// Check request
console.log('FormData:', Array.from(formData.entries()));

// Check backend logs
// Verify CORS settings
// Verify file upload middleware
```

### Issue: Preview not showing

**Possible Causes:**
1. FileReader API not supported
2. File format not supported by browser
3. Memory issues with large files

**Solutions:**
```typescript
// Check FileReader support
if (!window.FileReader) {
  console.error('FileReader not supported');
}

// Check file type
console.log('File type:', file.type);

// Use smaller images for preview
// Implement image compression
```

### Issue: Drag and drop not working

**Possible Causes:**
1. Event handlers not preventing default
2. CSS pointer-events interfering
3. Browser compatibility

**Solutions:**
```typescript
// Ensure preventDefault on all drag events
const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

// Check CSS
// pointer-events: auto; (not none)

// Test in different browsers
```

### Issue: Upload slow

**Possible Causes:**
1. Large file sizes
2. Slow network
3. Backend processing

**Solutions:**
- Implement client-side compression
- Show progress bar
- Upload in parallel (if supported)
- Use CDN for uploads
- Implement resumable uploads

---

## Next Steps

1. **Replace all Unsplash images:**
   - Update all pages using Unsplash URLs
   - Replace with uploaded images
   - Update database records

2. **Add image optimization:**
   - Install `browser-image-compression` package
   - Integrate compression before upload
   - Generate thumbnails on backend

3. **Implement CDN:**
   - Set up Cloudinary, AWS S3, or similar
   - Update upload service
   - Implement image transformations

4. **Add advanced features:**
   - Image cropping tool
   - Filters and adjustments
   - Bulk upload
   - Image gallery management

---

## Additional Resources

- [MDN: File API](https://developer.mozilla.org/en-US/docs/Web/API/File)
- [MDN: Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)
- [browser-image-compression](https://www.npmjs.com/package/browser-image-compression)
- [React Query: Mutations](https://tanstack.com/query/latest/docs/react/guides/mutations)

---

**Created:** 2025-10-13
**Last Updated:** 2025-10-13
**Version:** 1.0.0
