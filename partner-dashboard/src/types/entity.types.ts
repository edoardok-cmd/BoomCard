// ============================================================
// Unified Entity Data Model
// Single source of truth for all card/place/partner/experience data
// ============================================================

// --- Bilingual text ---
export interface BilingualText {
  en: string;
  bg: string;
}

// --- Structured location ---
export interface EntityLocation {
  /** Display string for card rendering (e.g. "Sofia, Vitosha Blvd") */
  display: string;
  displayBg?: string;
  city?: string;
  district?: string;
  address?: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// --- Structured working hours ---
export interface DayHours {
  open: string;   // "09:00"
  close: string;  // "22:00"
  closed?: boolean;
}

export interface WorkingHours {
  /** Display string for card rendering */
  display?: string;
  displayBg?: string;
  /** Structured per-day hours for detail views / open-now logic */
  schedule?: {
    [day: string]: DayHours; // mon, tue, wed, thu, fri, sat, sun
  };
}

// --- Images ---
export interface EntityImages {
  /** Primary image for card hero */
  hero: string;
  /** Optional gallery for detail view */
  gallery?: string[];
}

// --- Contact info ---
export interface EntityContact {
  phone?: string;
  email?: string;
  website?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
}

// --- Discount / offer info ---
export interface EntityDiscount {
  /** Percentage discount (0-100) */
  percent: number;
  /** Reference original price (for display) */
  originalPrice?: number;
  /** Calculated discounted price */
  discountedPrice?: number;
  /** Terms and conditions */
  terms?: string;
  termsBg?: string;
  /** Validity window */
  validFrom?: string;
  validUntil?: string;
}

// --- Experience-specific metadata ---
export type ExperienceDuration = 'up-to-2h' | '2-4h' | 'half-day' | 'full-day' | 'multi-day';
export type ExperienceType = 'group' | 'private' | 'vip';
export type ExperienceAvailability = 'today' | 'this-week' | 'always' | string[];

export interface ExperienceMetadata {
  /** Duration bucket for filtering */
  duration: ExperienceDuration;
  /** Human-readable duration string, bilingual */
  durationDisplay: BilingualText;
  /** group | private | vip */
  type: ExperienceType;
  /** Languages the experience is offered in */
  languages?: string[];
  /** Availability indicator */
  availability?: ExperienceAvailability;
  /** Minimum group size */
  minGroupSize?: number;
  /** Maximum group size */
  maxGroupSize?: number;
  /** Season suitability */
  season?: string;
  /** Format of the experience */
  format?: string;
  /** Numeric price in base currency (for filtering/sorting) */
  price: number;
  /** Currency code (default EUR) */
  currency?: string;
  /** Provider/venue ID for booking */
  venueId: string;
  /** Provider partner ID for commission calc */
  partnerId: string;
}

// --- Price range ---
export type PriceRange = 'budget' | 'mid-range' | 'premium' | 'luxury';

// --- Partner status ---
export type PartnerStatus = 'new' | 'regular' | 'vip' | 'exclusive';

// --- Entity kind (discriminator) ---
export type EntityKind = 'place' | 'experience' | 'partner' | 'offer';

// ============================================================
// UNIFIED ENTITY
// ============================================================
export interface Entity {
  id: string;
  kind: EntityKind;

  // Names (bilingual)
  name: BilingualText;

  // Description (bilingual, short for card)
  description: BilingualText;

  // Category
  /** Category ID that maps to the shared category registry */
  categoryId: string;
  /** Display category name (bilingual) for rendering */
  category: BilingualText;
  /** Subcategory IDs */
  subcategoryIds?: string[];
  /** Freeform tags for card display (max 2 shown on card) */
  tags?: BilingualText[];

  // Location
  location: EntityLocation;

  // Images
  images: EntityImages;

  // Working hours (if applicable)
  workingHours?: WorkingHours;

  // Contact info
  contact?: EntityContact;

  // Discount (if applicable)
  discount?: EntityDiscount;

  // Pricing tier
  priceRange?: PriceRange;

  // Rating (external, e.g. Google Maps)
  rating?: number;
  reviewCount?: number;

  // Partner info
  partnerId?: string;
  partnerName?: BilingualText;
  partnerStatus?: PartnerStatus;
  partnerTypeId?: string;
  partnerType?: { id: string; name: string; nameBg?: string; color: string; maxDiscountRate: number };

  // Experience-specific metadata (only for kind === 'experience')
  experience?: ExperienceMetadata;

  // Navigation
  /** URL path for this entity's detail page */
  path: string;

