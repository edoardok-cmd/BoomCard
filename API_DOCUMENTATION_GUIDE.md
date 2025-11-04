# API Documentation Guide - Swagger/OpenAPI

Complete guide for using and extending the BoomCard API documentation.

## Overview

BoomCard API uses **Swagger/OpenAPI 3.0** for interactive API documentation. The documentation is automatically generated from code annotations and provides a beautiful, interactive interface for testing endpoints.

**Live Documentation:** `http://localhost:3000/api-docs` (Development)
**Production:** `https://boomcard-api.onrender.com/api-docs`

---

## Accessing the Documentation

### Development Mode

1. Start the backend server:
   ```bash
   cd backend-api
   npm run dev
   ```

2. Open your browser:
   ```
   http://localhost:3000/api-docs
   ```

3. You should see the Swagger UI interface with:
   - List of all endpoints organized by tags
   - Request/response schemas
   - "Try it out" buttons for testing
   - Authentication section

### Production Mode

Visit: `https://boomcard-api.onrender.com/api-docs`

---

## Documentation Features

### Interactive Testing

1. Click **"Authorize"** button at the top
2. Enter your JWT token: `Bearer YOUR_TOKEN_HERE`
3. Click any endpoint
4. Click **"Try it out"**
5. Fill in parameters
6. Click **"Execute"**
7. See the real response!

### Code Examples

For each endpoint, Swagger provides:
- cURL command
- Request URL
- Response body
- Response headers

### Schema Browser

Click any schema name to see its structure:
- `User` - User object definition
- `Card` - Digital card schema
- `Receipt` - Receipt schema
- And more...

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│   backend-api/src/routes/*.routes.ts   │
│   (JSDoc comments with @swagger tags)  │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   src/config/swagger.config.ts          │
│   (Swagger configuration & schemas)     │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   swagger-jsdoc                         │
│   (Parses annotations & generates spec) │
└────────────┬────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────┐
│   swagger-ui-express                    │
│   (Renders interactive UI)              │
└─────────────────────────────────────────┘
```

### File Structure

```
backend-api/
├── src/
│   ├── config/
│   │   └── swagger.config.ts      # Swagger configuration
│   ├── routes/
│   │   ├── auth.routes.ts         # ✅ Has Swagger annotations
│   │   ├── stickers.routes.ts     # ⚠️  Needs annotations
│   │   ├── receipts.routes.ts     # ⚠️  Needs annotations
│   │   └── ...                    # ⚠️  Needs annotations
│   └── server.ts                  # Swagger setup
└── package.json                   # Swagger dependencies
```

---

## Adding Documentation to Routes

### Step 1: Add Swagger Comment Block

Before each route handler, add a JSDoc comment with `@swagger` tag:

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   post:
 *     summary: Brief description
 *     tags: [TagName]
 *     description: Detailed description
 *     security:
 *       - bearerAuth: []  # If authentication required
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *                 example: "value"
 *     responses:
 *       200:
 *         description: Success message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/your-endpoint', asyncHandler(async (req, res) => {
  // Your code here
}));
```

### Step 2: Use Schema References

Reuse existing schemas from `swagger.config.ts`:

```typescript
/**
 * @swagger
 * /api/cards:
 *   get:
 *     summary: Get user's cards
 *     tags: [Cards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Cards retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Card'
 */
```

### Step 3: Document Parameters

**Path Parameters:**
```typescript
/**
 * @swagger
 * /api/cards/{id}:
 *   get:
 *     summary: Get card by ID
 *     tags: [Cards]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Card ID
 */
```

**Query Parameters:**
```typescript
/**
 * @swagger
 * /api/receipts:
 *   get:
 *     summary: List receipts
 *     tags: [Receipts]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 */
```

---

## Complete Examples

### Example 1: Simple GET Endpoint

```typescript
/**
 * @swagger
 * /api/wallet/balance:
 *   get:
 *     summary: Get wallet balance
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *     description: Returns the current balance and transaction summary
 *     responses:
 *       200:
 *         description: Balance retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Wallet'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/balance', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  const balance = await walletService.getBalance(req.user!.id);
  res.json({ success: true, data: balance });
}));
```

### Example 2: POST with Request Body

```typescript
/**
 * @swagger
 * /api/stickers/scan:
 *   post:
 *     summary: Scan QR sticker
 *     tags: [Stickers]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Scan a venue's QR sticker to initiate cashback process.
 *       Requires GPS location for verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stickerId
 *               - cardId
 *               - billAmount
 *             properties:
 *               stickerId:
 *                 type: string
 *                 example: "BAR32-MASA04"
 *               cardId:
 *                 type: string
 *                 example: "clx1234567890"
 *               billAmount:
 *                 type: number
 *                 example: 125.50
 *               latitude:
 *                 type: number
 *                 example: 42.6977
 *               longitude:
 *                 type: number
 *                 example: 23.3219
 *     responses:
 *       200:
 *         description: Scan initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     scanId:
 *                       type: string
 *                     cashbackAmount:
 *                       type: number
 *                     status:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.post('/scan', authenticate, asyncHandler(async (req: AuthRequest, res) => {
  // Implementation...
}));
```

### Example 3: File Upload

```typescript
/**
 * @swagger
 * /api/receipts:
 *   post:
 *     summary: Upload receipt image
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipt:
 *                 type: string
 *                 format: binary
 *                 description: Receipt image (JPG, PNG, max 10MB)
 *               venueId:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Receipt uploaded successfully
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/', authenticate, upload.single('receipt'), asyncHandler(async (req, res) => {
  // Implementation...
}));
```

---

## Adding New Schemas

### Step 1: Add to swagger.config.ts

Edit `src/config/swagger.config.ts` and add to `components.schemas`:

```typescript
components: {
  schemas: {
    // ... existing schemas ...

    YourNewSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          example: 'clx1234567890',
        },
        name: {
          type: 'string',
          example: 'Example Name',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          example: '2025-01-04T10:30:00.000Z',
        },
      },
    },
  },
}
```

### Step 2: Reference in Routes

```typescript
/**
 * @swagger
 * /api/your-resource:
 *   get:
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/YourNewSchema'
 */
