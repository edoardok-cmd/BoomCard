# BoomCard — Partner Portal Reference Specification

**Extracted from:**
- `05-consolidated-unified-spec.md` (Unified Spec v1.2, 2026-05-29) — primary source
- `02-partner-module-final.md` (Partner Module — Final Technical Specification) — supplementary source

**Purpose:** Standalone reference for engineers implementing or auditing the Partner Portal and all partner-facing business logic.  
**Scope:** All entities, state machines, workflows, permissions, business rules, notification triggers, data integrity constraints, and clash-resolution decisions that the Partner Portal owns, enforces, or acts as the primary actor in.  
**Excluded:** Admin Panel internals (§3.x of consolidated spec), User App experience (§5.x), implementation priority tiers (§9.x).  
**This document is self-contained.** A reader must not need any other file to understand any rule documented here.

**Content exclusive to `02-partner-module-final.md` (not present in `05-consolidated-unified-spec.md`):**
The following sections contain material that exists only in the supplementary source. Engineers working solely from the consolidated spec will not find this content there:
- §1.3 — 9-stage operational lifecycle table (Пауза/Спрян/Архивиран UI labels and mapping note)
- §2.3 — Application form (all 14 fields with required/optional and behavior notes)
- §2.4 — Post-submission actions table
- §2.5 — Connection with admin module table
- §3.1 — Onboarding components table and activation rule
- §3.2 — Account activation steps (structural sequence; 72h/one-time-use detail is from §1.6, §3.5 of consolidated spec)
- §5.2 — Exact portal menu labels (Табло / Транзакции / Финанси / Профил и партньорство / Помощ / Изход) and label rule
- §5.3 — Dashboard element table
- §5.4 — Profile and Partnership element table
- §5.5 — Help element table
- §5.6 — Logout element table
- §6 — Transactions view column and filter details
- §7.1 — Finance monthly reports and payment history detail tables
- §8 — Receipt template collection detail and partner constraint note
- §10.1 — Hybrid communication model and `office@` / `support@` channel distinction
- §10.3 — Request tracking requirements (status, history, owner, audit trail)
- §11.1 — Full permissions matrix table
- §11.3 — Explicit list of what is never shown to the partner
- §11.4 — Admin authority over partner data (checklist items)

---

## Table of Contents

