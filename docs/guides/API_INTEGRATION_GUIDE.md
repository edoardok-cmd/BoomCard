# BoomCard Platform - API Integration Guide

## Overview
This guide provides complete instructions for integrating the BoomCard frontend with a backend API.

---

## Table of Contents
1. [Backend Setup](#backend-setup)
2. [API Endpoints](#api-endpoints)
3. [Authentication Flow](#authentication-flow)
4. [Data Models](#data-models)
5. [Frontend Integration](#frontend-integration)
6. [Error Handling](#error-handling)

---

## Backend Setup

### Recommended Stack
- **Framework:** NestJS (Node.js) or Express
- **Database:** PostgreSQL (via Supabase)
- **Authentication:** JWT + bcrypt
- **Storage:** Supabase Storage or AWS S3
- **Email:** SendGrid or AWS SES

### Supabase Setup

1. **Create Supabase Project**
```bash
# Install Supabase CLI
npm install -g supabase

# Initialize project
supabase init

# Start local development
supabase start
```

2. **Database Schema**

```sql
-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  avatar_url TEXT,
  role VARCHAR(20) DEFAULT 'user',
  email_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- BoomCards Table
CREATE TABLE boom_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_number VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'premium' or 'standard'
  venue_id UUID REFERENCES venues(id),
  discount INTEGER NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  usage_count INTEGER DEFAULT 0,
  usage_limit INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Venues Table
CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  logo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Offers Table
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  venue_id UUID REFERENCES venues(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  title_bg VARCHAR(255) NOT NULL,
  description TEXT,
  description_bg TEXT,
  discount INTEGER NOT NULL,
  original_price DECIMAL(10,2),
  discounted_price DECIMAL(10,2),
  image_url TEXT,
  valid_until TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reviews Table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  helpful_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Favorites Table
CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES offers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, offer_id)
);

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+359888123456"
}
```

**Response (201):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user",
    "emailVerified": false
  },
  "token": "jwt_token_here"
}
```

#### POST /api/auth/login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "user"
  },
  "token": "jwt_token_here"
}
```

#### POST /api/auth/forgot-password
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Password reset email sent"
}
```

#### POST /api/auth/reset-password
Reset password with token.

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "NewSecurePass123!"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

#### POST /api/auth/verify-email
Verify email address.

**Request Body:**
```json
{
  "token": "verification_token"
}
```

**Response (200):**
```json
{
  "message": "Email verified successfully"
}
```

### User Endpoints

#### GET /api/users/me
Get current user profile.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+359888123456",
  "avatar": "https://...",
  "role": "user",
  "emailVerified": true,
  "createdAt": "2025-01-15T10:00:00Z"
}
```

#### PATCH /api/users/me
Update user profile.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+359888999888"
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "user": { /* updated user object */ }
}
```

#### PATCH /api/users/me/password
Change password.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

**Response (200):**
```json
{
  "message": "Password changed successfully"
}
```

### BoomCards Endpoints

#### GET /api/cards
Get user's BoomCards.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "cards": [
    {
      "id": "uuid",
      "cardNumber": "BC-2024-001234",
      "type": "premium",
      "venueName": "Sense Hotel Sofia",
      "category": "hotels",
      "discount": 50,
      "validUntil": "2025-12-31T23:59:59Z",
      "usageCount": 3,
      "usageLimit": 10,
      "status": "active"
    }
  ]
}
```

#### POST /api/cards/:id/redeem
Redeem a BoomCard.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "message": "Card redeemed successfully",
  "remainingUses": 7
}
```

### Offers Endpoints

#### GET /api/offers
Get all offers with filters.

**Query Parameters:**
- `category` - Filter by category
- `location` - Filter by location
- `minDiscount` - Minimum discount percentage
- `search` - Search query
- `page` - Page number
- `limit` - Items per page

**Response (200):**
```json
{
  "offers": [
    {
      "id": "uuid",
      "title": "Spa Weekend in Bansko",
      "titleBg": "Спа уикенд в Банско",
      "description": "...",
      "category": "spa",
      "location": "Bansko",
      "discount": 40,
      "originalPrice": 500,
      "discountedPrice": 300,
      "imageUrl": "https://...",
      "venueName": "Bansko Spa Hotel",
      "validUntil": "2025-12-31",
      "rating": 4.5,
      "reviewCount": 128
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

#### GET /api/offers/:id
Get offer details.

**Response (200):**
```json
{
  "id": "uuid",
  "title": "Spa Weekend in Bansko",
  "description": "...",
  "discount": 40,
  "originalPrice": 500,
  "discountedPrice": 300,
  "images": ["url1", "url2"],
  "venue": {
    "id": "uuid",
    "name": "Bansko Spa Hotel",
    "phone": "+359...",
    "email": "info@...",
    "website": "https://..."
  },
  "reviews": [/* review objects */],
  "averageRating": 4.5,
  "totalReviews": 128
}
```

### Reviews Endpoints

#### POST /api/reviews
Create a review.

**Headers:** `Authorization: Bearer {token}`

**Request Body:**
```json
{
  "offerId": "uuid",
  "rating": 5,
  "comment": "Amazing experience!"
}
```

**Response (201):**
```json
{
  "message": "Review created successfully",
  "review": {
    "id": "uuid",
    "rating": 5,
    "comment": "Amazing experience!",
    "createdAt": "2025-01-15T10:00:00Z"
  }
}
```

#### GET /api/reviews/:offerId
Get reviews for an offer.

**Response (200):**
```json
{
  "reviews": [
    {
      "id": "uuid",
      "userName": "John Doe",
      "userInitials": "JD",
      "rating": 5,
      "comment": "Amazing experience!",
      "helpful": 12,
      "verified": true,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "averageRating": 4.5,
  "totalReviews": 128
}
```

### Notifications Endpoints

#### GET /api/notifications
Get user notifications.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "notifications": [
    {
      "id": "uuid",
      "type": "offer",
      "title": "New Offer Available",
      "message": "50% off at Sense Hotel Sofia",
      "read": false,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "unreadCount": 3
}
```

#### PATCH /api/notifications/:id/read
Mark notification as read.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "message": "Notification marked as read"
}
```

---

## Authentication Flow

### JWT Implementation

```typescript
// backend/src/auth/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
```

### Password Hashing

```typescript
import * as bcrypt from 'bcrypt';

export class AuthService {
  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePasswords(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
```

---

## Data Models

### TypeScript Interfaces

```typescript
// src/types/user.ts
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatar?: string;
  role: 'user' | 'partner' | 'admin';
  emailVerified: boolean;
  createdAt: number;
}

// src/types/boomcard.ts
export interface BoomCard {
  id: string;
  cardNumber: string;
  type: 'premium' | 'standard';
  venueName: string;
  category: string;
  discount: number;
  validUntil: number;
  usageCount: number;
  usageLimit: number;
  status: 'active' | 'expired' | 'suspended';
}

// src/types/offer.ts
export interface Offer {
  id: string;
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;
  category: string;
  location: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  imageUrl: string;
  validUntil: string;
  rating: number;
  reviewCount: number;
}
```

---

## Frontend Integration

### Update AuthContext

```typescript
// src/contexts/AuthContext.tsx
import api from '../lib/api';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const login = async (credentials: LoginCredentials) => {
    const { data } = await api.post('/auth/login', credentials);
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
  };

  const register = async (userData: RegisterData) => {
    const { data } = await api.post('/auth/register', userData);
    localStorage.setItem('auth_token', data.token);
    setUser(data.user);
  };

  // ... other methods
};
```

### Update API Calls

```typescript
// src/hooks/useOffers.ts
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

export const useOffers = (filters?: OfferFilters) => {
  return useQuery({
    queryKey: ['offers', filters],
    queryFn: async () => {
      const { data } = await api.get('/offers', { params: filters });
      return data.offers;
    },
  });
};
```

---

## Error Handling

### API Error Handler

```typescript
// src/lib/api.ts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || 'An error occurred';

    toast.error(message);

    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);
```

---

**Last Updated:** October 12, 2025
**API Version:** 1.0.0
**Status:** Integration Ready
