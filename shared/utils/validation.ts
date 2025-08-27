import { z } from 'zod';

export const emailSchema = z.string().email('Invalid email format');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const phoneSchema = z
  .string()
  .regex(/^(\+359|0)\d{9}$/, 'Invalid Bulgarian phone number');

export const userRegistrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: phoneSchema.optional(),
});

export const venueSchema = z.object({
  name: z.string().min(2, 'Venue name is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.string().uuid('Invalid category'),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    address: z.string().min(5, 'Address is required'),
  }),
});

export const offerSchema = z.object({
  title: z.string().min(5, 'Title is required'),
  description: z.string().min(10, 'Description is required'),
  discountType: z.enum(['percentage', 'fixed']),
  discountValue: z.number().positive('Discount must be positive'),
  validFrom: z.date(),
  validUntil: z.date(),
}).refine((data) => data.validUntil > data.validFrom, {
  message: 'End date must be after start date',
});