1. [Partner Account Lifecycle (State Machine)](#1-partner-account-lifecycle-state-machine)
2. [Partner Application Status Lifecycle](#2-partner-application-status-lifecycle)
3. [Onboarding Process](#3-onboarding-process)
4. [QR Code Lifecycle (Partner View)](#4-qr-code-lifecycle-partner-view)
5. [Partner Portal — Self-Service](#5-partner-portal--self-service)
6. [Transactions View](#6-transactions-view)
7. [Financial Management (Partner View)](#7-financial-management-partner-view)
8. [Receipt Templates (Onboarding Component)](#8-receipt-templates-onboarding-component)
8a. [Offer and Menu Management](#8a-offer-and-menu-management)
9. [Notifications (Partner-Facing)](#9-notifications-partner-facing)
10. [Communication Model and Help System (Partner View)](#10-communication-model-and-help-system-partner-view)
11. [Permissions Matrix](#11-permissions-matrix)
12. [Data Integrity Atomic Rules (Partner Domain)](#12-data-integrity-atomic-rules-partner-domain)
13. [Clash Resolution Decisions Affecting Partner Behavior](#13-clash-resolution-decisions-affecting-partner-behavior)
14. [Canonical Field Names and Terminology](#14-canonical-field-names-and-terminology)

---

## 1. Partner Account Lifecycle (State Machine)

### 1.1 Status Field Name and Enum

**Status Field Name:** `partner_account_status`  
**Status Enum (canonical):** `Active | Inactive | Archived`

The canonical enum has exactly three values and is never extended. The distinction between voluntary pause (Пауза) and admin-imposed deactivation (Спрян) within the Inactive status is stored in a separate `reason`/`sub_type` metadata field — it does not extend the enum. *(Source: §1.4 + §02 §1 Mapping note)*

### 1.2 Status Table

| Status | Definition | Login | View Transactions | Submit Support | Visible in Public Site | New Transactions |
|--------|-----------|-------|---------|---------|---|---|
| **Active** | Normal operation. Partner can log in, view transactions, and operate locations. | Yes | Yes | Yes | Yes (status visibility rule applies) | Yes |
| **Inactive** | Temporary pause. Partner retains read-only access to history; cannot operate new transactions. | Yes | Yes (read-only) | Yes | No (status rule overrides visibility field) | No |
| **Archived** | Historical status. No login, no operational access. Data and history retained. | No | No | No | No | No |

*(Source: §1.4)*

### 1.3 9-Stage Operational Lifecycle Table

The following table describes the full lifecycle stages used by the BoomCard operations team. Stages 1–4 map to the Partner Application entity; stages 5–9 map to the Partner Account entity.

*(Source: §02 §1)*

| Stage | Status / Label | What Happens | Portal Access |
|-------|---------------|-------------|---------------|
| 1 | New (Нова заявка) | Candidate submits form. A record is created in the admin panel. | No access |
| 2 | Комуникация | BoomCard initiates contact and takes ownership of the application. | No access |
| 3 | Договаряне | Terms, locations, participation level, and contract parameters are discussed. | No access |
| 4 | Onboarding | Partner record is created. Profile data, content, locations, QR codes, and sample receipts are collected. | No login access |
| 5 | Active | Profile validated; locations and QR codes are ready. Activation link sent. | Has access (Има достъп) |
| 6 | Пауза → `Inactive` | Temporary restriction on visibility or operation (voluntary operational pause). Maps to `Inactive` in the canonical enum. Partner retains read-only access; new transactions are blocked. | Read-only access |
| 7 | Спрян → `Inactive` | Partner deactivated by admin decision (imposed deactivation). Maps to `Inactive` in the canonical enum, with `reason`/`sub_type` field recording the reason. System behavior is identical to Пауза. | Read-only access, or no access per admin setting |
| 8 | Архивиран | Historical record with no active operational role. Reactivation is possible only via admin action, which triggers a new onboarding review. QR codes are NOT auto-reactivated — admin must explicitly reactivate each QR code individually. | No active role |
| 9 | Rejected | Application declined before activation. | No access |

> **Mapping note:** "Пауза" and "Спрян" are operational UI labels used in BoomCard for team communication. Both labels map to the canonical value `Inactive` in the database and in the API (`partner_account_status = Inactive`). The distinction between voluntary pause and admin-imposed deactivation is stored in a separate `reason`/`sub_type` field — NOT by extending the canonical enum. *(Source: §02 §1)*

### 1.4 Visibility Rule

Partner visibility is controlled by a **status-based rule that takes precedence over any separate visibility field:**

- `partner_account_status = Active` → Partner is visible in the public site.
- `partner_account_status = Inactive` → Partner is hidden from the public site, regardless of the visibility field setting.
- `partner_account_status = Archived` → Partner is hidden from the public site, regardless of the visibility field setting.

This precedence rule is enforced consistently in the admin panel, the API, and the frontend. *(Source: §1.4, Clash 9.1)*

### 1.5 QR Code Behavior on Partner Status Change

- Transition to **Inactive or Archived** → All QR codes for that partner **automatically deactivate** in the backend.
- Transition back to **Active from Inactive** → All QR codes **automatically reactivate** (no manual regeneration needed).
- **Exception — reactivation from Archived:** QR codes are NOT auto-reactivated. Admin must explicitly reactivate each QR code individually after partner Archived reactivation (Clash 2.4).
- QR codes **cannot** be manually activated while the partner's `partner_account_status` is Inactive or Archived.
- The mobile app displays appropriate feedback when a user attempts to scan an inactive QR code.

*(Source: §1.4, Clash 2.4; §8.1 rule 5 states the QR cascade but does not define the Archived exception — that is Clash 2.4 only)*

### 1.6 State Transitions

```
New (Application) → Communication → Negotiation → Onboarding → {Approved → Active, Rejected}

Active → Inactive (Пауза)         [admin action — voluntary pause]
Active → Inactive (Спрян)         [admin action — imposed deactivation]
Inactive → Active                  [admin action]
Active → Archived                  [admin action]
Inactive → Archived                [admin action]
Archived → Active                  [admin action + new onboarding review only; QR codes require explicit per-code reactivation]
```

### 1.7 Archived Reactivation Process

Partners reactivate from Archived status through admin action plus a new onboarding review. This is not a self-service path; it requires an explicit admin decision and a new onboarding review cycle. After reactivation, each QR code associated with the partner's locations must be explicitly reactivated by an admin — they are not auto-reactivated. *(Source: Clash 2.4)*

### 1.8 Consistency Rule

Status values must be identical in logic across frontend, backend, admin panel, notifications, and reports. *(Source: §02 §1 — "Правило" note)*

---

## 2. Partner Application Status Lifecycle

### 2.1 Status Field Name and Enum

**Status Field Name:** `partner_application_status`  
**Status Enum:** `New | Communication | Negotiation | Onboarding | Approved | Rejected`

*(Source: §1.6)*

### 2.2 Status Table

| Status | What Happens | Partner Access | Admin SLA |
|--------|-----------|---------|---|
| **New** | Application received from website form. No action taken. | None | 24h (internal) |
| **Communication** | Initial contact established. Responsible admin assigned. | None | 24h (internal) |
| **Negotiation** | Terms and commission discussed. | None | — |
| **Onboarding** | Terms accepted. Partner Account created with Inactive status. Partner gets read-only access to profile data entry. | Read-only | — |
| **Approved** | Onboarding validated for quality. Activation link generated and sent (valid 72h, one-time token). | Read-only; becomes Active on link click | — |
| **Rejected** | Application declined. Cannot be reopened in the same record. | None | — |

*(Source: §1.6)*

**SLA details:**

- **External promise:** "Response within 2 working days" (stated in form confirmation and auto-reply).
- **Internal SLA:** 24 hours from application creation for admin assignment; an alert is triggered if the deadline is approaching.
- **Activation link:** 72-hour validity; one-time use; older links are invalidated on resend.

### 2.3 Application Form Fields

The partner application form collects the following 14 fields. The form does NOT create a login account, does NOT require a password, and does NOT grant any portal access.

*(Source: §02 §2)*

| Section | Field | Required / Optional | Behavior Notes |
|---------|-------|---------------------|---------------|
| Лична информация | Име (First name) | Required | Contact person |
| Лична информация | Фамилия (Last name) | Required | Contact person |
| Лична информация | Имейл | Required | Confirmation and future communication |
| Лична информация | Телефон | Required | Contact |
| Бизнес информация | Име на бизнес | Required | Enters the partner application record |
| Бизнес информация | Категория | Required | Multi-select |
| Бизнес информация | Подкатегория | Required | Multi-select |
| Бизнес информация | Град | Required | Primary city |
| Обект | Адрес | Required | Primary location or first venue |
| Обект | Брой обекти | Required | Dropdown |
| Квалификация | Ниво на участие | Required | Options: Базово участие / Активно участие / Силен растеж |
| Допълнително | Свободен текст | Optional | Additional context |
| Съгласия | Общи условия | Required | Form submit is blocked without this |
| Съгласия | Политика за поверителност | Required | Form submit is blocked without this |
| Съгласия | Маркетингов консент | Optional | Can be toggled on or off later |

*(Source: §02 §2)*

**Post-submit rules:**

- The form does not create a login-capable account.
- The form contains no password field.
- After submit, a record is created with status `New` (Нова заявка).
- The partner receives no portal access before onboarding is complete.

### 2.4 Post-Submission Actions

| Action | What Must Happen | Where It Is Visible |
|--------|-----------------|---------------------|
| Record creation | Partner application record created with status New (Нова заявка). | Admin: Партньори > Заявки |
| Visual confirmation | Candidate sees confirmation message that the application was sent successfully. | Site / form |
| Internal processing | Application receives a date, status, history, and an assignee field. | Admin panel |
| External promise | Candidate may be informed that contact will be made within two working days. | Site / confirmation message |
| Internal SLA | Team must take ownership of the application within 24 hours. | Admin task / internal logic |
| Login restriction | No login screen is shown and no portal access is created for a Pending record. | Frontend / auth logic |

*(Source: §02 §3)*

### 2.5 Connection with Admin Module

| Partner Process | Admin Section | What is Managed in Admin |
|----------------|---------------|--------------------------|
| New partner application | Партньори > Заявки | Review, status, assignee, notes, history |
| Communication and negotiation | Партньори > Комуникация и онбординг | Contact, agreement, terms, follow-up |
| Onboarding | Партньори > Комуникация и онбординг | Content, locations, QR codes, sample receipts |
| Active partner | Партньори > Активни партньори | Profile, commission %, visibility, status, categories |
| Locations and QR codes | Партньори > Локации и QR кодове | Location ID, QR code, status, change history |
| Receipts | Партньори > Касови бележки | Receipt profile, merchant name variations, reference images |
| Finance | Финанси > Фактуриране към партньори | Turnover, commission %, liability, paid / unpaid |
| Help | Помощ > Всички заявки | Support requests, status, ownership, history |

*(Source: §02 §4)*

**Key distinction:** Partner Applications are the pre-sales onboarding process (SLA-tracked). Help Requests are operational support, disputes, and change requests (no SLA; routed by type). These are distinct entity types — the same Bulgarian term "Заявки" is disambiguated by the menu context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests. *(Source: §1.7, §7.2, Clash 8.1/8.3, Clash 10.1)*

---

## 3. Onboarding Process

### 3.1 Onboarding Components

The following components are collected and configured during the partner onboarding stage before portal access is granted.

*(Source: §02 §5)*

| Component | What Is Collected / Configured | Managed By |
|-----------|-------------------------------|------------|
| Основен профил (Core profile) | Business name, categories, subcategories, description, contacts, business hours. | BoomCard |
| Снимки и визуално съдържание (Images and visual content) | Venue photos, menus, additional links. | BoomCard + partner |
| Локации (Locations) | Each venue is entered as a separate location record. | BoomCard |
| QR кодове (QR codes) | A unique QR code is generated for each location. | BoomCard |
| Касови бележки (Receipts / Templates) | Sample receipts collected and merchant name variations recorded. | BoomCard + partner |
| Проверка (Validation) | Profile completeness is validated to ensure it meets the activation threshold. | BoomCard |

**Activation rule:** Portal access is granted only when the profile, locations, QR codes, and core data are all ready. The partner must not see an incomplete profile on first login. *(Source: §02 §5 — "Activation правило" note)*

### 3.2 Account Activation Steps

*(Source: §02 §6; activation link 72h / one-time-use detail: §1.6, §3.5)*

| Step | Description | Outcome |
|------|-------------|---------|
| 1. Completed onboarding | BoomCard confirms that the profile is ready. | Partner can be activated |
| 2. Activation link | System sends a link for password creation (valid 72h, one-time use). | Partner creates portal access credentials |
| 3. First login | Partner logs into the panel. | Partner sees only the final, approved menus |
| 4. Operational use | Partner monitors results, finances, transactions, and requests. | Partner works through the controlled partner panel |

---

## 4. QR Code Lifecycle (Partner View)

### 4.1 QR Code Status Enum

**Status Enum:** `Active | Inactive | In Processing | Replaced`

| Status | Meaning | Partner Can See | Can Be Scanned |
|--------|---------|---------|---|
| **Active** | Operational QR code at location. | Yes | Yes |
| **Inactive** | Temporarily deactivated (e.g., location closed, partner Inactive or Archived). | Yes | No |
| **In Processing** | Physical replacement order initiated. | Yes | No |
| **Replaced** | Physical replacement completed. New code is in Active status. | Yes (history only) | No |

*(Source: §3.6)*

All four QR statuses have defined transitions and semantics. *(Source: Clash 9.4)*

### 4.2 Auto-Deactivation and Auto-Reactivation Cascade

- `partner_account_status` changes to **Inactive** → All QR codes at all partner locations automatically deactivate (backend-enforced).
- `partner_account_status` changes to **Archived** → All QR codes at all partner locations automatically deactivate (backend-enforced).
- `partner_account_status` changes back to **Active from Inactive** → All QR codes automatically reactivate. No manual regeneration is required.
- **Exception (Archived reactivation):** QR codes do NOT auto-reactivate after an Archived partner is reactivated. Admin must explicitly reactivate each QR code individually. *(Source: Clash 2.4)*

### 4.3 What the Partner CAN and CANNOT Do with QR Codes

**The partner has read-only visibility only.** The following actions are reserved exclusively for admin.

| Action | Partner Can? | Admin Can? |
|--------|:-----------:|:----------:|
| View list of locations with QR codes | Yes | Yes |
| View QR code status (Active / Inactive / In Processing) | Yes | Yes |
| View history of QR code status changes | Yes | Yes |
| Generate new QR codes | No | Yes |
| Deactivate QR codes | No | Yes |
| Manually reactivate QR codes | No | Yes |
| View the raw QR token | No | Yes |

*(Source: §4.2)*

### 4.4 QR Architecture Rule

Every QR code is bound to a specific **location**, not just to the partner. Each location has its own unique QR code. *(Source: §02 §11 — QR architecture checklist item)*

---

## 5. Partner Portal — Self-Service

### 5.1 Access Rules by Status

| `partner_account_status` | Login | Transactions | Support Requests | New Transactions |
|--------------------------|-------|-------------|-----------------|-----------------|
| **Active** | Yes — full access | Full view and filtering | Yes | Yes |
| **Inactive** | Yes — read-only | Read-only (history only) | Yes | No |
| **Archived** | No | No | No | No |

*(Source: §4.1)*

**Read-only views (available to Active and Inactive partners):**

- Transaction history (all transactions, with filters by date / amount / location)
- Location and QR code list (QR code status only; cannot generate or edit)
- Commission and payout history
- Profile (view only; edits require a Change Request through the Help system)

**Editable fields (self-service, no Change Request required):**

- Notification preferences (email, SMS)
- Password (self-service reset via email)

**Actions that require a Help System request (Change Request):**

- Change commission rate or business parameters
- Update location details or add new locations
- Deactivate or modify QR codes
- Change payment or contact information

*(Source: §4.1)*

### 5.2 Portal Menu Structure

The partner portal menu uses the following exact labels. No variants are permitted.

*(Source: §02 §7)*

| # | Exact Label | Primary Functionality | Editable by Partner? |
|---|------------|----------------------|----------------------|
| 1 | Табло | Quick overview of key KPIs and financial status. | No |
| 2 | Транзакции | View transactions, amounts, statuses, and locations. | No |
| 3 | Финанси | Monthly reports, outstanding amounts, payment history, export. | No |
| 4 | Профил и партньорство | Contract parameters, core data, account manager, change requests. | Limited |
| 5 | Помощ | Support requests, statuses, history, and request communication. | Yes — own requests only |
| 6 | Изход | Terminate the current session. | Yes (logout action) |

**Label rule:** The menu section is named exactly "Помощ". Variants such as "Помощ и комуникация" or other extended labels must not be used. *(Source: §02 §7 label note)*

### 5.3 Табло (Dashboard)

*(Source: §02 §8.1)*

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| KPI cards | Number of visits, number of transactions, turnover, contracted commission %, expected amounts. | View only | Data sourced from transactions, locations, and finances. |
| Recent activity | Most recent transactions or most recent report changes. | View only | No editing. |
| Financial summary | Expected invoicing amounts and current financial status. | View only | Internal margin and cashback formula must NOT be shown. |

### 5.4 Профил и партньорство (Profile and Partnership)

*(Source: §02 §8.4)*

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| Основна информация | Business name, contacts, categories, locations, menu link. | Limited | Critical data goes through a Change Request. |
| Договорна отстъпка / процент | Contracted commission %, terms, partnership status. | View only | Not directly editable. |
| Account manager | Name and contact details of the BoomCard account manager. | View only | Managed from admin panel. |
| Маркетингов консент | Consent for partner communications and campaigns. | Yes | Does not affect operational access. |
| Заяви промяна | Request to change data, locations, or parameters. | Yes, via request | Change enters admin review workflow. |
| Закриване на акаунт | Request to close the account with a 30-day notice period. | Yes, via request | Not an immediate action. |

### 5.5 Помощ (Help)

*(Source: §02 §8.5)*

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| Нова заявка | Form for a support or operational question. | Yes | Creates a record in the system. |
| Моите заявки | History of the partner's own requests. | View | Cannot see other partners' requests. |
| Статус на заявка | Open, in review, resolved, closed, or other approved status. | View | Status is managed by BoomCard. |
| Комуникация по заявка | Messages and history for a specific request. | Yes | Partner sees only messages on their own requests. Status is managed by BoomCard. |

### 5.6 Изход (Logout)

*(Source: §02 §8.6)*

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| Logout | Terminate the current session. | Yes | A new login is required after logout. |

---

## 6. Transactions View

**Menu label:** Транзакции  
*(Source: §02 §8.2)*

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| Transaction list | Transaction ID, date, time, location, amount, commission %, discount, status. | View and filter | No editing, approval, or deletion. |
| Filters | Period, location, status, amount. | Yes | Filters do not modify data. |
| Transaction detail | Link to location, amount, status, reporting period. | View only | Internal risk logic is NOT shown. |

**Filter options:** Period, location, status, amount.

**Constraints:**

- Partner cannot edit, approve, or delete any transaction record.
- Internal risk logic and risk level are not visible in any transaction view.

---

## 7. Financial Management (Partner View)

**Menu label:** Финанси  
*(Source: §02 §8.3)*

### 7.1 Financial Views

| Element | What Is Shown | Action | Constraint |
|---------|--------------|--------|------------|
| Месечни справки (Monthly reports) | Turnover, contracted commission %, liability, paid / unpaid amounts. | View | No editing. |
| История на плащания (Payment history) | Period, status, amount, payment date. | View | No changing statuses. |
| Export | CSV / Excel export of permitted financial reports. | Yes | Partner's own data only. |

### 7.2 Monthly Reporting Cycle

Monthly reporting periods cycle through the following states:

```
Open → Under Review → Closed → Invoiced
```

Partners are invoiced based on **approved outturn only**. Cancelled and voided transactions are excluded from invoicing. *(Source: §3.7)*

### 7.3 Currency Display Rule

- The system operates in BGN.
- During the defined **BGN → EUR transition window**: amounts are displayed simultaneously in both BGN and EUR.
- **After the transition window closes**: BGN display is hidden; EUR only is shown.
- This rule applies to all monetary amounts visible to the partner (turnover, commissions, liabilities, payment history, export).

*(Source: §02 §8.3 Currency Display; §8.1 rule 4; Clash 12.1)*

### 7.4 What Is Never Shown in Finance

- Internal margin percentage
- Cashback formula / percentage split
- Risk logic or risk classification

*(Source: §02 §8.1 "Финансов summary" constraint; §02 §11 "No internal finance exposure" checklist item)*

---

## 8. Receipt Templates (Onboarding Component)

Receipt templates (Касови бележки) are collected during the onboarding stage and are managed jointly by BoomCard and the partner.

*(Source: §02 §5)*

**What is collected:**

- Sample receipt copies (примерни бележки) from the partner's venues.
- Variations in the merchant name as it appears on receipts (вариации в изписването на търговеца).
- Reference images used by the OCR system to match future receipt uploads against the partner's known template.

**Who manages:**

- BoomCard and the partner jointly collect this data during onboarding (see Onboarding Component table in §3.1).
- In the admin panel, this is managed under: Партньори > Касови бележки — covering receipt profile, merchant name variations, and reference images. *(Source: §02 §4)*

**Partner constraint after onboarding:**

- The partner cannot modify receipt templates or merchant name variations through the Partner Portal after onboarding.
- Any changes to receipt templates require a Change Request through the Help system, which enters admin review.

*(Source: §02 §11 — "Change requests" checklist item; §4.1 — "Editable Fields" and "Actions Requiring Help System Request" in Partner Portal)*

---

## 8a. Offer and Menu Management

**Not defined in source specs.** Neither `05-consolidated-unified-spec.md` nor `02-partner-module-final.md` contains any requirements for offer or menu management as a partner-owned workflow. The term "offer" does not appear in either source file.

The consolidated spec references "menus" only in the context of onboarding visual content ("Снимки и визуално съдържание — Снимки на обекта, менюта, допълнителни линкове") collected during onboarding, which is an admin-managed activity, not a partner self-service workflow.

**Any offer or menu management feature for the Partner Portal requires a separate product specification before implementation.** Implementors should not infer or invent behavior for this area.

---

## 9. Notifications (Partner-Facing)

### 9.1 Canonical Partner Notification Templates

All 8 partner notification categories, their triggers, and the system that sends them.

*(Source: §6.1)*

| # | Template | Trigger |
|---|----------|---------|
| 1 | **Activation Link** | Sent after onboarding approval. Link is valid for 72 hours (one-time use). |
| 2 | **Onboarding Follow-Up** | Reminder sent to partner to complete profile data entry. |
| 3 | **New Transaction** | Daily or weekly digest of transactions at partner locations. |
| 4 | **Monthly Financial Summary** | Payout and invoice summary at the end of each monthly reporting period. |
| 5 | **Request Updates** | Status updates on Help Requests or Change Requests submitted by the partner. |
| 6 | **Status Changes** | Notification when the partner's `partner_account_status` changes (Active / Inactive / Archived). |
| 7 | **Contract Changes** | Notification of commission rate or contract terms updates. |
| 8 | **Marketing** | Campaigns, feature updates, product news. |

### 9.2 Key Asymmetry — Partners vs. Users

**Partners ARE notified of account status changes** (operational requirement).  
**Users are NOT notified of account status changes** (intentional design decision).

This asymmetry is explicit and binding. *(Source: §6.1 "Key Distinction"; Clash 6.6)*

### 9.3 Activation Link Details

- Generated by admin when the application status transitions to **Approved**.
- Valid for **72 hours** from generation.
- **One-time use**: the link is invalidated after the partner clicks it.
- If the link expires or must be resent, all older links are invalidated on resend.
- Clicking the activation link transitions the Partner Account status from Inactive (Onboarding) to **Active**.

*(Source: §1.6, §3.5 Admin Workflow)*

---

## 10. Communication Model and Help System (Partner View)

### 10.1 Inbound Communication Model

The communication model is **Hybrid (email inbound + form inbound → unified request system)**.

*(Source: §02 §9)*

| Channel | How It Works |
|---------|-------------|
| Email to office@boomcard.bg | The email gateway parses the incoming email and creates a request in the unified system. An auto-reply is sent to the sender with a numeric request reference number. |
| Form in Partner Portal (Помощ > Нова заявка) | Directly creates a request in the unified system. |

**Note on email addresses:** `office@boomcard.bg` is the partner-facing communication channel for partner requests and notifications. `support@boomcard.bg` is the inbound channel for user support and admin support. *(Source: §02 §9)*

### 10.2 Request Routing and Assignment

Routing and assignment are **fully manual**.

- All incoming requests (from email and from form) automatically enter a shared "Unassigned" queue visible to all administrators.
- Any administrator can claim a request.
- Super Admin can reassign a claimed request.

*(Source: §02 §9; §3.8; Clash 7.2)*

### 10.3 Request Tracking Requirements

Every request must have:

- Status
- History
- Owner / Assignee
- Full audit trail and traceability

*(Source: §02 §9; §02 §11 "Ticketing readiness" checklist item)*

### 10.4 Request Lifecycle (Partner Visibility)

**Status Field Name:** `request_status`  
**Status Enum:** `New | In Progress | Waiting | Closed | Cancelled`  
**Request Type Enum:** `Support | Dispute | Change | Other`

| Status | What It Means | Partner Can View |
|--------|--------------|-----------------|
| **New** | Received via form or email. | Yes |
| **In Progress** | Being investigated or acted upon. | Yes |
| **Waiting** | Response sent to partner; awaiting reply, document, or internal/external verification. Set by admin. | Yes |
| **Closed** | Resolved. | Yes (history) |
| **Cancelled** | Withdrawn or invalid. | Yes (history) |

*(Source: §1.7)*

**No SLA applies to Help Requests.** This is distinct from Partner Applications, which have a 24h internal / 2-working-day external SLA. *(Source: §1.7; Clash 11.1)*

### 10.5 Email Threading (v1.2 Scope)

- All Help Requests have email threading capability.
- Partners can reply to request status updates via email.
- Email conversations are stored as unified threads in the help system.

**Threading markers in v1.2:**

- **Primary:** `X-BoomCard-Request-ID` header.
- **Fallback:** `[#XXXX]` subject line pattern.
- **Plus-addressing** (`request-1234@boomcard.bg`) is **deferred to v1.3**. v1.2 does not require email-server routing of `+suffixed` addresses. All threading in v1.2 relies solely on the header and subject-pattern fallback.

*(Source: §6.2; Clash 7.1)*

### 10.6 Office@ Dual Role

The `office@boomcard.bg` address serves two simultaneous roles:

- **Outbound:** Sends Partner Application notifications, status update emails, and marketing communications.
- **Inbound:** Email parser creates unified Help Requests from mail sent to `office@boomcard.bg`.

Both roles are active simultaneously. *(Source: §6.2; Clash 8.3)*

### 10.7 Change Requests as the Only Partner-Initiated Modification Channel

Partners cannot directly edit critical fields through the Partner Portal. The following actions require the partner to submit a Change Request through the Help system (Помощ > Заяви промяна), which then enters admin review:

- Change commission rate or business parameters
- Update location details or add new locations
- Deactivate or modify QR codes
- Change payment or contact information
- Close the partner account (30-day notice period applies; not an immediate action)

*(Source: §4.1; §02 §8.4; §02 §10)*

---

## 11. Permissions Matrix

### 11.1 Full Permissions Matrix

*(Source: §02 §10)*

| Action / Data | Partner | BoomCard Admin | Note |
|---------------|:-------:|:--------------:|------|
| View KPIs | Yes | Yes | Partner sees their own data only. |
| View transactions | Yes | Yes | Partner sees their own transactions only. |
| Edit transactions | No | Yes | Only via admin logic. |
| Change commission % | No | Yes | Goes through contractual / admin procedure. |
| Change QR code | No | Yes | Managed from admin panel. |
| Change locations | Via request only | Yes | Not direct editing. |
| Marketing consent | Yes | Yes | Partner can toggle on and off. |
| Submit support request | Yes | Yes | Partner sees only their own requests. |
| Close account | Via request only | Yes | 30-day notice period. |

### 11.2 Access Rights by Account Status (Cross-Reference with §5.1)

| Permission | Active | Inactive | Archived |
|------------|:------:|:--------:|:--------:|
| Log in | Yes | Yes | No |
| View transaction history | Yes | Yes (read-only) | No |
| Submit support / help requests | Yes | Yes | No |
| Initiate new transactions | Yes | No | No |
| Visible in public site | Yes | No | No |
| Access any portal section | Yes | Read-only | No |

### 11.3 What Is Never Shown to the Partner

The following data is internal-only and must never be surfaced in the Partner Portal:

- Internal margin percentage (the margin % component of the business formula)
- Cashback formula / cashback percentage split
- Internal risk logic or risk level classification applied to any transaction
- Raw QR token value

*(Source: §02 §8.1 "Финансов summary" constraint; §02 §8.2 "Детайл на транзакция" constraint; §02 §11 "No internal finance exposure" and "Partner visibility" checklist items; §4.2 — "Partner Cannot" list)*

### 11.4 Admin Authority Over Partner Data

All critical partner parameters are managed exclusively from the admin panel. The partner cannot:

- Directly edit commission rate, business category, or visibility field.
- Directly generate, deactivate, or reactivate QR codes.
- Directly modify location records.
- Directly modify receipt templates.

All partner-initiated changes to critical fields go through a Change Request in the Help system. *(Source: §02 §11 "Admin authority" checklist item; §4.1)*

---

## 12. Data Integrity Atomic Rules (Partner Domain)

The following rules are non-negotiable constraints for any implementation touching partner-owned behavior.

*(Source: §8.1; §1.4; Clash resolutions)*

**1. Partner Status → QR Code Cascade:**

- `partner_account_status` changes to Inactive or Archived → All QR codes for that partner automatically deactivate (backend-enforced).
- `partner_account_status` changes to Active from Inactive → All QR codes automatically reactivate (no regeneration required).
- Exception: if the partner was Archived, QR codes require explicit admin per-code reactivation — they are NOT auto-reactivated.
- QR codes cannot be manually activated while `partner_account_status` is Inactive or Archived.

**2. Visibility Rule (Status Overrides Visibility Field):**

- `partner_account_status = Inactive` or `Archived` → Partner is always hidden from the public site, regardless of any separate visibility field value.
- This rule is enforced consistently in the frontend, the API, and the admin panel. No code path may allow an Inactive or Archived partner to appear publicly.

**3. Partner Cannot Make Direct Edits to Critical Fields:**

- Commission rates, business parameters, location details, QR codes, payment information, and contact information cannot be changed by the partner through direct portal edits.
- Change requests submitted through the Help system are the only partner-initiated modification channel.

**4. Change Request as Exclusive Modification Channel:**

- Submitting a Change Request creates a record for admin review — it does not apply the change immediately.
- The partner must be shown that the change is pending review, not that it has already taken effect.

**5. Archived Reactivation Requires Full Onboarding Review:**

- No partner account can transition from Archived to Active without an explicit admin action AND a new onboarding review cycle.
- QR codes are not auto-reactivated in this path; each code requires explicit admin activation.

**6. Partner Data Isolation:**

- Partner sees only their own transactions, financial reports, QR codes, locations, and help requests.
- No cross-partner data is accessible through the Partner Portal.

**7. Receipt Scanning Gate (Indirect Rule — Partner QR Active Status Required):**

- A user can only scan a QR code and create a transaction at a partner location if the QR code is in Active status.
- A QR code at an Inactive or Archived partner's location will be in Inactive status and cannot be scanned. The mobile app displays appropriate feedback when a user attempts to scan an inactive QR code.

**8. Invoicing Based on Approved Outturn Only:**

- Partners are invoiced based on approved transactions in completed reporting periods.
- Cancelled and voided transactions are excluded from invoice calculations.

*(Source: §3.7; §8.1)*

---

## 13. Clash Resolution Decisions Affecting Partner Behavior

The following clash resolutions from §10 of the consolidated spec directly constrain or define partner module behavior. Each is included as a binding rule.

*(Source: §10)*

| Clash ID | Resolution Binding on Partner Module |
|----------|--------------------------------------|
| **2.4** | Archived partner reactivates via admin action + new onboarding review. QR codes require explicit admin reactivation per code — NOT auto-reactivated after Archived reactivation. |
| **5.1** | Risk combining function is additive: IBAN change +40, receipt match <60% +30, location mismatch +20, 3+ Voided records +20, partner risk flag +10. Thresholds: 0–20 Low, 21–50 Medium, 51+ High. Risk level is internal-only and must NOT be shown to the partner. |
| **6.1** | Partner notification template list is canonical: exactly 8 templates (Activation Link, Onboarding Follow-Up, New Transaction, Monthly Financial Summary, Request Updates, Status Changes, Contract Changes, Marketing). No other templates. |
| **6.6** | Partners ARE notified of account status changes (operational requirement). Users are NOT notified of account status changes (intentional asymmetry). |
| **7.1** | Plus-addressing deferred to v1.3. v1.2 threading uses only: `X-BoomCard-Request-ID` header (primary) and `[#XXXX]` subject pattern (fallback). |
| **7.2** | Request assignment is fully manual: shared "Unassigned" queue; any admin can claim; Super Admin can reassign. |
| **8.1/8.3** | Partner Application form creates a Partner Application record. Email to `office@` creates a unified Help Request. These are distinct entity types. |
| **8.3** | `office@boomcard.bg` both sends outbound notifications and parses inbound mail. Both roles are active simultaneously. |
| **9.1** | Status rule takes precedence over the visibility field: Inactive and Archived partners are always hidden from the public site regardless of the visibility field value. Enforced in admin panel, API, and frontend. |
| **9.4** | All four QR statuses (Active, Inactive, In Processing, Replaced) have defined transitions and semantics. |
| **10.1** | "Заявки" (Bulgarian) is overloaded. Disambiguate by menu context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests. |
| **11.1** | Help Requests have no SLA. This is distinct from Partner Applications, which have a 24h internal / 2-working-day external SLA. |
| **12.1** | Dual-currency display during BGN→EUR transition window; BGN hidden after window closes. Applies to all partner-facing monetary amounts. |
| **3.5** | "Locked" cashback status and the reporting "period lock" are independent. The monthly reporting cycle (Open → Under Review → Closed → Invoiced) is a separate layer from the cashback state machine. |
| **3.6** | Expired and Voided cashback records are unaffected by any partner or subscription status changes. These are terminal cashback states. |
| **10.6** | "Бизнес формула" (Business Formula) is the three-way percentage-split algorithm: partner commission %, cashback %, and margin %. The margin % and cashback % components are internal-only and must never be shown to the partner in any portal view. |

---

## 14. Canonical Field Names and Terminology

### 14.1 Status Field Names Relevant to Partners

*(Source: §7.1)*

| Entity | Status Field Name | Values |
|--------|---------|---|
| Partner Account | `partner_account_status` | Active, Inactive, Archived |
| Partner Application | `partner_application_status` | New, Communication, Negotiation, Onboarding, Approved, Rejected |
| Request | `request_status` | New, In Progress, Waiting, Closed, Cancelled |
| QR Code | *(no qualified name given in spec; referenced by status value)* | Active, Inactive, In Processing, Replaced |

**Note on sub_type / reason field:** The `reason`/`sub_type` field is attached to `partner_account_status = Inactive` to distinguish Пауза (voluntary pause) from Спрян (admin-imposed deactivation). This is a metadata field; it does not extend the canonical enum. *(Source: §1.4; §02 §1)*

**UI localization:** Display names shown to the partner are in Bulgarian (e.g., "Пауза", "Спрян"). The backend database uses the English canonical enum values above. *(Source: §7.1 — "UI Localization" note)*

### 14.2 Terminology Distinctions

*(Source: §7.2)*

| Term | Definition | Context |
|------|-----------|---------|
| **Partner Application** | Pre-sales onboarding record created from the website form. Status-tracked separately from the Partner Account. | Admin > Partners > Applications; has SLA |
| **Partner Account** | Operational account after onboarding approval. Represents the active / inactive / archived partner entity. | Partner Portal; Admin > Partners > Active Partners |
| **Help Request** (Unified Requests) | Support, dispute, or change request created via form or email. Routed to the correct admin team. No SLA. | Помощ > Моите заявки (Partner Portal); Admin > Help > All Requests |
| **Change Request** | A specific type of Help Request (`type = Change`) used by the partner to request modifications to critical fields. | Профил и партньорство > Заяви промяна |
| **Заявка (Bulgarian)** | Overloaded term. Disambiguated by context: "Партньори > Заявки" = Partner Applications; "Помощ > Заявки" = Help Requests. | Admin menus; partner portal |
| **Пауза** | Operational UI label for a voluntary partner pause. Maps to `partner_account_status = Inactive` with `reason`/`sub_type` indicating voluntary pause. | Operations team; admin panel |
| **Спрян** | Operational UI label for an admin-imposed deactivation. Maps to `partner_account_status = Inactive` with `reason`/`sub_type` indicating imposed deactivation. System behavior is identical to Пауза. | Operations team; admin panel |
| **Архивиран** | Operational label for the Archived status. No active operational role; reactivation requires admin action + new onboarding review. | Operations team; admin panel |

### 14.3 Canonical Acronyms

*(Source: §7.3)*

| Term | Definition |
|------|-----------|
| **IBAN** | International Bank Account Number. Required for user payouts; not directly relevant to partner portal self-service but appears in partner financial reporting. |
| **QR** | Quick Response code. Location-specific token for transaction initiation. Each QR code is bound to a specific location, not just to the partner. |
| **OCR** | Optical Character Recognition. Processes receipt images and matches them against the partner's registered receipt template. |
| **SLA** | Service Level Agreement. 24h internal / 2 working days external for Partner Applications. No SLA for Help Requests. |
| **Risk Level** | Internal-only classification (Low, Medium, High). Applied to cashback/transaction records. Never visible to the partner. |
| **Payout Threshold** | Plan-specific minimum Cleared cashback balance required to trigger an automatic user payout. Referenced in partner financial reporting context. |
| **Бизнес формула (Business Formula)** | The three-way percentage-split algorithm: partner commission %, cashback %, and margin %. The margin % and cashback % components are internal-only and must never be shown to the partner. *(Source: Clash 10.6)* |

---

*This document is extracted from `05-consolidated-unified-spec.md` (BoomCard Unified Specification v1.2, 2026-05-29) and `02-partner-module-final.md` (Partner Module — Final Technical Specification). It supersedes any earlier standalone Partner spec for implementation and audit purposes. Do not modify the source files.*
