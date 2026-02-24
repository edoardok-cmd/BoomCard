# Internal Onboarding Checklist

## Pre-Launch Go/No-Go Decision

All items marked **[BLOCKER]** must be complete before launch. Items marked **[RECOMMENDED]** should be addressed but are not hard blockers.

---

## 1. Technical Infrastructure

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 1.1 | Backend deployed to production (Render/Railway) | Dev | ☐ | BLOCKER |
| 1.2 | Database (PostgreSQL) provisioned and migrated | Dev | ☐ | BLOCKER |
| 1.3 | DNS configured: api.boomcard.bg → backend | Dev | ☐ | BLOCKER |
| 1.4 | DNS configured: boomcard.bg → frontend | Dev | ☐ | BLOCKER |
| 1.5 | SSL certificates active (HTTPS) for all domains | Dev | ☐ | BLOCKER |
| 1.6 | CDN configured for static assets | Dev | ☐ | RECOMMENDED |
| 1.7 | PM2 process manager configured | Dev | ☐ | BLOCKER |
| 1.8 | Sentry error tracking active | Dev | ☐ | BLOCKER |
| 1.9 | Health check monitoring (uptime robot or similar) | Dev | ☐ | BLOCKER |
| 1.10 | Database backups configured (daily) | Dev | ☐ | BLOCKER |
| 1.11 | Redis/caching layer (if needed) | Dev | ☐ | RECOMMENDED |
| 1.12 | WebSocket server operational | Dev | ☐ | RECOMMENDED |
| 1.13 | Run production-readiness.sh script — all checks pass | Dev | ☐ | BLOCKER |

## 2. Payment Systems

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 2.1 | Paysera production account activated | Finance | ☐ | BLOCKER |
| 2.2 | Paysera production API keys configured | Dev | ☐ | BLOCKER |
| 2.3 | Paysera callback URL set to production domain | Dev | ☐ | BLOCKER |
| 2.4 | Stripe production account activated (if dual gateway) | Finance | ☐ | RECOMMENDED |
| 2.5 | Test payment end-to-end in production (€1 test) | QA | ☐ | BLOCKER |
| 2.6 | Refund process tested end-to-end | QA | ☐ | BLOCKER |
| 2.7 | Webhook signature verification confirmed in production | Dev | ☐ | BLOCKER |

## 3. Legal & Compliance

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 3.1 | Company registered (ЕООД at Търговски регистър) | Legal | ☐ | BLOCKER |
| 3.2 | КЗЛД data controller registration | Legal | ☐ | BLOCKER |
| 3.3 | Terms of Service published and accessible | Dev | ☐ | BLOCKER |
| 3.4 | Privacy Policy (GDPR-compliant) published | Dev | ☐ | BLOCKER |
| 3.5 | Cookie Policy published | Dev | ☐ | BLOCKER |
| 3.6 | Refund Policy published | Dev | ☐ | BLOCKER |
| 3.7 | Cookie consent banner functional | QA | ☐ | BLOCKER |
| 3.8 | GDPR data export endpoint tested | QA | ☐ | BLOCKER |
| 3.9 | GDPR account deletion endpoint tested | QA | ☐ | BLOCKER |
| 3.10 | Registration requires terms acceptance (web + mobile) | QA | ☐ | BLOCKER |
| 3.11 | GA4 only loads after analytics consent | QA | ☐ | BLOCKER |

## 4. Operations

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 4.1 | Support email configured: support@boomcard.bg | Ops | ☐ | BLOCKER |
| 4.2 | Privacy email configured: privacy@boomcard.bg | Ops | ☐ | BLOCKER |
| 4.3 | Partner email configured: partners@boomcard.bg | Ops | ☐ | RECOMMENDED |
| 4.4 | Support ticketing system set up (Freshdesk/Zendesk/email) | Ops | ☐ | RECOMMENDED |
| 4.5 | Escalation procedures documented | Ops | ☐ | RECOMMENDED |
| 4.6 | On-call rotation defined (who responds when) | Ops | ☐ | BLOCKER |
| 4.7 | Incident response playbook created | Ops | ☐ | RECOMMENDED |

## 5. Financial

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 5.1 | Company bank account opened | Finance | ☐ | BLOCKER |
| 5.2 | Paysera merchant account linked to bank | Finance | ☐ | BLOCKER |
| 5.3 | Invoicing system set up (automated or manual) | Finance | ☐ | RECOMMENDED |
| 5.4 | Accounting software configured | Finance | ☐ | RECOMMENDED |
| 5.5 | VAT registration (if applicable, >BGN 100K revenue) | Finance | ☐ | RECOMMENDED |

## 6. Marketing & App Store

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 6.1 | Apple App Store listing published | Marketing | ☐ | BLOCKER |
| 6.2 | Google Play Store listing published | Marketing | ☐ | BLOCKER |
| 6.3 | App Store screenshots (6.7" and 5.5") prepared | Marketing | ☐ | BLOCKER |
| 6.4 | App Store description (EN + BG) written | Marketing | ☐ | BLOCKER |
| 6.5 | Social media accounts active (Facebook, Instagram, LinkedIn) | Marketing | ☐ | RECOMMENDED |
| 6.6 | Launch announcement prepared | Marketing | ☐ | RECOMMENDED |
| 6.7 | Landing page SEO meta tags configured | Dev | ☐ | RECOMMENDED |

## 7. Partner Readiness

| # | Task | Owner | Status | Blocker? |
|---|------|-------|--------|:--------:|
| 7.1 | Minimum 5 partners onboarded | Partnerships | ☐ | BLOCKER |
| 7.2 | All partner venues have published offers | Partnerships | ☐ | BLOCKER |
| 7.3 | BOOM stickers deployed at all venues | Partnerships | ☐ | BLOCKER |
| 7.4 | Staff training completed at all venues | Partnerships | ☐ | BLOCKER |
| 7.5 | End-to-end test at each venue (scan + redeem) | QA | ☐ | BLOCKER |

---

## Go/No-Go Decision

**Date:** _______________
**Decision makers:** _______________

| Category | Blockers Remaining | Ready? |
|----------|:-----------------:|:------:|
| Technical | ___ / 13 | ☐ |
| Payments | ___ / 7 | ☐ |
| Legal | ___ / 11 | ☐ |
| Operations | ___ / 7 | ☐ |
| Financial | ___ / 5 | ☐ |
| Marketing | ___ / 7 | ☐ |
| Partners | ___ / 5 | ☐ |

**Final Decision:** ☐ GO / ☐ NO-GO

**Notes:**
_______________________________________________