  // Metadata
  isFeatured?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================
// CARD PROJECTION - minimal fields for OfferCard rendering
// ============================================================
export type CardEntity = Pick<Entity,
  | 'id'
  | 'kind'
  | 'name'
  | 'description'
  | 'category'
  | 'tags'
  | 'location'
  | 'images'
  | 'discount'
  | 'rating'
  | 'reviewCount'
  | 'workingHours'
  | 'path'
  | 'partnerName'
  | 'experience'
>;

// ============================================================
// FAVORITE ENTITY - what gets persisted to localStorage
// ============================================================
export interface FavoriteEntity {
  id: string;
  name: BilingualText;
  category: BilingualText;
  location: EntityLocation;
  discount?: EntityDiscount;
  images: EntityImages;
  path: string;
  addedAt: number;
}

// ============================================================
// LEGACY OFFER - backward compatibility
// ============================================================

/** @deprecated Use Entity or CardEntity instead */
export interface Offer {
  id: string;
  title: string;
  titleBg: string;
  description: string;
  descriptionBg: string;
  category: string;
  categoryBg: string;
  location: string;
  discount: number;
  originalPrice: number;
  discountedPrice: number;
  imageUrl: string;
  partnerName: string;
  rating?: number;
  reviewCount?: number;
  workingHours?: string;
  workingHoursBg?: string;
  path: string;
}

// ============================================================
// CONVERSION UTILITIES
// ============================================================

/** Convert a legacy Offer to the new Entity format */
export function offerToEntity(offer: Offer): Entity {
  return {
    id: offer.id,
    kind: 'offer',
    name: { en: offer.title, bg: offer.titleBg },
    description: { en: offer.description, bg: offer.descriptionBg },
    categoryId: offer.category.toLowerCase().replace(/\s+/g, '-'),
    category: { en: offer.category, bg: offer.categoryBg },
    location: {
      display: offer.location,
    },
    images: {
      hero: offer.imageUrl,
    },
    discount: {
      percent: offer.discount,
      originalPrice: offer.originalPrice,
      discountedPrice: offer.discountedPrice,
    },
    rating: offer.rating,
    reviewCount: offer.reviewCount,
    workingHours: offer.workingHours
      ? { display: offer.workingHours, displayBg: offer.workingHoursBg }
      : undefined,
    partnerName: { en: offer.partnerName, bg: offer.partnerName },
    partnerTypeId: (offer as any).partner?.partnerTypeId,
    partnerType: (offer as any).partner?.partnerType,
    path: offer.path,
  };
}

/** Convert an Entity back to the legacy Offer format */
export function entityToOffer(entity: Entity): Offer {
  return {
    id: entity.id,
    title: entity.name.en,
    titleBg: entity.name.bg,
    description: entity.description.en,
    descriptionBg: entity.description.bg,
    category: entity.category.en,
    categoryBg: entity.category.bg,
    location: entity.location.display,
    discount: entity.discount?.percent ?? 0,
    originalPrice: entity.discount?.originalPrice ?? 0,
    discountedPrice: entity.discount?.discountedPrice ?? 0,
    imageUrl: entity.images.hero,
    partnerName: entity.partnerName?.en ?? '',
    rating: entity.rating,
    reviewCount: entity.reviewCount,
    workingHours: entity.workingHours?.display,
    workingHoursBg: entity.workingHours?.displayBg,
    path: entity.path,
  };
}

/** Convert a Venue (from venues.service.ts) to Entity */
export function venueToEntity(venue: {
  id: string;
  name: string;
  nameEn?: string;
  nameBg?: string;
  description: string;
  descriptionEn?: string;
  descriptionBg?: string;
  category: string;
  categoryEn?: string;
  categoryBg?: string;
  location: string;
  city: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  imageUrl: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  priceRange?: PriceRange;
  amenities?: string[];
  openingHours?: { [key: string]: { open: string; close: string } };
  isOpen?: boolean;
  partnerId?: string;
  partnerName?: string;
  partnerStatus?: PartnerStatus;
  createdAt?: string;
  updatedAt?: string;
}): Entity {
  return {
    id: venue.id,
    kind: 'place',
    name: {
      en: venue.nameEn || venue.name,
      bg: venue.nameBg || venue.name,
    },
    description: {
      en: venue.descriptionEn || venue.description,
      bg: venue.descriptionBg || venue.description,
    },
    categoryId: (venue.categoryEn || venue.category || '').toLowerCase().replace(/\s+/g, '-'),
    category: {
      en: venue.categoryEn || venue.category,
      bg: venue.categoryBg || venue.category,
    },
    location: {
      display: venue.location,
      city: venue.city,
      address: venue.address,
      coordinates: venue.coordinates,
    },
    images: {
      hero: venue.imageUrl,
      gallery: venue.images,
    },
    workingHours: venue.openingHours
      ? { schedule: venue.openingHours as WorkingHours['schedule'] }
      : undefined,
    priceRange: venue.priceRange,
    rating: venue.rating,
    reviewCount: venue.reviewCount,
    partnerId: venue.partnerId,
    partnerName: venue.partnerName
      ? { en: venue.partnerName, bg: venue.partnerName }
      : undefined,
    partnerStatus: venue.partnerStatus,
    path: `/venues/${venue.id}`,
    createdAt: venue.createdAt,
    updatedAt: venue.updatedAt,
  };
}

/** Convert Entity to Searchable-compatible shape (for SearchEngine) */
export function entityToSearchable(entity: Entity): {
  id: string;
  name: string;
  nameBg?: string;
  description?: string;
  descriptionBg?: string;
  category: string;
  lat?: number;
  lng?: number;
  rating?: number;
  discount?: number;
  amenities?: string[];
  openingHours?: WorkingHours['schedule'];
  [key: string]: unknown;
} {
  return {
    id: entity.id,
    name: entity.name.en,
    nameBg: entity.name.bg,
    description: entity.description.en,
    descriptionBg: entity.description.bg,
    category: entity.category.en,
    lat: entity.location.coordinates?.lat,
    lng: entity.location.coordinates?.lng,
    rating: entity.rating,
    discount: entity.discount?.percent,
    amenities: entity.tags?.map(t => t.en),
    openingHours: entity.workingHours?.schedule,
  };
}

/** Convert Entity to FavoriteEntity for localStorage persistence */
export function entityToFavorite(entity: Entity): FavoriteEntity {
  return {
    id: entity.id,
    name: entity.name,
    category: entity.category,
    location: entity.location,
    discount: entity.discount,
    images: entity.images,
    path: entity.path,
    addedAt: Date.now(),
  };
}
