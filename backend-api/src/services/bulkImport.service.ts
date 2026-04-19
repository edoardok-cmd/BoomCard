/**
 * Bulk Import Service
 *
 * Parses a CSV or XLSX spreadsheet where:
 *  - The filename (without extension) is used as the partner's business name.
 *  - Partner fields are read from the first data row (and shared across all rows).
 *  - Each data row represents one offer.
 *  - Images are matched by slug: slugify(offer_title)_N.ext
 */

import * as XLSX from 'xlsx';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { OfferStatus, OfferType, PartnerStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { imageUploadService } from './imageUpload.service';
import { notificationService } from './notification.service';
import { logger } from '../utils/logger';
import { CASHBACK_MATRIX_STEPS } from '../constants/receipt.constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImportedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface ImportResult {
  partnerCreated: boolean;
  partnerId: string;
  businessName: string;
  offersCreated: number;
  offersSkipped: number;
  imagesUploaded: number;
  errors: string[];
  warnings: string[];
}

export interface PartnerImportResult {
  partnersCreated: number;
  partnersSkipped: number;
  imagesUploaded: number;
  tierApplied: string | null;
  errors: string[];
  warnings: string[];
  partners: Array<{ id: string; businessName: string; created: boolean }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a string to a URL-friendly slug used to match image filenames. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Parse a cell value to a number or undefined. */
function toNumber(val: unknown): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return isFinite(n) ? n : undefined;
}

/** Parse a cell value to a boolean. */
function toBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return ['true', '1', 'yes', 'y'].includes(val.toLowerCase().trim());
  if (typeof val === 'number') return val !== 0;
  return false;
}

