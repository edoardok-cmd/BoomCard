-- prisma:no-transaction
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction (PostgreSQL restriction).
-- Prisma wraps migrations in a transaction by default; this comment disables that wrapper.
--
-- Scope: BC-M3 partner indexes — adds the categories column (missing from all prior migrations)
-- and two indexes on the Partner table.
--
-- Backfill strategy: Partner.categories is a TEXT[] NOT NULL column with DEFAULT '{}'. Adding it
-- as NOT NULL with a constant default is safe under concurrent writes because PostgreSQL 11+
-- handles ADD COLUMN ... NOT NULL DEFAULT <constant> via a fast catalog-only rewrite — no
-- full-table scan or lock for the duration; the ADD COLUMN IF NOT EXISTS guard makes the
-- statement idempotent on replay.
-- Existing rows will receive '{}' instantly via the fast-path default rewrite.
--
--   1. Partner(status, category, city)  — powers GET /partners?status=&category=&city=
--                                         filtered list queries. CONCURRENTLY avoids the
--                                         ShareLock that a plain CREATE INDEX holds for the
--                                         full build duration (blocks all writes).
--   2. Partner(categories) GIN          — accelerates array-membership queries
--                                         (WHERE 'X' = ANY("categories") / @> operator).
--                                         A B-tree index cannot satisfy these operators;
--                                         a GIN index is required.
--
-- IF NOT EXISTS makes both index statements idempotent on replay.

-- Partner: add categories column (TEXT[] with empty-array default) if not yet present.
-- No prior migration created this column; this statement is the backing DDL for the
-- categories field declared in schema.prisma (Partner.categories String[] @default([])).
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT '{}';

-- Partner: filtered list queries by status, category, and city
-- Powers: GET /api/partners?status=&category=&city= endpoint filter combinations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Partner_status_category_city_idx"
  ON "Partner"("status", "category", "city");

-- Partner: GIN index for array-membership queries on the categories[] field
-- Required because B-tree cannot satisfy ANY() / @> operators on array columns.
-- Powers: GET /api/partners?category= and offers.service.ts subcategory lookups.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Partner_categories_gin"
  ON "Partner" USING GIN ("categories");
