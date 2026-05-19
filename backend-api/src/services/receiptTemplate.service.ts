import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { imageUploadService } from './imageUpload.service';
import {
  DHASH_BITS,
  DHASH_HEX_LENGTH,
  DEFAULT_TEMPLATE_FRAUD_POINTS,
  DEFAULT_TEMPLATE_KEYWORD_WEIGHT,
  DEFAULT_TEMPLATE_MERCHANT_THRESHOLD,
  DEFAULT_TEMPLATE_MERCHANT_WEIGHT,
  DEFAULT_TEMPLATE_MIN_SIMILARITY,
  DEFAULT_TEMPLATE_VISUAL_WEIGHT,
} from '../constants/receipt.constants';
import { AppError } from '../middleware/error.middleware';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface TemplateComparisonResult {
  /** True if at least one template matched above the configured threshold. */
  matches: boolean;
  /** Highest weighted similarity score found across all active templates (0–1). */
  bestSimilarity: number;
  /** Human-readable reason code for logging / fraud reason array. */
  reason: string;
  /** How many active templates were checked (0 = no templates → no penalty). */
  templatesChecked: number;
}

export interface CreateTemplateParams {
  venueId: string;
  merchantName: string;
  merchantNameVariations?: string[];
  description?: string;
  expectedKeywords?: string[];
  imageUrl: string;
  imageKey: string;
  perceptualHash: string;
  uploadedBy: string;
}

export interface UpdateTemplateParams {
  merchantName?: string;
  merchantNameVariations?: string[];
  description?: string;
  expectedKeywords?: string[];
  isActive?: boolean;
}

// ─── Partial VenueFraudConfig shape used for comparison config ─────────────────

