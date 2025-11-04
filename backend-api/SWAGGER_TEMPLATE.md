# Swagger/OpenAPI Documentation Templates

Copy/paste these templates when adding documentation to route files.

## Template 1: GET Endpoint (No Parameters)

```typescript
/**
 * @swagger
 * /api/resource:
 *   get:
 *     summary: Get all resources
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Returns a list of all resources for the authenticated user
 *     responses:
 *       200:
 *         description: Resources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ResourceSchema'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/resource', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 2: GET with Path Parameter

```typescript
/**
 * @swagger
 * /api/resource/{id}:
 *   get:
 *     summary: Get resource by ID
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Returns a single resource by its ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource unique identifier
 *         example: clx1234567890abcdef
 *     responses:
 *       200:
 *         description: Resource found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ResourceSchema'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.get('/resource/:id', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 3: GET with Query Parameters

```typescript
/**
 * @swagger
 * /api/resource:
 *   get:
 *     summary: List resources with filters
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Get paginated list of resources with optional filtering
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, PENDING]
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *         description: Number of items to skip
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search query
 *     responses:
 *       200:
 *         description: Resources retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ResourceSchema'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 */
router.get('/resource', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 4: POST (Create Resource)

```typescript
/**
 * @swagger
 * /api/resource:
 *   post:
 *     summary: Create new resource
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Create a new resource with provided data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - field1
 *               - field2
 *             properties:
 *               field1:
 *                 type: string
 *                 description: Description of field1
 *                 example: "value1"
 *               field2:
 *                 type: number
 *                 description: Description of field2
 *                 example: 123
 *               field3:
 *                 type: string
 *                 description: Optional field
 *                 example: "optional value"
 *     responses:
 *       201:
 *         description: Resource created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Resource created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ResourceSchema'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.post('/resource', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 5: PUT (Update Resource)

```typescript
/**
 * @swagger
 * /api/resource/{id}:
 *   put:
 *     summary: Update resource
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Update an existing resource by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *               field2:
 *                 type: number
 *     responses:
 *       200:
 *         description: Resource updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ResourceSchema'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
router.put('/resource/:id', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 6: PATCH (Partial Update)

```typescript
/**
 * @swagger
 * /api/resource/{id}:
 *   patch:
 *     summary: Partially update resource
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Update specific fields of a resource
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               field1:
 *                 type: string
 *                 description: Optional field to update
 *     responses:
 *       200:
 *         description: Resource updated
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 */
router.patch('/resource/:id', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 7: DELETE

```typescript
/**
 * @swagger
 * /api/resource/{id}:
 *   delete:
 *     summary: Delete resource
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Permanently delete a resource by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource ID to delete
 *     responses:
 *       200:
 *         description: Resource deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       404:
 *         $ref: '#/components/responses/NotFoundError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.delete('/resource/:id', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 8: File Upload

```typescript
/**
 * @swagger
 * /api/resource/upload:
 *   post:
 *     summary: Upload file
 *     tags: [ResourceTag]
 *     security:
 *       - bearerAuth: []
 *     description: Upload a file (image, PDF, etc.)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File to upload (max 10MB)
 *               description:
 *                 type: string
 *                 description: Optional description
 *     responses:
 *       200:
 *         description: File uploaded successfully
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
 *                     url:
 *                       type: string
 *                       example: "https://s3.amazonaws.com/bucket/file.jpg"
 *                     size:
 *                       type: integer
 *                       example: 1024000
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 9: Admin-Only Endpoint

```typescript
/**
 * @swagger
 * /api/admin/resource:
 *   get:
 *     summary: Get all resources (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Retrieve all resources across all users.
 *       **Requires ADMIN or SUPER_ADMIN role.**
 *     responses:
 *       200:
 *         description: Resources retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResourceSchema'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         $ref: '#/components/responses/ForbiddenError'
 */
router.get('/admin/resource', authenticate, requireRole(['ADMIN', 'SUPER_ADMIN']), asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 10: Public Endpoint (No Auth)

```typescript
/**
 * @swagger
 * /api/public/resource:
 *   get:
 *     summary: Get public resources
 *     tags: [Public]
 *     description: Retrieve publicly available resources without authentication
 *     responses:
 *       200:
 *         description: Resources retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ResourceSchema'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/public/resource', asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Template 11: Complex Response

```typescript
/**
 * @swagger
 * /api/analytics/summary:
 *   get:
 *     summary: Get analytics summary
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *     responses:
 *       200:
 *         description: Analytics retrieved
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
 *                     period:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                         days:
 *                           type: integer
 *                     totals:
 *                       type: object
 *                       properties:
 *                         revenue:
 *                           type: number
 *                         transactions:
 *                           type: integer
 *                         customers:
 *                           type: integer
 *                     charts:
 *                       type: object
 *                       properties:
 *                         daily:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                               value:
 *                                 type: number
 */
router.get('/analytics/summary', authenticate, asyncHandler(async (req, res) => {
  // Implementation
}));
```

## Quick Reference

### HTTP Methods
- `get` - Retrieve data
- `post` - Create new resource
- `put` - Full update
- `patch` - Partial update
- `delete` - Remove resource

### Common Tags
- `Authentication` - Login, register, tokens
- `Users` - User management
- `Cards` - Card operations
- `Receipts` - Receipt scanning
- `Stickers` - QR sticker system
- `Wallet` - Balance, transactions
- `Payments` - Stripe integration
- `Offers` - Venue offers
- `Loyalty` - Rewards program
- `Admin` - Admin-only endpoints
- `Public` - Public endpoints

### Common Schemas
- `User` - User object
- `Card` - Digital card
- `Receipt` - Receipt with OCR data
- `Sticker` - QR sticker
- `Wallet` - Wallet balance
- `Error` - Error response
- `Success` - Success response

### Common Responses
- `200` - Success
- `201` - Created
- `400` - Validation error
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `500` - Server error

### Response References
- `$ref: '#/components/responses/UnauthorizedError'`
- `$ref: '#/components/responses/ForbiddenError'`
- `$ref: '#/components/responses/NotFoundError'`
- `$ref: '#/components/responses/ValidationError'`
- `$ref: '#/components/responses/ServerError'`

### Schema References
- `$ref: '#/components/schemas/User'`
- `$ref: '#/components/schemas/Card'`
- `$ref: '#/components/schemas/Receipt'`
- `$ref: '#/components/schemas/Sticker'`
- `$ref: '#/components/schemas/Wallet'`
- `$ref: '#/components/schemas/Error'`
- `$ref: '#/components/schemas/Success'`

---

## Usage

1. Copy the appropriate template
2. Replace placeholders:
   - `resource` → your resource name
   - `ResourceTag` → your tag name
   - `ResourceSchema` → your schema name
   - `field1`, `field2` → your field names
3. Update descriptions and examples
4. Test at `http://localhost:3000/api-docs`

---

**Need help?** See API_DOCUMENTATION_GUIDE.md for detailed instructions.
