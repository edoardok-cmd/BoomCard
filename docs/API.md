# API Documentation

## Base URL
```
Production: https://api.example.com
Development: http://localhost:3000
```

## Authentication
All API requests require authentication using JWT tokens.

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication
- `POST /auth/login` - User login
- `POST /auth/register` - User registration
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user

### Venues
- `GET /venues` - List venues
- `GET /venues/:id` - Get venue details
- `GET /venues/nearby` - Get nearby venues
- `GET /venues/search` - Search venues

### QR Codes
- `POST /qr/generate` - Generate QR code
- `POST /qr/validate` - Validate QR code
- `GET /qr/history` - Get QR code history

### Offers
- `GET /offers` - List offers
- `GET /offers/:id` - Get offer details
- `POST /offers/:id/redeem` - Redeem offer

## Response Format
```json
{
  "data": {},
  "message": "Success",
  "error": null
}
```

## Error Codes
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error