interface TemplateConfig {
  templateVisualWeight:      number;
  templateMerchantWeight:    number;
  templateKeywordWeight:     number;
  templateMinSimilarity:     number;
  templateFraudPoints:       number;
  templateMerchantThreshold: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ReceiptTemplateService {

  // ── Comparison helpers ────────────────────────────────────────────────────

  /**
   * Count bit differences between two dHash hex strings (Hamming distance).
   * XORs each nibble pair and popcount the 4-bit result.
   */
  private hammingDistance(hexA: string, hexB: string): number {
    const len = Math.min(hexA.length, hexB.length);
    let distance = 0;
    for (let i = 0; i < len; i++) {
      const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
      distance += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
    }
    return distance;
  }

  /**
   * Visual similarity score: 1 = identical, 0 = maximally different.
   */
  private visualSimilarity(hashA: string, hashB: string): number {
    const dist = this.hammingDistance(hashA, hashB);
    return 1 - dist / DHASH_BITS;
  }

  /**
   * Jaccard token similarity between two merchant name strings.
   * Tokenises on whitespace after lowercasing and stripping non-alphanumeric chars
   * (preserves extended Latin characters used in Bulgarian).
   */
  private merchantSimilarity(nameA: string, nameB: string): number {
    const tokenize = (s: string): Set<string> =>
      new Set(
        s
          .toLowerCase()
          .replace(/[^a-z0-9\u00C0-\u024F\s]/g, '')
          .split(/\s+/)
          .filter(Boolean)
      );

    const setA = tokenize(nameA);
    const setB = tokenize(nameB);
    const intersection = new Set([...setA].filter(t => setB.has(t)));
    const union = new Set([...setA, ...setB]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Fraction of expected keywords found in ocrText (case-insensitive substring match).
   * Returns 1.0 when no keywords are required (vacuously true).
   */
  private keywordScore(ocrText: string, keywords: string[]): number {
    if (keywords.length === 0) return 1.0;
    const lower = ocrText.toLowerCase();
    const found = keywords.filter(kw => lower.includes(kw.toLowerCase()));
    return found.length / keywords.length;
  }

  // ── Core comparison ───────────────────────────────────────────────────────

  /**
   * Compare a submitted receipt against all active templates for the venue.
   *
   * Weights and thresholds come from the already-fetched VenueFraudConfig so
   * this method never issues an extra DB query for configuration.
   *
   * All "fail open" paths (no templates, missing hash, DB error) return
   * `matches: true` so the fraud score is not penalised.
   */
  async compareAgainstTemplates(params: {
    venueId: string;
    perceptualHash: string;
    merchantName?: string;
    ocrRawText?: string;
    config: TemplateConfig;
  }): Promise<TemplateComparisonResult> {
    const { venueId, perceptualHash, merchantName, ocrRawText, config } = params;

    // Fail open: hash unavailable (Sharp error on client or server side)
    if (!perceptualHash || perceptualHash.length !== DHASH_HEX_LENGTH) {
      return {
        matches: true,
        bestSimilarity: 1.0,
        reason: 'HASH_UNAVAILABLE',
        templatesChecked: 0,
      };
    }

    let templates: Awaited<ReturnType<typeof prisma.venueReceiptTemplate.findMany>>;
    try {
      templates = await prisma.venueReceiptTemplate.findMany({
        where: { venueId, isActive: true },
      });
    } catch (err) {
      logger.error('receiptTemplateService: DB error fetching templates', err);
      return {
        matches: true,
        bestSimilarity: 1.0,
        reason: 'DB_ERROR',
        templatesChecked: 0,
      };
    }

    // Fail open: no templates configured for this venue
    if (templates.length === 0) {
      return {
        matches: true,
        bestSimilarity: 1.0,
        reason: 'NO_TEMPLATES',
        templatesChecked: 0,
      };
    }

    let bestSimilarity = 0;

    for (const template of templates) {
      // 1. Visual similarity via dHash
      const visualScore = this.visualSimilarity(perceptualHash, template.perceptualHash);

      // 2. Merchant name similarity — check canonical name and all variations,
      //    take the highest score so alternate spellings are treated as matches.
      //    If the best score falls below templateMerchantThreshold the merchant
      //    dimension contributes 0, preventing a visually-identical receipt from
      //    a different merchant from passing the template check.
      const rawMerchantScore = merchantName
        ? Math.max(
            this.merchantSimilarity(merchantName, template.merchantName),
            ...(template.merchantNameVariations ?? []).map(v =>
              this.merchantSimilarity(merchantName, v)
            )
          )
        : 0.5;
      const merchantScore =
        merchantName && rawMerchantScore < config.templateMerchantThreshold
          ? 0
          : rawMerchantScore;

      // 3. Keyword presence (full score when no keywords or no OCR text)
      const keywords: string[] = Array.isArray(template.expectedKeywords)
        ? template.expectedKeywords
        : [];
      const kwScore =
        ocrRawText && keywords.length > 0
          ? this.keywordScore(ocrRawText, keywords)
          : 1.0;

      // 4. Weighted overall score
      const overall =
        visualScore   * config.templateVisualWeight   +
        merchantScore * config.templateMerchantWeight +
        kwScore       * config.templateKeywordWeight;

      if (overall > bestSimilarity) {
        bestSimilarity = overall;
      }
    }

    const matches = bestSimilarity >= config.templateMinSimilarity;

    return {
      matches,
      bestSimilarity,
      reason: matches ? 'TEMPLATE_MATCH_OK' : 'TEMPLATE_MISMATCH',
      templatesChecked: templates.length,
    };
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async createTemplate(params: CreateTemplateParams) {
    return prisma.venueReceiptTemplate.create({
      data: {
        venueId:                 params.venueId,
        merchantName:            params.merchantName,
        merchantNameVariations:  params.merchantNameVariations ?? [],
        description:             params.description,
        expectedKeywords:        params.expectedKeywords ?? [],
        imageUrl:                params.imageUrl,
        imageKey:                params.imageKey,
        perceptualHash:          params.perceptualHash,
        uploadedBy:              params.uploadedBy,
      },
    });
  }

  /** Returns all templates for a venue (active and inactive), newest first. */
  async listTemplates(venueId: string) {
    return prisma.venueReceiptTemplate.findMany({
      where:   { venueId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTemplate(id: string, params: UpdateTemplateParams) {
    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('Template not found', 404);

    return prisma.venueReceiptTemplate.update({
      where: { id },
      data: {
        ...(params.merchantName           !== undefined && { merchantName:           params.merchantName }),
        ...(params.merchantNameVariations !== undefined && { merchantNameVariations: params.merchantNameVariations }),
        ...(params.description            !== undefined && { description:            params.description }),
        ...(params.isActive               !== undefined && { isActive:               params.isActive }),
        ...(params.expectedKeywords       !== undefined && { expectedKeywords:       params.expectedKeywords }),
      },
    });
  }

  /**
   * Delete a template.
   * @param hardDelete true → remove from S3 and delete the DB row permanently.
   *                   false (default) → soft deactivate only.
   */
  async deleteTemplate(id: string, hardDelete = false): Promise<void> {
    const template = await prisma.venueReceiptTemplate.findUnique({ where: { id } });
    if (!template) throw new AppError('Template not found', 404);

    if (!hardDelete) {
      await prisma.venueReceiptTemplate.update({
        where: { id },
        data:  { isActive: false },
      });
      return;
    }

    // Hard delete: remove S3 object first (failure is non-fatal)
    try {
      await imageUploadService.deleteImage(template.imageKey);
    } catch (err) {
      logger.error(`receiptTemplateService: S3 delete failed for key ${template.imageKey}`, err);
      // Continue — an S3 orphan is preferable to a phantom DB record
    }

    await prisma.venueReceiptTemplate.delete({ where: { id } });
  }
}

export const receiptTemplateService = new ReceiptTemplateService();
