export interface Venue {
  id: string;
  name: string;
  description: string;
  category: VenueCategory;
  location: Location;
  images: string[];
  rating: number;
  reviewCount: number;
  features: string[];
  operatingHours: OperatingHours;
  isActive: boolean;
}

export interface VenueCategory {
  id: string;
  name: string;
  icon: string;
}

export interface OperatingHours {
  [key: string]: {
    open: string;
    close: string;
    isClosed: boolean;
  };
}

export interface Offer {
  id: string;
  venueId: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  validFrom: Date;
  validUntil: Date;
  termsAndConditions: string;
  maxRedemptions?: number;
  currentRedemptions: number;
}

export interface QRCode {
  id: string;
  code: string;
  venueId: string;
  offerId: string;
  userId: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

export interface Transaction {
  id: string;
  userId: string;
  venueId: string;
  offerId: string;
  qrCodeId: string;
  amount: number;
  discount: number;
  finalAmount: number;
  status: TransactionStatus;
  createdAt: Date;
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}