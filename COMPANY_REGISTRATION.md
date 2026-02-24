# Company Registration & Administration

## Entity Type

**ЕООД** (Еднолично дружество с ограничена отговорност / Single-Member Limited Liability Company)

This is the standard Bulgarian entity for a tech startup with a single founder. If multiple founders, use **ООД** instead.

## Registration at Търговски регистър (Commercial Register)

### Required Documents

| Document | Description | Notes |
|----------|-------------|-------|
| Articles of Association (Дружествен договор) | Company charter | Template available from notary |
| Declaration of consent (Съгласие на управител) | Manager accepts appointment | Notarized |
| Specimen signatures (Образец от подписи) | Manager's signature sample | Notarized |
| Capital deposit receipt | Bank proof of initial capital | Minimum BGN 2 (recommended BGN 100+) |
| Application form А4 | Standard registry form | Available at registryagency.bg |
| Declaration per Art. 13(4) ZTR | No outstanding public debts | Signed |
| Registered address consent | Proof of office address | Rental agreement or ownership deed |

### Registration Steps

1. **Choose company name** — Check availability at brra.bg (Търговски регистър)
2. **Draft Articles of Association** — Standard template, can include digital services activity code
3. **Open capital deposit account** — Any Bulgarian bank, deposit minimum BGN 2
4. **Notarize documents** — Manager consent and signature specimens
5. **Submit to Търговски регистър** — Online via brra.bg or in person at Агенция по вписванията
6. **Receive EIK (ЕИК)** — 9-digit company number, typically within 3-5 business days
7. **State fee** — BGN 110 (online) or BGN 160 (in person)

### NACE Activity Codes (КИД)

Primary code: **62.01** — Computer programming activities
Secondary codes:
- **62.09** — Other IT and computer activities
- **63.11** — Data processing and hosting
- **47.91** — Retail sale via mail order houses or internet
- **73.11** — Advertising agencies (if marketing services)

## Tax Registration

### NRA (НАП) Registration
- **Automatic** upon Търговски регистър registration
- No separate action needed for corporate tax

### VAT (ДДС) Registration
- **Mandatory** when revenue exceeds **BGN 100,000** in any 12-month period
- **Voluntary** registration possible at any time (recommended if EU B2B transactions)
- Register at local НАП office with Application form (Приложение към ЗДДС)

### Tax Rates
| Tax | Rate | Notes |
|-----|:----:|-------|
| Corporate income tax | 10% | Flat rate |
| Dividend tax | 5% | Withholding |
| VAT | 20% | Standard rate |
| Social contributions | ~31% | Employer portion on salaries |

## КЗЛД (Data Protection Authority) Registration

### Required for GDPR Compliance

As a data controller processing personal data, BoomCard must register with:

**Комисия за защита на личните данни (КЗЛД)**
- Address: бул. „Проф. Цветан Лазаров" № 2, 1592 София
- Website: cpdp.bg
- Registration: Submit notification as data controller
- DPO: Designate Data Protection Officer (can be the founder initially)
- Contact: privacy@boomcard.bg (must be listed in Privacy Policy)

## Bank Account

### Recommended Banks for Startups

| Bank | Online Banking | EUR Account | Notes |
|------|:--------------:|:-----------:|-------|
| DSK Bank | Yes | Yes | Good digital banking, reasonable fees |
| UniCredit Bulbank | Yes | Yes | Strong international banking |
| Fibank | Yes | Yes | Startup-friendly, fast onboarding |
| Revolut Business | Yes | Yes | Low fees, multi-currency, EU IBAN |

### Account Requirements
- BGN current account (primary)
- EUR current account (for Paysera/Stripe settlements)
- Connected to Paysera merchant account for payouts

## Payment Gateway Production Setup

### Paysera (Primary)
1. Create Paysera business account at paysera.com
2. Submit company documents (EIK, Articles of Association, ID)
3. Verification process: 3-5 business days
4. Receive production project ID and API credentials
5. Configure callback URL: `https://api.boomcard.bg/api/payments/callback`
6. Enable desired payment methods (cards, bank transfer, e-wallets)

### Stripe (Secondary)
1. Create Stripe account at stripe.com
2. Complete KYC verification (Bulgarian entity)
3. Receive production API keys
4. Configure webhook endpoint: `https://api.boomcard.bg/api/webhooks/stripe`
5. Note: Stripe operates via EU-US Data Privacy Framework (relevant for GDPR)

## Annual Obligations

| Obligation | Deadline | Filed With |
|------------|----------|------------|
| Annual financial statements | 30 June | Търговски регистър |
| Corporate tax declaration | 31 March | НАП |
| Annual activity report | 30 June | НСИ (statistics) |
| VAT declarations (if registered) | Monthly, by 14th | НАП |
| Social contribution declarations | Monthly | НАП |
| GDPR annual review | Annually | Internal (document) |
| Data controller notification update | As needed | КЗЛД |

## Estimated Startup Costs

| Item | Cost (BGN) | Notes |
|------|:----------:|-------|
| Company registration | 110-160 | Online vs in-person |
| Notarization | 50-100 | Signatures and consent |
| Initial capital | 2-100 | Minimum BGN 2, recommended BGN 100 |
| Company stamp | 15-30 | Not legally required but commonly used |
| Bank account opening | 0-50 | Varies by bank |
| Paysera verification | 0 | Free |
| Domain registration (boomcard.bg) | 30-50/year | .bg domain |
| Hosting (first month) | 50-200 | Render/Railway/AWS |
| **Total estimated** | **~300-700** | |
