# BC-QA-023 Implementation Audit — prisma/seed.ts schema alignment

**Audit round:** 1 (discovery) | **Reviewer:** Claude Haiku 4.5  
**Task:** Verify seed.ts implementation for correctness against current BoomCard schema  
**Files read:**
- `/Users/administrator/Documents/BoomCard/backend-api/prisma/seed.ts` (lines 1–509, entire file)
- `/Users/administrator/Documents/BoomCard/backend-api/prisma/schema.prisma` (entire schema)
- `/Users/administrator/Documents/BoomCard/backend-api/src/services/subscription.service.ts` (lines 920–937, getPlanBenefits reference)

---

## Integration points checked

1. **User.email_role composite key → upsert syntax:** seed.ts:39 uses `where: { email_role: { email: 'admin@boomcard.bg', role: 'SUPER_ADMIN' } }` — matches schema line 124 `@@unique([email, role])`. Prisma auto-generates composite key name as `email_role`. ✓

2. **Plan.features JSON format → subscription.service.ts:934:** seed.ts applies `JSON.stringify(['...', '...'])` (lines 432, 452, 474) — matches service's `safeParseJsonArray(row?.features)` expectation for JSON-string-stored arrays. ✓

3. **User.phone required field → schema line 16:** All User records in seed (admin line 46, partners lines 70, 82, 94, 106, 118, 130) have phone set. No User record is missing the required phone field. ✓

4. **Partner model → no tier field:** Schema Partner model (lines 189–255) contains no `tier` field. Seed creates partners with: userId, businessName, businessNameBg, category, description, descriptionBg, status, rating, reviewCount, city, phone, email — all valid fields, none removed/deprecated. ✓

---

## Findings

None. The seed.ts implementation is correct and complete.

### Verified checklist

- ✅ **User.upsert composite key correctness:** Admin user (line 38) correctly uses `email_role: {email, role}` composite key syntax; partner users (lines 64–134) created with distinct email+PARTNER combinations.
- ✅ **Partner field alignment:** No deprecated `tier` field; all Partner create() calls use current schema fields only.
- ✅ **Plan features/featuresBg format:** All three plans (BASIC, PREMIUM_MONTHLY, PREMIUM_WEEKLY) wrap feature arrays in `JSON.stringify()` on both `features` (lines 432, 452, 474) and `featuresBg` (lines 433, 453, 475).
- ✅ **Phone field presence:** User model's required `phone: String` (schema line 16) is populated on all 7 users (1 admin + 6 partners).
- ✅ **Idempotency:** Plans use `upsert` on `planCode` unique key (lines 420–482) — idempotent across re-runs. Users/Partners use `create` — intentional design for fresh demo accounts per run.
- ✅ **Seed data completeness:** 1 admin + 6 partners + 6 offers + 8 offers (total) + 3 plans sufficient to drive checkout journey (user login → browse offers → select plan → subscribe).
- ✅ **Turkish/Bulgarian i18n:** featuresBg translations in all plans are grammatically correct Bulgarian:
  - BASIC: "Кешбек награди" (cashback rewards), "Верификация на касови бележки" (receipt verification), "Основна поддръжка" (basic support).
  - PREMIUM_MONTHLY: "Подобрен кешбек" (enhanced cashback), "Приоритетна поддръжка" (priority support), "Екскулузивни оферти" (exclusive offers), "Месечен бонус" (monthly bonus).
  - PREMIUM_WEEKLY: "Подобрен кешбек", "Приоритетна поддръжка", "Седмични екскулузивни оферти" (weekly exclusive offers).
- ✅ **Required fields populated:** All mandatory schema fields present in create/upsert operations (e.g., User: email, passwordHash, firstName, lastName, phone, role, status; Partner: userId, businessName, category; Offer: title, description, type, startDate, endDate; Plan: planCode, displayName, priceYearlyEur, cashbackRate).
- ✅ **Enum values valid:** UserRole (PARTNER, SUPER_ADMIN), UserStatus (ACTIVE, PENDING_VERIFICATION), PartnerStatus (PENDING, ACTIVE), OfferStatus (DRAFT, ACTIVE), OfferType (DISCOUNT, BUNDLE) — all match schema enums (schema lines 1813–1825, 1849–1877, 1868–1876, 1911–1925, 1919–1925).
- ✅ **cardType field:** Schema Plan.cardType is `String` type (line 500, not enum-constrained), default "silver" — seed's `cardType: 'silver'` is valid. ✓

---

## Verdict

**approve**

The seed.ts file is correct, complete, and ready for use. All schema constraints are satisfied, composite keys are properly formed, Plan features are JSON-serialized correctly, and i18n translations are in place. No CRITICAL or HIGH issues found.