/** Parse a comma-separated cell value into a string array. */
function toStringArray(val: unknown): string[] {
  if (!val || String(val).trim() === '') return [];
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse a date string or Excel serial date number to a Date. */
function toDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (typeof val === 'number') {
    // Excel date serial
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return new Date(Date.UTC(date.y, date.m - 1, date.d));
    return undefined;
  }
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

/** Sanitize a string cell value. */
function str(val: unknown): string {
  if (val === undefined || val === null) return '';
  return String(val).trim();
}

// Column name constants (lowercase trimmed)
const COL = {
  PARTNER_NAME_BG: 'partner_name_bg',
  PARTNER_CATEGORY: 'partner_category',
  PARTNER_CATEGORIES: 'partner_categories', // comma-separated e.g. "RESTAURANT,CAFE"
  PARTNER_DESCRIPTION: 'partner_description',
  PARTNER_DESCRIPTION_BG: 'partner_description_bg',
  PARTNER_WEBSITE: 'partner_website',
  PARTNER_PHONE: 'partner_phone',
  PARTNER_EMAIL: 'partner_email',
  PARTNER_ADDRESS: 'partner_address',
  PARTNER_CITY: 'partner_city',
  PARTNER_REGION: 'partner_region',
  PARTNER_LATITUDE: 'partner_latitude',
  PARTNER_LONGITUDE: 'partner_longitude',
  PARTNER_OPENING_HOURS: 'partner_opening_hours',
  PARTNER_DISCOUNT_RATE: 'partner_discount_rate',
  PARTNER_TYPE_NAME: 'partner_type_name',
  PARTNER_STATUS: 'partner_status',
  OFFER_TITLE: 'offer_title',
  OFFER_TITLE_BG: 'offer_title_bg',
  OFFER_DESCRIPTION: 'offer_description',
  OFFER_DESCRIPTION_BG: 'offer_description_bg',
  OFFER_TYPE: 'offer_type',
  OFFER_DISCOUNT_PERCENT: 'offer_discount_percent',
  OFFER_DISCOUNT_AMOUNT: 'offer_discount_amount',
  OFFER_CASHBACK_PERCENT: 'offer_cashback_percent',
  OFFER_POINTS_MULTIPLIER: 'offer_points_multiplier',
  OFFER_MIN_PURCHASE: 'offer_min_purchase',
  OFFER_MAX_DISCOUNT: 'offer_max_discount',
  OFFER_TERMS: 'offer_terms',
  OFFER_TERMS_BG: 'offer_terms_bg',
  OFFER_TAGS: 'offer_tags',
  OFFER_STATUS: 'offer_status',
  OFFER_IS_FEATURED: 'offer_is_featured',
  OFFER_START_DATE: 'offer_start_date',
  OFFER_END_DATE: 'offer_end_date',
  OFFER_USAGE_LIMIT: 'offer_usage_limit',
} as const;

// ─── Template Generator ───────────────────────────────────────────────────────

/**
 * Generate a downloadable XLSX template with headers and one example row.
 */
export function generateTemplate(): Buffer {
  const headers = [
    // Partner fields
    COL.PARTNER_NAME_BG,
    COL.PARTNER_CATEGORY,
    COL.PARTNER_CATEGORIES,
    COL.PARTNER_DESCRIPTION,
    COL.PARTNER_DESCRIPTION_BG,
    COL.PARTNER_WEBSITE,
    COL.PARTNER_PHONE,
    COL.PARTNER_EMAIL,
    COL.PARTNER_ADDRESS,
    COL.PARTNER_CITY,
    COL.PARTNER_REGION,
    COL.PARTNER_LATITUDE,
    COL.PARTNER_LONGITUDE,
    COL.PARTNER_OPENING_HOURS,
    COL.PARTNER_DISCOUNT_RATE,
    COL.PARTNER_TYPE_NAME,
    COL.PARTNER_STATUS,
    // Offer fields
    COL.OFFER_TITLE,
    COL.OFFER_TITLE_BG,
    COL.OFFER_DESCRIPTION,
    COL.OFFER_DESCRIPTION_BG,
    COL.OFFER_TYPE,
    COL.OFFER_DISCOUNT_PERCENT,
    COL.OFFER_DISCOUNT_AMOUNT,
    COL.OFFER_CASHBACK_PERCENT,
    COL.OFFER_POINTS_MULTIPLIER,
    COL.OFFER_MIN_PURCHASE,
    COL.OFFER_MAX_DISCOUNT,
    COL.OFFER_TERMS,
    COL.OFFER_TERMS_BG,
    COL.OFFER_TAGS,
    COL.OFFER_STATUS,
    COL.OFFER_IS_FEATURED,
    COL.OFFER_START_DATE,
    COL.OFFER_END_DATE,
    COL.OFFER_USAGE_LIMIT,
  ];

  const exampleRow = [
    // Partner fields (fill only in the first row; subsequent rows can leave blank)
    'Примерен партньор',      // partner_name_bg
    'RESTAURANT',             // partner_category
    'RESTAURANT,CAFE',        // partner_categories (comma-separated; if blank, uses partner_category)
    'A great restaurant',     // partner_description
    'Страхотен ресторант',    // partner_description_bg
    'https://example.com',    // partner_website
    '+359 2 000 0000',        // partner_phone
    'partner@example.com',    // partner_email  — used to create/find partner user
    '1 Main Street',          // partner_address
    'Sofia',                  // partner_city
    'Sofia Province',         // partner_region
    '42.6977',                // partner_latitude
    '23.3219',                // partner_longitude
    'Mon-Fri 09:00-22:00',    // partner_opening_hours
    '10',                     // partner_discount_rate (%)
    '',                       // partner_type_name  — leave blank or e.g. "GOLD"
    'ACTIVE',                 // partner_status
    // Offer fields
    'Summer Discount',        // offer_title
    'Лятна Отстъпка',         // offer_title_bg
    '20% off all meals',      // offer_description
    '20% отстъпка от всички ястия', // offer_description_bg
    'DISCOUNT',               // offer_type: DISCOUNT | CASHBACK | POINTS | COMBO
    '20',                     // offer_discount_percent
    '',                       // offer_discount_amount
    '',                       // offer_cashback_percent
    '',                       // offer_points_multiplier
    '',                       // offer_min_purchase
    '',                       // offer_max_discount
    'Valid Mon-Fri only',     // offer_terms
    'Важи само Пон-Пет',      // offer_terms_bg
    'summer, food, discount', // offer_tags  — comma-separated
    'ACTIVE',                 // offer_status: ACTIVE | INACTIVE | SCHEDULED
    'false',                  // offer_is_featured
    '2026-06-01',             // offer_start_date (YYYY-MM-DD)
    '2026-08-31',             // offer_end_date
    '',                       // offer_usage_limit
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  // Set column widths
  ws['!cols'] = headers.map(() => ({ wch: 28 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Partners & Offers');

  // Instructions sheet
  const instructions = [
    ['BoomCard Bulk Import Template'],
    [''],
    ['INSTRUCTIONS'],
    ['1. The file name (without extension) becomes the partner business name.'],
    ['2. Partner fields (partner_*) are read from the FIRST data row only.'],
    ['3. Each data row creates one offer for the partner.'],
    ['4. Tags: enter multiple values separated by commas in one cell.'],
    ['5. Dates must be in YYYY-MM-DD format.'],
    [''],
    ['IMAGE NAMING CONVENTION'],
    ['Images must be uploaded together with the spreadsheet.'],
    ['Name each image: {slugified_offer_title}_{n}.{ext}'],
    ['  Example: "Summer Discount" → summer-discount_1.jpg, summer-discount_2.jpg'],
    ['  Slugify rules: lowercase, spaces→hyphens, remove special chars.'],
    [''],
    ['OFFER TYPES'],
    ['  DISCOUNT    — percentage or fixed amount off'],
    ['  CASHBACK    — cashback percentage'],
    ['  POINTS      — loyalty points multiplier'],
    ['  COMBO       — combination of discount + cashback'],
    [''],
    ['PARTNER STATUS'],
    ['  ACTIVE | PENDING | SUSPENDED | REJECTED'],
    [''],
    ['OFFER STATUS'],
    ['  ACTIVE | INACTIVE | SCHEDULED | EXPIRED'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  wsInstructions['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── Main Import Function ─────────────────────────────────────────────────────

export async function importFromSpreadsheet(
  spreadsheet: ImportedFile,
  imageFiles: ImportedFile[],
  adminUserId: string,
): Promise<ImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let offersCreated = 0;
  let offersSkipped = 0;
  let imagesUploaded = 0;

  // ── 1. Parse spreadsheet ──────────────────────────────────────────────────
  const workbook = XLSX.read(spreadsheet.buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Spreadsheet contains no sheets');
  }
  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: '',
    raw: true,
  });

  if (rows.length === 0) {
    throw new Error('Spreadsheet has no data rows');
  }

  // Normalize column keys to lowercase-trimmed
  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[key.toLowerCase().trim()] = val;
    }
    return normalized;
  });

  // ── 2. Derive partner name from filename ──────────────────────────────────
  const fileBaseName = spreadsheet.originalname.replace(/\.[^.]+$/, '');
  const businessName = fileBaseName.trim() || 'Imported Partner';

  // ── 3. Extract partner fields from first row ──────────────────────────────
  const firstRow = normalizedRows[0];

  const partnerEmail = str(firstRow[COL.PARTNER_EMAIL]);
  const partnerNameBg = str(firstRow[COL.PARTNER_NAME_BG]) || undefined;
  const partnerCategory = str(firstRow[COL.PARTNER_CATEGORY]) || 'OTHER';
  const partnerCategoriesRaw = toStringArray(firstRow[COL.PARTNER_CATEGORIES]);
  const partnerCategories = partnerCategoriesRaw.length > 0 ? partnerCategoriesRaw : [partnerCategory];
  const partnerDescription = str(firstRow[COL.PARTNER_DESCRIPTION]) || undefined;
  const partnerDescriptionBg = str(firstRow[COL.PARTNER_DESCRIPTION_BG]) || undefined;
  const partnerWebsite = str(firstRow[COL.PARTNER_WEBSITE]) || undefined;
  const partnerPhone = str(firstRow[COL.PARTNER_PHONE]) || undefined;
  const partnerAddress = str(firstRow[COL.PARTNER_ADDRESS]) || undefined;
  const partnerCity = str(firstRow[COL.PARTNER_CITY]) || undefined;
  const partnerRegion = str(firstRow[COL.PARTNER_REGION]) || undefined;
  const partnerLatitude = toNumber(firstRow[COL.PARTNER_LATITUDE]);
  const partnerLongitude = toNumber(firstRow[COL.PARTNER_LONGITUDE]);
  const partnerOpeningHours = str(firstRow[COL.PARTNER_OPENING_HOURS]) || undefined;
  const partnerDiscountRateRaw = toNumber(firstRow[COL.PARTNER_DISCOUNT_RATE]);
  if (partnerDiscountRateRaw !== undefined && !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(partnerDiscountRateRaw)) {
    throw new Error(`Invalid partner_discount_rate "${partnerDiscountRateRaw}". Must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}`);
  }
  const partnerDiscountRate = partnerDiscountRateRaw;
  const partnerTypeName = str(firstRow[COL.PARTNER_TYPE_NAME]) || undefined;
  const partnerStatusRaw = str(firstRow[COL.PARTNER_STATUS]).toUpperCase() || 'ACTIVE';
  const partnerStatus = Object.values(PartnerStatus).includes(partnerStatusRaw as PartnerStatus)
    ? (partnerStatusRaw as PartnerStatus)
    : PartnerStatus.ACTIVE;

  // ── 4. Resolve partner type (optional) ────────────────────────────────────
  let partnerTypeId: string | undefined;
  if (partnerTypeName) {
    const ptype = await prisma.partnerType.findFirst({
      where: { name: { equals: partnerTypeName, mode: 'insensitive' }, isActive: true },
    });
    if (ptype) {
      partnerTypeId = ptype.id;
    } else {
      warnings.push(`Partner type "${partnerTypeName}" not found — partner will have no type assigned.`);
    }
  }

  // ── 5. Find or create the partner user ────────────────────────────────────
  let partnerUser: { id: string };

  if (partnerEmail) {
    // Email is not unique — scope the lookup to PARTNER role so we don't
    // hijack a customer's account that happens to share the email.
    const existingUser = await prisma.user.findFirst({
      where: { email: partnerEmail, role: 'PARTNER' },
    });
    if (existingUser) {
      partnerUser = existingUser;
    } else {
      // Create a new PARTNER user
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      partnerUser = await prisma.user.create({
        data: {
          email: partnerEmail,
          passwordHash: hashedPassword,
          role: 'PARTNER',
          firstName: businessName,
          lastName: 'Partner',
        },
        select: { id: true },
      });
      logger.info(`Bulk import: created PARTNER user for ${partnerEmail}`);
    }
  } else {
    // Generate a placeholder email from business name slug
    const slug = slugify(businessName);
    const generatedEmail = `${slug}-${crypto.randomBytes(4).toString('hex')}@import.boomcard.bg`;
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    partnerUser = await prisma.user.create({
      data: {
        email: generatedEmail,
        passwordHash: hashedPassword,
        role: 'PARTNER',
        firstName: businessName,
        lastName: 'Partner',
      },
      select: { id: true },
    });
    warnings.push(
      `No partner_email provided — generated placeholder account: ${generatedEmail}`,
    );
  }

  // ── 6. Create or find the partner ─────────────────────────────────────────
  let partner: { id: string };
  let partnerCreated = false;

  const existingPartner = await prisma.partner.findUnique({ where: { userId: partnerUser.id } });
  if (existingPartner) {
    partner = existingPartner;
    warnings.push(`Partner "${businessName}" already exists — offers will be added to the existing partner.`);
  } else {
    partner = await prisma.partner.create({
      data: {
        userId: partnerUser.id,
        businessName,
        businessNameBg: partnerNameBg,
        category: partnerCategory,
        categories: partnerCategories,
        description: partnerDescription,
        descriptionBg: partnerDescriptionBg,
        website: partnerWebsite,
        phone: partnerPhone,
        email: partnerEmail || undefined,
        address: partnerAddress,
        city: partnerCity,
        region: partnerRegion,
        latitude: partnerLatitude,
        longitude: partnerLongitude,
        openingHours: partnerOpeningHours,
        discountRate: partnerDiscountRate,
        partnerTypeId,
        status: partnerStatus,
      },
      select: { id: true },
    });
    partnerCreated = true;
    logger.info(`Bulk import: created partner "${businessName}" (${partner.id})`);
  }

  // ── 7. Build image slug → file map ────────────────────────────────────────
  // e.g. "summer-discount_1" → { buffer, mimetype }
  const imageMap = new Map<string, ImportedFile>();
  for (const img of imageFiles) {
    // Strip extension, lowercase
    const nameWithoutExt = img.originalname.replace(/\.[^.]+$/, '').toLowerCase().trim();
    imageMap.set(nameWithoutExt, img);
  }

  // ── 8. Create offers ──────────────────────────────────────────────────────
  for (let rowIdx = 0; rowIdx < normalizedRows.length; rowIdx++) {
    const row = normalizedRows[rowIdx];
    const rowNum = rowIdx + 2; // 1-indexed, +1 for header row

    const offerTitle = str(row[COL.OFFER_TITLE]);
    if (!offerTitle) {
      warnings.push(`Row ${rowNum}: offer_title is empty — row skipped.`);
      offersSkipped++;
      continue;
    }

    const offerTypeRaw = str(row[COL.OFFER_TYPE]).toUpperCase() || 'DISCOUNT';
    const offerType = Object.values(OfferType).includes(offerTypeRaw as OfferType)
      ? (offerTypeRaw as OfferType)
      : OfferType.DISCOUNT;

    const offerStatusRaw = str(row[COL.OFFER_STATUS]).toUpperCase() || 'ACTIVE';
    const offerStatus = Object.values(OfferStatus).includes(offerStatusRaw as OfferStatus)
      ? (offerStatusRaw as OfferStatus)
      : OfferStatus.ACTIVE;

    const tags = toStringArray(row[COL.OFFER_TAGS]);

    // Find images for this offer: {slug}_1, {slug}_2, ...
    const offerSlug = slugify(offerTitle);
    let primaryImageUrl: string | undefined;
    let picIndex = 1;
    while (true) {
      const key = `${offerSlug}_${picIndex}`;
      const imgFile = imageMap.get(key);
      if (!imgFile) break;

      try {
        const result = await imageUploadService.uploadImage({
          file: imgFile.buffer,
          fileName: imgFile.originalname,
          mimeType: imgFile.mimetype,
          folder: 'offers',
          userId: adminUserId,
        });
        if (picIndex === 1) primaryImageUrl = result.url;
        imagesUploaded++;
        logger.info(`Bulk import: uploaded image "${key}" → ${result.url}`);
      } catch (imgErr: any) {
        warnings.push(`Row ${rowNum}: failed to upload image "${key}": ${imgErr.message}`);
      }
      picIndex++;
    }

    try {
      await prisma.offer.create({
        data: {
          partnerId: partner.id,
          title: offerTitle,
          titleBg: str(row[COL.OFFER_TITLE_BG]) || undefined,
          description: str(row[COL.OFFER_DESCRIPTION]) || undefined,
          descriptionBg: str(row[COL.OFFER_DESCRIPTION_BG]) || undefined,
          type: offerType,
          discountPercent: toNumber(row[COL.OFFER_DISCOUNT_PERCENT]),
          discountAmount: toNumber(row[COL.OFFER_DISCOUNT_AMOUNT]),
          cashbackPercent: toNumber(row[COL.OFFER_CASHBACK_PERCENT]),
          pointsMultiplier: toNumber(row[COL.OFFER_POINTS_MULTIPLIER]),
          minPurchase: toNumber(row[COL.OFFER_MIN_PURCHASE]),
          maxDiscount: toNumber(row[COL.OFFER_MAX_DISCOUNT]),
          termsConditions: str(row[COL.OFFER_TERMS]) || undefined,
          termsConditionsBg: str(row[COL.OFFER_TERMS_BG]) || undefined,
          tags: tags.length > 0 ? JSON.stringify(tags) : undefined,
          status: offerStatus,
          isFeatured: toBoolean(row[COL.OFFER_IS_FEATURED]),
          startDate: toDate(row[COL.OFFER_START_DATE]),
          endDate: toDate(row[COL.OFFER_END_DATE]),
          usageLimit: toNumber(row[COL.OFFER_USAGE_LIMIT]) ?? null,
          image: primaryImageUrl,
        },
      });
      offersCreated++;
    } catch (offerErr: any) {
      errors.push(`Row ${rowNum}: failed to create offer "${offerTitle}": ${offerErr.message}`);
      offersSkipped++;
    }
  }

  return {
    partnerCreated,
    partnerId: partner.id,
    businessName,
    offersCreated,
    offersSkipped,
    imagesUploaded,
    errors,
    warnings,
  };
}

// ─── Partners Template Generator ──────────────────────────────────────────────

/**
 * Column names for the multi-partner import template.
 * Each row = one partner. Tier is encoded in the filename suffix (e.g. _basic, _gold, _vip).
 */
const PCOL = {
  BUSINESS_NAME:    'business_name',
  BUSINESS_NAME_BG: 'business_name_bg',
  CATEGORY:         'category',
  CATEGORIES:       'categories', // comma-separated e.g. "RESTAURANT,CAFE"
  DESCRIPTION:      'description',
  DESCRIPTION_BG:   'description_bg',
  WEBSITE:          'website',
  PHONE:            'phone',
  EMAIL:            'email',
  ADDRESS:          'address',
  CITY:             'city',
  REGION:           'region',
  LATITUDE:         'latitude',
  LONGITUDE:        'longitude',
  OPENING_HOURS:    'opening_hours',
  DISCOUNT_RATE:    'discount_rate',
  STATUS:           'status',
} as const;

/**
 * Generate the multi-partner XLSX template.
 * Filename convention: {any_name}_{tier}.xlsx  e.g. sofia_restaurants_basic.xlsx
 */
export function generatePartnersTemplate(): Buffer {
  const headers = Object.values(PCOL);

  const exampleRow = [
    'Example Restaurant',          // business_name
    'Примерен Ресторант',           // business_name_bg
    'RESTAURANT',                   // category (primary)
    'RESTAURANT,CAFE',              // categories (comma-separated; if blank, uses category)
    'A great place to eat',         // description
    'Страхотно място за хранене',   // description_bg
    'https://example.com',          // website
    '+359 88 123 4567',             // phone
    'partner@example.com',          // email — used to find/create partner user
    '1 Main Street',                // address
    'Sofia',                        // city
    'Sofia Province',               // region
    '42.6977',                      // latitude
    '23.3219',                      // longitude
    'Mon-Fri 09:00-22:00',          // opening_hours
    '10',                           // discount_rate (%)
    'ACTIVE',                       // status: ACTIVE | PENDING | SUSPENDED
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);
  ws['!cols'] = headers.map(() => ({ wch: 30 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Partners');

  // Instructions sheet
  const instructions = [
    ['BoomCard Partners Bulk Import Template'],
    [''],
    ['INSTRUCTIONS'],
    ['1. Each data row = one partner.'],
    ['2. The partner TIER is set by the filename suffix, e.g.:'],
    ['     sofia_restaurants_basic.xlsx  → tier: BASIC'],
    ['     mall_partners_gold.xlsx       → tier: GOLD'],
    ['     vip_venues_vip.xlsx           → tier: VIP'],
    ['3. If no matching tier is found the partner will have no type assigned.'],
    ['4. The business_name column is the primary identifier.'],
    ['5. If partner_email already exists the partner will be updated, not duplicated.'],
    [''],
    ['IMAGE NAMING CONVENTION'],
    ['Images are matched per partner by the slugified business_name:'],
    ['  {slugified_business_name}_1.jpg, {slugified_business_name}_2.jpg'],
    ['  Example: "Example Restaurant" → example-restaurant_1.jpg'],
    ['  Slugify: lowercase, spaces→hyphens, remove special chars.'],
    [''],
    ['CATEGORY VALUES'],
    ['  RESTAURANT | HOTEL | SPA | CAFE | SHOP | ENTERTAINMENT | SPORT | OTHER'],
    [''],
    ['STATUS VALUES'],
    ['  ACTIVE | PENDING | SUSPENDED | INACTIVE'],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ─── Multi-Partner Import ──────────────────────────────────────────────────────

/**
 * Extract tier from a filename suffix like `partners_basic.xlsx` → "basic".
 * Returns the uppercased suffix or null if none found.
 */
function extractTierFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, ''); // strip extension
  const match = base.match(/_([a-zA-Z0-9]+)$/);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Import multiple partners from a single spreadsheet.
 * Each row = one partner. Tier is encoded in the filename suffix.
 */
export async function importPartnersFromSpreadsheet(
  spreadsheet: ImportedFile,
  imageFiles: ImportedFile[],
  adminUserId: string,
): Promise<PartnerImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  let partnersCreated = 0;
  let partnersSkipped = 0;
  let imagesUploaded = 0;
  const partners: Array<{ id: string; businessName: string; created: boolean }> = [];

  // ── 1. Parse spreadsheet ──────────────────────────────────────────────────
  const workbook = XLSX.read(spreadsheet.buffer, { type: 'buffer', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Spreadsheet contains no sheets');

  const sheet = workbook.Sheets[sheetName];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  if (rows.length === 0) throw new Error('Spreadsheet has no data rows');

  const normalizedRows = rows.map((row) => {
    const n: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) n[k.toLowerCase().trim()] = v;
    return n;
  });

  // ── 2. Resolve tier from filename ──────────────────────────────────────────
  const tierName = extractTierFromFilename(spreadsheet.originalname);
  let partnerTypeId: string | undefined;
  if (tierName) {
    const ptype = await prisma.partnerType.findFirst({
      where: { name: { equals: tierName, mode: 'insensitive' }, isActive: true },
    });
    if (ptype) {
      partnerTypeId = ptype.id;
    } else {
      warnings.push(`Tier "${tierName}" (from filename) not found in PartnerTypes — partners will have no type assigned.`);
    }
  } else {
    warnings.push('No tier suffix found in filename (expected e.g. _basic, _gold) — partners will have no type assigned.');
  }

  // ── 3. Build image slug → file map ────────────────────────────────────────
  const imageMap = new Map<string, ImportedFile>();
  for (const img of imageFiles) {
    const nameWithoutExt = img.originalname.replace(/\.[^.]+$/, '').toLowerCase().trim();
    imageMap.set(nameWithoutExt, img);
  }

  // ── 4. Process each row ───────────────────────────────────────────────────
  for (let rowIdx = 0; rowIdx < normalizedRows.length; rowIdx++) {
    const row = normalizedRows[rowIdx];
    const rowNum = rowIdx + 2;

    const businessName = str(row[PCOL.BUSINESS_NAME]);
    if (!businessName) {
      warnings.push(`Row ${rowNum}: business_name is empty — row skipped.`);
      partnersSkipped++;
      continue;
    }

    const partnerEmail = str(row[PCOL.EMAIL]);
    const partnerNameBg = str(row[PCOL.BUSINESS_NAME_BG]) || undefined;
    const category = str(row[PCOL.CATEGORY]) || 'OTHER';
    const categoriesRaw = toStringArray(row[PCOL.CATEGORIES]);
    const categories = categoriesRaw.length > 0 ? categoriesRaw : [category];
    const statusRaw = str(row[PCOL.STATUS]).toUpperCase() || 'ACTIVE';
    const partnerStatus = Object.values(PartnerStatus).includes(statusRaw as PartnerStatus)
      ? (statusRaw as PartnerStatus)
      : PartnerStatus.ACTIVE;

    // Validate discount rate against allowed steps
    const rowDiscountRate = toNumber(row[PCOL.DISCOUNT_RATE]);
    if (rowDiscountRate !== undefined && !(CASHBACK_MATRIX_STEPS as readonly number[]).includes(rowDiscountRate)) {
      warnings.push(`Row ${rowNum}: invalid discount_rate "${rowDiscountRate}" — must be one of: ${CASHBACK_MATRIX_STEPS.join(', ')}. Skipped.`);
      partnersSkipped++;
      continue;
    }

    // Find or create the partner user
    let partnerUser: { id: string };
    if (partnerEmail) {
      // Email is not unique — scope the lookup to PARTNER role so we don't
      // hijack a customer's account that happens to share the email.
      const existing = await prisma.user.findFirst({
        where: { email: partnerEmail, role: 'PARTNER' },
      });
      if (existing) {
        partnerUser = existing;
      } else {
        const tempPassword = crypto.randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        partnerUser = await prisma.user.create({
          data: {
            email: partnerEmail,
            passwordHash: hashedPassword,
            role: 'PARTNER',
            firstName: businessName,
            lastName: 'Partner',
          },
          select: { id: true },
        });
      }
    } else {
      const slug = slugify(businessName);
      const generatedEmail = `${slug}-${crypto.randomBytes(4).toString('hex')}@import.boomcard.bg`;
      const tempPassword = crypto.randomBytes(16).toString('hex');
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      partnerUser = await prisma.user.create({
        data: {
          email: generatedEmail,
          passwordHash: hashedPassword,
          role: 'PARTNER',
          firstName: businessName,
          lastName: 'Partner',
        },
        select: { id: true },
      });
      warnings.push(`Row ${rowNum}: no email for "${businessName}" — generated placeholder: ${generatedEmail}`);
    }

    // Upload partner logo images ({slug}_1, {slug}_2, ...)
    const partnerSlug = slugify(businessName);
    let logoUrl: string | undefined;
    let picIndex = 1;
    while (true) {
      const key = `${partnerSlug}_${picIndex}`;
      const imgFile = imageMap.get(key);
      if (!imgFile) break;
      try {
        const result = await imageUploadService.uploadImage({
          file: imgFile.buffer,
          fileName: imgFile.originalname,
          mimeType: imgFile.mimetype,
          folder: 'partners',
          userId: adminUserId,
        });
        if (picIndex === 1) logoUrl = result.url;
        imagesUploaded++;
      } catch (imgErr: any) {
        warnings.push(`Row ${rowNum}: failed to upload image "${key}": ${imgErr.message}`);
      }
      picIndex++;
    }

    // Find or create partner record
    let created = false;
    let partnerId: string;
    try {
      const existingPartner = await prisma.partner.findUnique({ where: { userId: partnerUser.id } });
      if (existingPartner) {
        // Update existing partner
        await prisma.partner.update({
          where: { id: existingPartner.id },
          data: {
            businessName,
            businessNameBg: partnerNameBg,
            category,
            categories,
            description: str(row[PCOL.DESCRIPTION]) || undefined,
            descriptionBg: str(row[PCOL.DESCRIPTION_BG]) || undefined,
            website: str(row[PCOL.WEBSITE]) || undefined,
            phone: str(row[PCOL.PHONE]) || undefined,
            email: partnerEmail || undefined,
            address: str(row[PCOL.ADDRESS]) || undefined,
            city: str(row[PCOL.CITY]) || undefined,
            region: str(row[PCOL.REGION]) || undefined,
            latitude: toNumber(row[PCOL.LATITUDE]),
            longitude: toNumber(row[PCOL.LONGITUDE]),
            openingHours: str(row[PCOL.OPENING_HOURS]) || undefined,
            discountRate: rowDiscountRate,
            partnerTypeId,
            status: partnerStatus,
            ...(logoUrl ? { logo: logoUrl } : {}),
          },
        });
        partnerId = existingPartner.id;
        warnings.push(`Row ${rowNum}: partner "${businessName}" already existed — updated.`);
      } else {
        const newPartner = await prisma.partner.create({
          data: {
            userId: partnerUser.id,
            businessName,
            businessNameBg: partnerNameBg,
            category,
            categories,
            description: str(row[PCOL.DESCRIPTION]) || undefined,
            descriptionBg: str(row[PCOL.DESCRIPTION_BG]) || undefined,
            website: str(row[PCOL.WEBSITE]) || undefined,
            phone: str(row[PCOL.PHONE]) || undefined,
            email: partnerEmail || undefined,
            address: str(row[PCOL.ADDRESS]) || undefined,
            city: str(row[PCOL.CITY]) || undefined,
            region: str(row[PCOL.REGION]) || undefined,
            latitude: toNumber(row[PCOL.LATITUDE]),
            longitude: toNumber(row[PCOL.LONGITUDE]),
            openingHours: str(row[PCOL.OPENING_HOURS]) || undefined,
            discountRate: rowDiscountRate,
            partnerTypeId,
            status: partnerStatus,
            ...(logoUrl ? { logo: logoUrl } : {}),
          },
          select: { id: true },
        });
        partnerId = newPartner.id;
        created = true;
        partnersCreated++;
        logger.info(`Partners bulk import: created partner "${businessName}" (${partnerId})`);

        // Welcome the new partner — non-fatal, don't block the import batch.
        // Fires only for newly-created partners (not updated ones).
        notificationService.notifyPartnerWelcome({
          partnerUserId: partnerUser.id,
          businessName,
          isBulkImport: true,
        }).catch((err) => logger.error(`Failed to send bulk-import welcome for ${businessName}:`, err));
      }
      partners.push({ id: partnerId, businessName, created });
    } catch (err: any) {
      errors.push(`Row ${rowNum}: failed to create/update partner "${businessName}": ${err.message}`);
      partnersSkipped++;
    }
  }

  return {
    partnersCreated,
    partnersSkipped,
    imagesUploaded,
    tierApplied: tierName,
    errors,
    warnings,
    partners,
  };
}
