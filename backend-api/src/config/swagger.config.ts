/**
 * Swagger/OpenAPI Configuration
 * Interactive API documentation at /api-docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'BoomCard API',
      version: '1.0.0',
      description: `
        BoomCard API - QR Discount Card Platform for Bulgarian Venues

        ## Features
        - 🔐 JWT Authentication
        - 💳 Stripe Payment Integration
        - 🎫 Digital Discount Cards
        - 🧾 Receipt Scanning with OCR
        - 🏷️ QR Sticker System
        - 💰 Wallet & Cashback
        - 🎁 Loyalty & Rewards
        - 📧 Messaging System
        - 📊 Analytics & Reporting

        ## Authentication
        Most endpoints require authentication. Include your JWT token in the Authorization header:
        \`\`\`
        Authorization: Bearer YOUR_JWT_TOKEN
        \`\`\`

        ## Rate Limiting
        - Development: 1000 requests/minute
        - Production: 100 requests/minute per IP

        ## Error Responses
        All errors follow this format:
        \`\`\`json
        {
          "success": false,
          "error": "Error message",
          "message": "Detailed description"
        }
        \`\`\`
      `,
      contact: {
        name: 'BoomCard Support',
        email: 'support@boomcard.bg',
        url: 'https://boomcard.bg',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
      {
        url: 'https://boomcard-api.onrender.com',
        description: 'Production server',
      },
      {
        url: 'https://api.boomcard.bg',
        description: 'Production server (custom domain)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token obtained from /api/auth/login',
        },
      },
      schemas: {
        // ===== Authentication Schemas =====
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'user@boomcard.bg',
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'SecurePass123!',
            },
          },
        },
        RegisterRequest: {
          type: 'object',
          required: ['email', 'password', 'firstName', 'lastName'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'newuser@boomcard.bg',
            },
            password: {
              type: 'string',
              format: 'password',
              example: 'SecurePass123!',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            phone: {
              type: 'string',
              example: '+359888123456',
            },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            data: {
              type: 'object',
              properties: {
                user: {
                  $ref: '#/components/schemas/User',
                },
                token: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
                refreshToken: {
                  type: 'string',
                  example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          },
        },

        // ===== User Schemas =====
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'clx1234567890abcdef',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@boomcard.bg',
            },
            firstName: {
              type: 'string',
              example: 'John',
            },
            lastName: {
              type: 'string',
              example: 'Doe',
            },
            phone: {
              type: 'string',
              nullable: true,
              example: '+359888123456',
            },
            role: {
              type: 'string',
              enum: ['USER', 'PARTNER', 'ADMIN', 'SUPER_ADMIN'],
              example: 'USER',
            },
            isEmailVerified: {
              type: 'boolean',
              example: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-04T10:30:00.000Z',
            },
          },
        },

        // ===== Card Schemas =====
        Card: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'clx1234567890abcdef',
            },
            userId: {
              type: 'string',
              example: 'clx0987654321fedcba',
            },
            cardType: {
              type: 'string',
              enum: ['STANDARD', 'PREMIUM', 'PLATINUM'],
              example: 'PREMIUM',
            },
            cardNumber: {
              type: 'string',
              example: 'BC-2025-000123',
            },
            lastFourDigits: {
              type: 'string',
              example: '0123',
            },
            expiryDate: {
              type: 'string',
              format: 'date',
              example: '2026-01-04',
            },
            isActive: {
              type: 'boolean',
              example: true,
            },
          },
        },

        // ===== Receipt Schemas =====
        Receipt: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'clx1234567890abcdef',
            },
            userId: {
              type: 'string',
              example: 'clx0987654321fedcba',
            },
            venueId: {
              type: 'string',
              example: 'clx1111222233334444',
            },
            cardId: {
              type: 'string',
              example: 'clx5555666677778888',
            },
            amount: {
              type: 'number',
              example: 125.50,
            },
            cashbackAmount: {
              type: 'number',
              example: 12.55,
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'PROCESSING', 'VALIDATING', 'APPROVED', 'REJECTED', 'MANUAL_REVIEW'],
              example: 'APPROVED',
            },
            imageUrl: {
              type: 'string',
              nullable: true,
              example: 'https://s3.amazonaws.com/boomcard/receipts/receipt-123.jpg',
            },
            fraudScore: {
              type: 'number',
              example: 5.0,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2025-01-04T10:30:00.000Z',
            },
          },
        },

        // ===== Sticker Schemas =====
        Sticker: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'clx1234567890abcdef',
            },
            venueId: {
              type: 'string',
              example: 'clx1111222233334444',
            },
            stickerId: {
              type: 'string',
              example: 'BAR32-MASA04',
            },
            qrCode: {
              type: 'string',
              description: 'Base64 encoded QR code image',
              example: 'data:image/png;base64,iVBORw0KGgo...',
            },
            locationType: {
              type: 'string',
              enum: ['TABLE', 'COUNTER', 'BAR', 'ENTRANCE', 'TERRACE', 'VIP_ROOM'],
              example: 'TABLE',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'ACTIVE', 'INACTIVE', 'DAMAGED', 'RETIRED'],
              example: 'ACTIVE',
            },
            totalScans: {
              type: 'number',
              example: 42,
            },
          },
        },

        // ===== Wallet Schemas =====
        Wallet: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              example: 'clx1234567890abcdef',
            },
            userId: {
              type: 'string',
              example: 'clx0987654321fedcba',
            },
            balance: {
              type: 'number',
              example: 150.75,
            },
            currency: {
              type: 'string',
              example: 'BGN',
            },
            totalEarned: {
              type: 'number',
              example: 450.00,
            },
            totalSpent: {
              type: 'number',
              example: 299.25,
            },
          },
        },

        // ===== Payment Schemas =====
        PaymentIntent: {
          type: 'object',
          required: ['amount', 'currency'],
          properties: {
            amount: {
              type: 'number',
              example: 50.00,
              description: 'Amount in BGN',
            },
            currency: {
              type: 'string',
              example: 'BGN',
              default: 'BGN',
            },
            description: {
              type: 'string',
              example: 'Wallet top-up',
            },
          },
        },

        // ===== Error Schema =====
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'ValidationError',
            },
            message: {
              type: 'string',
              example: 'Email is required',
            },
          },
        },

        // ===== Success Schema =====
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully',
            },
          },
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication token is missing or invalid',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: 'Unauthorized',
                message: 'Invalid or expired token',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'User does not have required permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: 'Forbidden',
                message: 'You do not have permission to access this resource',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: 'Not Found',
                message: 'Resource not found',
              },
            },
          },
        },
        ValidationError: {
          description: 'Request validation failed',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: 'ValidationError',
                message: 'Invalid request parameters',
              },
            },
          },
        },
        ServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Error',
              },
              example: {
                success: false,
                error: 'InternalServerError',
                message: 'An unexpected error occurred',
              },
            },
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and registration',
      },
      {
        name: 'Users',
        description: 'User profile management',
      },
      {
        name: 'Cards',
        description: 'Digital discount card management',
      },
      {
        name: 'Receipts',
        description: 'Receipt scanning and validation',
      },
      {
        name: 'Stickers',
        description: 'QR sticker scanning system',
      },
      {
        name: 'Wallet',
        description: 'Wallet and balance management',
      },
      {
        name: 'Payments',
        description: 'Payment processing with Stripe',
      },
      {
        name: 'Offers',
        description: 'Venue offers and promotions',
      },
      {
        name: 'Venues',
        description: 'Venue management',
      },
      {
        name: 'Loyalty',
        description: 'Loyalty program and rewards',
      },
      {
        name: 'Bookings',
        description: 'Venue booking system',
      },
      {
        name: 'Reviews',
        description: 'Venue reviews and ratings',
      },
      {
        name: 'Messaging',
        description: 'In-app messaging system',
      },
      {
        name: 'Webhooks',
        description: 'Stripe webhook handlers',
      },
      {
        name: 'Health',
        description: 'Health check and monitoring',
      },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [
    './src/routes/*.ts', // Path to the API routes
    './src/routes/*.js',
    './dist/routes/*.js', // For production builds
  ],
};

// Generate Swagger specification
export const swaggerSpec = swaggerJsdoc(swaggerOptions);

/**
 * Setup Swagger UI in Express app
 */
export function setupSwagger(app: Express): void {
  // Swagger UI options
  const options: swaggerUi.SwaggerUiOptions = {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'BoomCard API Documentation',
    customfavIcon: '/favicon.ico',
  };

  // Serve Swagger documentation at /api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, options));

  // Serve raw OpenAPI JSON at /api-docs.json
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log('📚 Swagger documentation available at /api-docs');
}

export default {
  spec: swaggerSpec,
  setup: setupSwagger,
};