```

---

## Adding New Tags

Edit `swagger.config.ts` and add to `tags` array:

```typescript
tags: [
  // ... existing tags ...
  {
    name: 'YourNewTag',
    description: 'Description of this API group',
  },
],
```

Then use in routes:

```typescript
/**
 * @swagger
 * /api/your-endpoint:
 *   get:
 *     tags: [YourNewTag]
 */
```

---

## Best Practices

### 1. Consistent Naming

- Use clear, descriptive endpoint names
- Follow REST conventions (GET, POST, PUT, DELETE)
- Use plural nouns for collections: `/api/cards`, not `/api/card`

### 2. Comprehensive Examples

Always provide realistic examples:
```typescript
email: {
  type: 'string',
  format: 'email',
  example: 'user@boomcard.bg',  // ✅ Good
  example: 'test@test.com',     // ❌ Not realistic
}
```

### 3. Required Fields

Mark required fields:
```typescript
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: ['email', 'password']  // ✅
```

### 4. Error Responses

Always document error responses:
```typescript
responses:
  200:
    description: Success
  400:
    $ref: '#/components/responses/ValidationError'  // ✅
  401:
    $ref: '#/components/responses/UnauthorizedError'  // ✅
  404:
    $ref: '#/components/responses/NotFoundError'  // ✅
```

### 5. Security

Mark protected endpoints:
```typescript
security:
  - bearerAuth: []  // ✅ Requires authentication
```

### 6. Detailed Descriptions

Use the `description` field for details:
```typescript
description: |
  This endpoint does X, Y, and Z.

  ## Requirements
  - User must be authenticated
  - Card must be active
  - Venue must be within 100m

  ## Returns
  Cashback amount and transaction ID
```

---

## Testing Your Documentation

### 1. Check Syntax

```bash
npm run dev
```

Watch for errors like:
```
Error: Unable to parse swagger definition
```

### 2. View in Browser

Open `http://localhost:3000/api-docs`

### 3. Test Endpoints

1. Click "Authorize"
2. Enter JWT token
3. Try endpoints with "Try it out"
4. Verify responses match documentation

### 4. Export OpenAPI JSON

Download the spec:
```
http://localhost:3000/api-docs.json
```

Use this for:
- API clients (Postman, Insomnia)
- Code generation
- Testing tools

---

## Common Issues

### Issue: Documentation Not Updating

**Solution:**
1. Restart server: `Ctrl+C`, then `npm run dev`
2. Clear browser cache
3. Check for syntax errors in `@swagger` comments

### Issue: Schema Not Found

**Solution:**
1. Verify schema exists in `swagger.config.ts`
2. Check spelling: `#/components/schemas/User` (case-sensitive)
3. Restart server

### Issue: Authentication Not Working

**Solution:**
1. Get fresh JWT token from `/api/auth/login`
2. Click "Authorize" button
3. Enter: `Bearer YOUR_TOKEN`
4. Click "Authorize"
5. Close modal
6. Try endpoint again

### Issue: "Try it out" Returns CORS Error

**Solution:**
Add to `swagger.config.ts`:
```typescript
servers: [
  {
    url: 'http://localhost:3000',  // Must match your server
  },
],
```

---

## Customization

### Change Theme

Edit `swagger.config.ts`:

```typescript
const options: swaggerUi.SwaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none; }
    .swagger-ui .info .title { color: #667eea; }
  `,
};
```

### Add Logo

```typescript
const options: swaggerUi.SwaggerUiOptions = {
  customSiteTitle: 'BoomCard API',
  customfavIcon: '/favicon.ico',
  customCss: `
    .swagger-ui .topbar {
      background: url('/logo.png') no-repeat;
    }
  `,
};
```

---

## Roadmap

### Current Status: 10% Complete

- ✅ Swagger configuration
- ✅ Basic auth endpoints documented
- ⚠️  Other routes need annotations

### To Do:

1. **Stickers Routes** (20 endpoints) - Priority: HIGH
2. **Receipts Routes** (15 endpoints) - Priority: HIGH
3. **Wallet Routes** (10 endpoints) - Priority: MEDIUM
4. **Payments Routes** (13 endpoints) - Priority: HIGH
5. **Cards Routes** (8 endpoints) - Priority: MEDIUM
6. **Loyalty Routes** (stubs) - Priority: LOW
7. **Messaging Routes** (stubs) - Priority: LOW

---

## Resources

- [OpenAPI 3.0 Spec](https://swagger.io/specification/)
- [Swagger Editor](https://editor.swagger.io/) - Test your schemas
- [Swagger UI Docs](https://swagger.io/docs/open-source-tools/swagger-ui/)
- [JSDoc Guide](https://jsdoc.app/)

---

## Support

**Questions?** Contact the development team:
- GitHub Issues: https://github.com/your-repo/issues
- Email: dev@boomcard.bg

---

**Last Updated:** 2025-01-04
**Version:** 1.0.0
**Status:** In Progress (10% Complete)
