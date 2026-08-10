# BoomCard Admin Module v1.2 — Logic Clashes (Independent Pass)

**Source spec:** `BoomCard_Admin_Modul_v1_2_FINAL_CLEAN_revised.docx` — Финална спецификация v1.2, дата 27.05.2026 **Pass written:** 2026-05-27 **Method:** Fresh read of the .docx (all paragraphs \+ 48 tables, indices 0–47) without referencing any prior analysis. Each item below cites the specific section, table, or row where the contradiction or gap originates.

**What this document is.** A reader-actionable catalogue of every contradiction, gap, ambiguity, and terminology overload discovered in v1.2 of the Admin Module spec. Entries are written so the spec author can fix in place, an engineer can decide what blocks implementation, and a PM can sequence the doc-fix work without re-reading the source spec from scratch.

**How to triage.** Items are graded:

- **C — Contradiction.** Two parts of the spec say incompatible things. *Gate spec releases on these.*  
- **G — Gap.** A rule referenced or implied by the spec but never stated. *Gate implementation on these — the engineer cannot ship without a rule.*  
- **A — Ambiguity.** Multiple valid readings of the same rule. *Gate spec polish on these — pick one reading and commit it.*  
- **T — Terminology overload.** One word, multiple meanings, no qualifier. *Gate naming conventions / schema on these.*

The closing **Recommended order to close these** section sequences the highest-leverage fixes; the body remains organised by topic.

---

## 1\. Cross-references and structural inconsistencies

### 1.1 (C) Wrong §-reference in the "Заяви промяна" channel row

**Where:** Table of incoming-request channels under §11.1 — the row `„Заяви промяна" в Partner панел (§8.4)`. **Clash:** §8.4 is **Списъци** (audience segments: Premium, Basic, неактивни абонати …). The actual change-request rule lives in **§5.5** (Касови бележки), specifically TABLE 19's *„Контрол върху промени"* row: *„Промени в процент, модел на работа или локации минават като request през „Заяви промяна" (виж §11)"*. **Effect:** A reader following the §8.4 pointer lands in marketing/segmentation; engineers wiring the "Заяви промяна" button against §8.4 would build the wrong page.

### 1.2 (C) §14 calls §5.3's matrix a "source of truth for access control" — but the matrix is partner-only

**Where:** §14 checklist: *„Матрицата на правата за account statuses Active / Inactive / Archived е source of truth за access control."* vs §5.3 matrix (TABLE 16). **Clash:** TABLE 16 rows include *„Видим в публичната част на сайта"*, *„Нови транзакции / QR активност"*, and *„QR ефект при Inactive / Archived status"* — all partner-specific. None of these apply to User accounts (§4.1) or Admin accounts (§10.1). For Users, the same Active/Inactive/Archived triple is *named* in §4.1 but not given an access-control matrix. For Admins, the status set itself is not enumerated anywhere — see 2.6. **Effect:** The matrix cannot be a universal source of truth. The §14 line implies one matrix governs all three account types; in reality it governs only Partners.

### 1.3 (C) §13 says "real access is permission-based" but TABLE 47 enumerates role labels with default access — without listing the permissions each label maps to

**Where:** §13: *„реалният достъп се определя от зададените permissions … Долната таблица описва препоръчителни role labels."* vs TABLE 47 (Support / Финанси / Risk review / Партньорски мениджър, with "typical access" \+ "restrictions"). **Clash:** If role labels are "organizational labels" backed by underlying permissions, the spec must enumerate the default permission set per label. It does not — TABLE 47 describes access in prose, not in module × access-level form. An admin assigned the "Support" label has no deterministic mapping to actual permissions.

### 1.4 (A) Disputes have their own status table (TABLE 28\) that duplicates the unified request status table (TABLE 45\)

**Where:** §7.3 Спорове (TABLE 28: New / In Progress / Waiting / Closed) vs §11.4 Request statuses (TABLE 45: same four values). **Clash:** §7.3 explicitly states that a dispute is a request type *„Dispute"* inside the unified request system. Duplicating the status table risks drift between the two definitions in future revisions.

### 1.5 (C) Labels for shared lifecycle stages drift between the Status field (TABLE 11 R5) and the onboarding stage table (TABLE 13\)

**Where:** TABLE 11 R5 is the **Status field** on the Partner Application record, with enumerated values *„Нова, комуникация, договаряне, onboarding, одобрена, отказана"*. TABLE 13 is the **onboarding stage table** (Етап column) spanning both pre-account and post-account-creation phases — *„Нова заявка / Комуникация стартирана / Договаряне / Onboarding / Одобрен за activation"* — and explicitly creates the Partner Account at row 4\. **Clash:** The two structures overlap on the application's lifecycle but are not isomorphic. For the stages they do share, the labels drift: *Нова* vs *Нова заявка*, *комуникация* vs *Комуникация стартирана*, *одобрена* vs *Одобрен за activation*. TABLE 13 also has no terminal stage corresponding to *отказана*. Backend schema, UI labels, and notification template variables will diverge unless the shared stages get one canonical label.

### 1.6 (A) TABLE 47 R4 "Договорен процент без одобрение" has three valid readings

**Where:** TABLE 47 R4 — *„Партньорски мениджър … Ограничения: Договорен процент без одобрение."* **Clash:** The wording admits at least three readings, all defensible:

- **(a)** The role *cannot set* a partner's percent without separate approval (i.e. they can propose, someone else approves).  
- **(b)** The role *cannot approve* changes to the percent (i.e. another role approves; they only execute).  
- **(c)** The role *cannot view* the percent without approval (i.e. percent is hidden until escalated). The macro-problem (no module × access-level matrix per 1.3) survives any specific resolution: even after a permission matrix is written, this one wording still needs disambiguation.

---

## 2\. Subscription and account-lifecycle gaps

### 2.1 (G) §4.2 / TABLE 5 enumerates plan types but never enumerates subscription statuses

**Where:** §4.2 body text says "*тип план, период, плащания, статус и история*". TABLE 5 lists rows: **Basic**, **Premium седмичен**, **Premium месечен**, **Статус** (header with empty cell), **Неуспешно плащане** (long description). **Clash:** The "Статус" row is structurally a sub-header, but only **Failed Payment** is documented underneath. **Active**, **Cancelled** (if it exists), **Expired** are never enumerated as subscription statuses. The body text and dashboard signals (§3.2: *„accounts със subscription status, който не позволява сканиране на бележки"*) require the full list.

### 2.2 (G) Cancelled subscription is never defined

**Where:** Implied by 2.1 — body text references statuses other than Failed Payment, and the dashboard signals row above mentions "statuses that block scanning" (plural). **Clash:** No trigger (self-service vs admin), no scanning effect (immediate vs end-of-period), no relationship to existing Cleared cashback (validity continues? expires?), no relationship to in-flight Pending review.

### 2.3 (G) Inactive **User** account status is never defined

**Where:** §4.1 lists user account statuses as **Active, Inactive, Archived**. **Clash:** Inactive is never explained for Users. Can the user log in? Scan? What triggers Inactive (admin action only, or auto-flag)? Spec is silent.

### 2.4 (G) Archived account reactivation has no rule — for either User or Partner

**Where:** §4.1 (User) and §5.3 (Partner) both enumerate Archived. TABLE 16 R1 says Archived \= no login (i.e. neither user-self nor partner-self can initiate). TABLE 37 enumerates the system's links (activation, email verification, password reset) — none of which fires from an Archived state. Full-document search for "reactiv" / "регистрация" / "thaw" returns no rule for either Archived Users or Archived Partners. **Clash:** How does an Archived account return to operational state? Specifically:

- **Trigger:** since login is blocked, the transition must be admin-initiated. The spec does not say which admin role can perform it (TABLE 47 lists labels but none is named as the authority for Archived → Active), nor whether super-admin double-approval (§10.2) applies.  
- **Credential path:** does the account holder re-set their password via a fresh password-reset link (TABLE 37), or are old credentials retained? Spec is silent for both account types.  
- **Partner-side downstream effects:** TABLE 16 R7 covers QR reactivation on Archived → Active ("Същият механизъм важи за Archived. При връщане към Active QR кодовете се реактивират автоматично"), so that part *is* answered. What is not answered is whether the original partner contract carries over, and whether onboarding data captured before archival is still considered current. The lifecycle out of Archived is undefined for both account types.

### 2.5 (G) No pre-renewal notification when auto-renew is ON

**Where:** TABLE 34 (auto cadence) row "Изтичащ абонамент (auto-renew изключен): 3 days / 1 day / day-of." TABLE 5 (Failed Payment row) says auto-renew-ON users get one charge attempt with no retry. **Clash:** Auto-renew-ON users receive **no advance notice**. They only learn of the failure when scanning is blocked. Either intentional (then say so) or a missing cadence row.

### 2.6 (G) Admin account status values are never enumerated

**Where:** §10.1 references "Admin accounts, status, role label, последно влизане и 2FA" — but the **status set itself is not listed**. No table or paragraph in the spec enumerates which values an admin account's status field can take. §4.1 enumerates User statuses (Active/Inactive/Archived); §5.3 \+ TABLE 15 enumerate Partner statuses (Active/Inactive/Archived); §10.1 enumerates nothing. **Clash:** TABLE 47 role labels (Support / Финанси / Risk review / Партньорски мениджър) presuppose an account that can be Active or Inactive (e.g. revoked admin), but the surface those labels operate against is undefined. §14's "matrix is source of truth" line (1.2 above) explicitly does not apply to admins because TABLE 16 is partner-only. The clash with §1.2 is therefore strictly stronger than 1.2 alone: not only is the partner matrix non-universal, the admin status set is undefined to begin with.

### 2.7 (G) User registration flow is never described

**Where:** TABLE 37 R2 references *„Email verification (user registration / email change) — 24 часа"*. §4.1 P20 describes the listing of existing accounts but not the registration process. No body paragraph or table covers the sign-up flow, the 24-hour verification timer's behaviour, what happens after expiry, or whether an unverified account is purged. **Clash:** The cashback / scanning rules (§4) all assume an Active user, but the lifecycle between sign-up and first scan is undefined. An implementer cannot answer: what record exists during the verification window? Can the user log in unverified? Does verification timeout delete the record or just expire the link? The whole front-door is missing.

---

## 3\. Cashback state machine

### 3.1 (C) "Voided is terminal" vs "Paid record returns to manual review on second failed payout"

**Where:** TABLE 9 R6 (Pending-cashback-при-risk-review merged row): *„Voided е terminal status."* (TABLE 26 R4 reinforces by assigning Voided as a risk-review outcome but does not separately restate terminality). TABLE 21 R4 (Failed payout handling): *„При втори failed payout същият cashback record се връща за manual review с High risk."* TABLE 9 status set: Pending / Cleared / Paid / Expired / Voided. **Clash:** A Paid record (payout started) re-enters manual review. The spec's high-risk review rule (TABLE 26\) resolves to **Cleared** or **Voided** only — there is no defined intermediate status while the Paid record is being re-reviewed, and no rule for whether:

- The record sits in Paid throughout the second review, or briefly reverts to Pending.  
- On re-approval, the 60-day Cleared validity restarts.  
- On rejection, "Voided is terminal" still holds — and what happens to the payout obligation that was previously initiated.

### 3.2 (G) TABLE 6 (cashback behaviour on failed subscription payment) treats Paid as immutable, but TABLE 21 says Paid can be re-reviewed

**Where:** TABLE 6 row 3: *„Paid: Не се променя. Paid означава, че payout process е стартиран."* vs TABLE 21 row 4 (second failed payout → re-review). **Clash:** TABLE 6 implies Paid is effectively frozen with respect to subscription failures. TABLE 21 says Paid can move back into review (a payout-process trigger, not subscription). The transition rules differ depending on the trigger but neither table acknowledges the other.

### 3.3 (G) No "Settled" or "Confirmed" status after bank-side payout completion

**Where:** TABLE 9 row 3: *„Paid: Payout process е стартиран. Това означава, че cashback е изпратен за изплащане, а не че банковото получаване е финално потвърдено."* **Clash:** The spec explicitly draws a line between "sent" and "confirmed at bank" but does not introduce a status that represents "bank confirmed." So when does the obligation become final? Is reconciliation entirely outside the state machine?

### 3.4 (G) Pending cashback at a partner that transitions to Inactive/Archived

**Where:** TABLE 16 (QR effect on Inactive/Archived): all QR codes auto-deactivate. §4.4 / TABLE 26 cover the **new-record** rule (no new records are created once subscription status blocks scanning) but say nothing about **existing Pending** records at a partner whose status just changed. **Clash:** Do those records continue normal risk review? Auto-Void? Freeze for some operator decision? The rule is left to interpretation.

### 3.5 (G) Period-lock vs late state-machine transitions

**Where:** §6.3: *„Месецът трябва да може да се затваря. След заключване на период данните за фактуриране не се променят свободно."* TABLE 21 R4 (second failed payout → re-review with High risk) and TABLE 26 R4 (risk review → Cleared or Voided) describe transitions that can legitimately complete *after* a reporting period is locked. **Clash:** Two transitions can affect locked-period invoicing data without any rule for how they interact with the lock:

- A Cleared record changing to Voided via second-failed-payout re-review (TABLE 21 R4) — the original Paid value is now contested after the period is closed.  
- A Pending record from a locked period transitioning to Cleared or Voided after admin decision. "*Не се променят свободно*" leaves it unclear whether these transitions are blocked outright, deferred to the next period, or applied retroactively with an adjustment journal entry.

### 3.6 (G) TABLE 6 documents Pending / Cleared / Paid on failed subscription payment — silent on Expired and Voided

**Where:** TABLE 6 (Ефект върху съществуващ кешбек при неуспешно плащане) has rows for Pending, Cleared, Paid. TABLE 9 enumerates the full status set: Pending, Cleared, Paid, **Expired**, **Voided**. **Clash:** Two status values that exist in the cashback state-machine are absent from the failed-payment effect table. Does an Expired record remain Expired (likely), or could a re-activated subscription somehow reanimate it? Does a Voided record stay terminal even if the subscription failure is later resolved? Spec is silent on both rows.

### 3.7 (G) TABLE 23 reporting-period statuses have no transition rules

**Where:** TABLE 23 enumerates four reporting-period statuses — *„Отворен / За проверка / Заключен / Фактуриран"* — each with a one-line description. §6.3 P56 adds only *„Месецът трябва да може да се затваря. След заключване на период данните за фактуриране не се променят свободно."* **Clash:** The state machine itself is undefined:

- **Actor / trigger:** who moves the period from Отворен → За проверка, За проверка → Заключен, Заключен → Фактуриран? Manual action by a Финанси role, or automated when conditions match?  
- **Reversibility:** if an error is discovered during За проверка, can the period return to Отворен? If a locked period needs a correction, can it unlock?  
- **Terminality:** is Фактуриран terminal, or can re-invoicing produce a new status? 3.5 covers what happens to *cashback records* whose state changes after a period is locked; this item covers the *period's own* state machine, which is independently undefined.

---

## 4\. Payout gating and IBAN

### 4.1 (G) TABLE 21 "Subscription gate" row is empty

**Where:** §6.1, TABLE 21 row 5 — header cell `Subscription gate` is present, second cell is blank. **Clash:** A literal gap in the spec. The gate exists conceptually (and §6.1 prose says *„User трябва да има subscription status, който позволява payout при достигане на payout threshold"*), but no enumeration of which statuses allow payout.

### 4.2 (G) Subscription-status × payout-allowed mapping is not enumerated anywhere

**Where:** §4.2 names a Failed Payment status and implies others. §6.1 gates payout on "*subscription status that allows payout*". TABLE 21 row 5 is empty (see 4.1). **Clash:** Edge case: a user reaches threshold while in Failed Payment (because already-Pending records flip to Cleared after the gate event). Does payout fire? Are Active and only-Active the allowed statuses, or are recently-Cancelled (within the paid period) also eligible?

### 4.3 (G) Threshold check timing for a high-risk approval after subscription expiry — spec is silent

**Where:** TABLE 26 R4 covers the risk-review approval → Cleared transition, with the 60-day rolling validity starting at Cleared. §6.1 prose covers payout threshold \+ IBAN requirement. §4.4 covers cashback statuses and which participate in threshold (Cleared only). Nowhere does any section state at what moment payout eligibility is evaluated when the user's subscription has expired between receipt submission and admin approval. **Clash:** Two equally defensible readings of the spec exist — payout fires because the record was earned during a valid subscription, or payout is blocked because the subscription is no longer in a state that "allows payout" (§6.1) by the time the threshold is reached. The spec does not pick a side, and the choice has direct user-facing consequences. Independent of 4.2 (which enumerates the gate values), the *timing* of the gate check is undefined.

### 4.4 (G) IBAN never entered — no fall-through behaviour

**Where:** §6.1: *„При достигане на payout threshold системата изисква попълнен IBAN, ако липсва."* TABLE 21 row 4 "Failed payout handling" only covers cases where a payout was already attempted. **Clash:** If the user never enters IBAN, Cleared records continue counting down their 60 days. Do they expire normally to Expired? Does threshold-reached extend validity? Is an "abandoned-payout" operational flag raised for admin follow-up? Nothing in the spec.

---

## 5\. Risk model

### 5.1 (G) Risk-signal → risk-level mapping is undefined

**Where:** TABLE 26 (risk levels Low / Medium / High and their behaviours) vs TABLE 27 (signals User risk / Partner risk / Receipt match / Location match). **Clash:** The combining function (boolean? weighted? matrix?) is the most important rule in the risk subsystem and the spec contains none of it. Two engineers will produce two different fraud-screening pipelines from the same document.

### 5.2 (G) "Странни IBAN промени" mentioned in §7.2 prose but not in the signals table

**Where:** §7.2: *„Следи се duplicate detection, несъответствие между QR сесия и бележка, много транзакции за кратко време, странни IBAN промени и подозрително поведение."* TABLE 27 lists only four signals. **Clash:** IBAN-change risk, duplicate detection, time-bucket transaction velocity, and "suspicious behaviour" all live in the prose but never enter the signals table that TABLE 26 references.

### 5.3 (A) "Risk level е internal-only metadata" vs TABLE 26 driving a user-visible workflow

**Where:** §7.2 final sentence (risk level is internal-only). TABLE 26 row 4 prose ("Pending → Voided ... Решението се пази в history с reason category"). Voided is visible to user with reason; Cleared is visible. **Clash:** The outcome is user-visible (Voided with reason); the input is internal-only. That is fine, but the reason category surfaced to the user can leak the risk-level decision logic depending on what categories are allowed. The spec does not enumerate the user-facing reason categories, so the boundary between internal and external is undefined.

### 5.4 (G) TABLE 29 limits & rules table has no defaults and no link to the risk model

**Where:** §7.4 prose: *„Правилата защитават системата от злоупотреби, без да пречат на нормалните потребители."* TABLE 29 fields \= Дневен лимит / Сума / Auto approve / Manual override — no default values listed, no relationship documented to §7.2 signals or TABLE 26 risk levels. **Clash:** The limits table is the operational lever for risk policy but the spec does not say how its values default at install time, who can change them, or whether breaching a limit feeds into the risk-level computation (5.1). §7.4's prose is non-actionable. An implementer cannot stand up a limits subsystem from this spec.

### 5.5 (A) TABLE 26 Medium tier is non-deterministic by spec wording

**Where:** TABLE 26 R2 — *„Medium: Може да изисква review според правилата и натрупания operational опит."* **Clash:** "May require review" is intentionally permissive. The Low tier auto-approves; the High tier requires manual review; the Medium tier is policy-driven and the policy is left undefined. Two installations with identical data will reach different outcomes for Medium-tier records because the rule is delegated to "operational experience" that lives outside the spec. Complement to 5.1 (input-side gap) on the output side.

---

## 6\. Notification template gaps

### 6.1 (C) §11.6 promises request notifications to every submitter, but TABLE 31 / TABLE 32 / admin templates cover only 1 of the 12 required slots

**Where:** §11.6: *„Подателят получава notification при: създаване на request, нов отговор от admin, промяна на status и Closed request."* — the submitter can be User, Partner or Admin per TABLE 41\. The four events × three audiences \= 12 template slots required. Source spec contains:

- TABLE 31 (user): rows Платежни / Транзакционни / Cashback expiry / Маркетингови — **no request events** (0 of 4).  
- TABLE 32 (partner): row 5 *„Request отговор"* — **only** the "new admin reply" event (1 of 4).  
- Admin: **no template table exists in the spec at all** (0 of 4). **Clash:** Of 12 required templates, the spec supplies 1\. Either each table needs the missing rows, an admin template table needs to be created, or §11.6's submitter-notification promise must be narrowed to what the templates actually support.

### 6.2 (G) Help-system tickets and SLA breaches are absent from §3 dashboard surface (both signals and tiles)

**Where:** TABLE 2 (signals) enumerates Critical / Operational / Informational signal types — none reference the help system. TABLE 1 (Обзор tiles) lists Абонати / Транзакции / Кешбек / Партньори / Финанси — no Помощ tile at all. **Clash:** §11 is a first-class admin menu category yet has no operational surface anywhere in §3. Operators have no way to detect a growing help backlog, SLA breaches, or even open ticket count at a glance. Both the tile list (TABLE 1\) and the signal list (TABLE 2\) need a help-system entry.

### 6.3 (C) Activation link cadence is implied but TABLE 34 has an empty row for it

**Where:** TABLE 34 row 3 — *„Изтичащ activation link (партньор) || (empty) || Email към партньора \+ админ alert."* **Clash:** The cadence cell is empty. §14 says activation links are valid 72h with admin-only resend — but the reminder cadence (e.g., 24h-before-expiry, day-of-expiry, after-expiry) is not specified. The channel column is filled, the timing column is not.

### 6.4 (G) No user-side activation-link row in TABLE 37

**Where:** TABLE 37 lists link validities for: Activation (partner) 72h, Email verification 24h, Password reset (user/partner) 24h, Password reset (admin) 1h. **Clash:** No row for "User activation link" — implying user accounts have no separate activation step (verification \= activation). If so, the spec should say so explicitly; if not, the row is missing.

### 6.5 (G) TABLE 1 R3 (Кешбек dashboard tile) has no enumerated indicators

**Where:** TABLE 1 R3 — `Блок = Кешбек`, `Показатели = (empty)`, `Причина = "Контрол върху бъдещи задължения към абонати."` The middle column is literally empty in the source. **Clash:** Same class of defect as 4.1 (TABLE 21 empty Subscription gate) and 6.3 (TABLE 34 empty activation cadence) — the row exists with rationale but no enumerated values. An implementer cannot build the Кешбек tile from the spec because the metric list is missing. Likely candidates (Pending sum, Cleared sum, days-to-expiry buckets, payout-threshold-pending count) are not committed to.

### 6.6 (G) User-vs-partner notification asymmetry on account-status changes

**Where:** TABLE 32 R6 (partner notifications): *„Промяна на партньорски статус — При преминаване между Active / Inactive / Archived. Автоматично при ръчна или системна смяна на статус."* TABLE 31 (user notifications): no equivalent row. **Clash:** Partners get notified when their account status transitions; users do not. Either an intentional asymmetry (which the spec should justify, since GDPR/transparency norms expect the affected party to be told when their account is locked or archived) or a missing TABLE 31 row. Combined with 6.1, TABLE 31 is missing notifications for both the request-system events (4 rows) and the account-status transitions (1 row).

### 6.7 (A) Cadence asymmetry — cashback expiry gets 1 reminder, subscription expiry gets 3

**Where:** TABLE 34 R1 (Изтичащ кешбек): *„7 дни преди изтичане на запис"* — single reminder. R2 (Изтичащ абонамент, auto-renew изключен): *„3 дни преди изтичане, 1 ден преди изтичане, в деня на изтичане"* — three reminders. **Clash:** Both events are time-bound losses of value to the user; the spec applies twice the reminder weight to a 30-day subscription as to a 60-day cashback record. No reasoning given for the asymmetry, and the cashback case arguably warrants more reminders (the user has done the work to earn it, lost value is harder to replace). Either the asymmetry needs justification or the cadences need alignment.

---

## 7\. Email-to-request threading and channels

### 7.1 (C) Plus-addressing — four places say three different things

**Where:** §14 checklist: *„Email parser-ът thread-ва reply-та чрез X-BoomCard-Request-ID header, In-Reply-To header, plus-addressing и \[\#XXXX\] subject pattern."* TABLE 42 R4 (Reply-To address): *„[request-1234@boomcard.bg](mailto:request-1234@boomcard.bg), ако се имплементира plus-addressing"* (conditional). TABLE 43 R3: *„ако е имплементиран plus-addressing"* (conditional). TABLE 36 (system addresses): lists only office@, support@, noreply@ — does not mention `request-XXXX@`. **Clash:** §14 treats plus-addressing as a shipped feature; TABLE 42 R4 and TABLE 43 R3 both treat it as optional; TABLE 36 omits the address shape it requires. Scope for v1.2 is unresolved — four spec positions, three different stances.

### 7.2 (G) Owner and assignee assignment is undefined across most channels (worse than form-vs-email divergence)

**Where:** TABLE 41 R7 (Единен request record) lists both `owner` and `assignee` as fields on the unified request record. Of the six channel rows:

- R1 (support@ email) — neither owner nor assignee specified.  
- R2 (office@ email) — neither owner nor assignee specified.  
- R3 (User panel form) — `owner = подателят`; assignee unspecified.  
- R4 (Partner panel form) — `owner = партньорът`; assignee unspecified.  
- **R5 ("Заяви промяна" in Partner panel) — neither owner nor assignee specified.** Only `тип заявка` (request type) is named.  
- R6 (Admin panel form) — `owner = админът`; assignee unspecified. **Clash:** Three of six channels have no owner rule (R1, R2, R5) and **none** of the six has an assignee rule. The earlier framing "form rows specify owner, email rows don't" is itself wrong: one form row (R5 "Заяви промяна") also fails to specify owner. The gap is broader and more uniform than a form-vs-email split suggests.

### 7.3 (A) "Reply to Closed request creates new request with reference, when applicable" — "when applicable" is undefined

**Where:** §11.2 edge case: *„Reply на request в status Closed. → Не се отваря старият request. Създава се нов request с reference към предходния, когато е приложимо."* **Clash:** "When applicable" is the entire load-bearing decision. Auto-link if same owner? Same subject? Admin must link manually? The spec leaves it open.

### 7.4 (G) Out-of-office handling — "internal note when needed" is undefined

**Where:** §11.2 edge case: *„Bulk reply / out-of-office auto-replies. → Parser-ът разпознава Auto-Submitted: auto-replied header и не създава message, само internal note при нужда."* **Clash:** Who decides "при нужда"? Threshold rule? Manual flag? Otherwise it is silently dropped or silently noted depending on engineering taste.

### 7.5 (G) Spam/phishing handling at support@ / office@ is not specified

**Where:** TABLE 36 (system addresses): support@/office@ accept all inbound and create requests via parser. TABLE 41 confirms auto-reply with reference number on creation. **Clash:** No rule for known-spam / phishing inbound. Every spam mail produces a request and an auto-reply to a potentially forged address. Operationally noisy and a vector for triggering outbound mail to attacker-controlled addresses.

### 7.6 (C) TABLE 43 priority sequence (R1–R5) vs spoof-protection clause (R6) have undefined precedence

**Where:** TABLE 43 R1–R4 each say *„Прикачи имейла към съответния request"* when their header / marker condition matches. R5 is the fallback "create new request." R6 (the "Защита срещу spoofing и грешни match-ове" merged row) says *„Reply от непознат адрес НЕ се прикача автоматично — вместо това се създава нов request с reference към оригиналния."* **Clash:** When the same email matches a header signal (R1 or R2) **and** the sender is not on the request's allowlist (R6 trigger), R1–R2 say "attach to existing request" and R6 says "create new request." The spec gives no precedence rule. R6 sits after R5 as a separate merged row, not as a precondition above R1. If R1 fires first, the spoof protection is irrelevant; if R6 fires first, the priority ladder is irrelevant. Either R6 must be promoted to a precondition or the precedence must be stated explicitly.

---

## 8\. Form vs email parity for "I want to become a partner"

### 8.1 (C) Web form creates Partner Application; email to office@ creates a Help Request

**Where:** §5.1 \+ TABLE 11: form submission directly creates a **Partner Application** under Партньори \> Заявки, with 24h internal SLA and 2-working-day external promise. TABLE 41 row 2: emails to office@ are parsed and create a **request** in §11. **Clash:** Same intent ("I want to become a partner"), two completely different entities, queues, lifecycles, SLAs. No documented routing rule for "email contains partner-application intent → create Partner Application instead of Help Request."

### 8.2 (G) No rule for duplicate submissions across channels

**Where:** A potential partner can submit the form and also email office@ in the same day. **Clash:** Two distinct records (Partner Application \+ Help Request) result. No deduplication rule, no link between them, no operator-facing surface to spot the duplicate.

### 8.3 (C) TABLE 36 and TABLE 41 disagree about whether office@ creates request records

**Where:** TABLE 36 R1 (Системни имейл адреси) frames office@ as *„Нотификационен и комуникационен канал за партньорски заявки ... Може да получава notification при нова Partner Application. Официалният запис остава в админ панела."* — i.e. office@ is a one-way notification destination; the **official record** is the admin-panel form. TABLE 41 R2 frames office@ as an inbound channel that *„Email gateway parse-ва → създава request в системата → auto-reply към подателя"* — i.e. **every inbound email** becomes an official request record. **Clash:** TABLE 36 says the admin-panel form is canonical. TABLE 41 says the email itself is canonical. These are mutually incompatible models of office@. Item 8.1 (form-vs-email parity) cannot be resolved without resolving this prior contradiction first.

### 8.4 (C) office@ is both inbound channel and outbound notification destination — self-loop risk

**Where:** TABLE 34 R6 (Нов партньор – заявка): *„Незабавно към office@ \+ сигнал в админ панела"* — the system sends notifications TO office@. TABLE 41 R2: office@ inbound creates a request via the parser. TABLE 43 R1–R4 attach matching inbound emails to existing requests. **Clash:** If office@ both receives system notifications and is auto-parsed for inbound mail, the system can be triggered to reply to itself. A notification sent to office@ about a Partner Application is then parsed as a new inbound email and creates either (a) a fresh "Help Request" with the system's own notification as the body, or (b) attaches to the originating request if the parser correctly identifies the loop. The spec does not say which, nor whether `Auto-Submitted: auto-generated` is set on outbound system mail to break the loop. Compounds 8.3 (which is about canonicality) with a runtime feedback risk.

---

## 9\. Visibility, status, and field conflicts

### 9.1 (C) Partner has two independent visibility signals

**Where:** TABLE 15 row 4: `Видимост — Видим или скрит за абонати` (a field on the partner profile). TABLE 16 row 4: `Видим в публичната част на сайта — Да for Active, Не for Inactive/Archived` (derived from status). **Clash:** Public visibility is both a profile field and a status-derived rule. What wins when an Active partner has the visibility field set to Скрит? Conversely, the status-rule says Inactive partners are not visible — can the field override that? Two sources of truth.

### 9.2 (A) Email is identity but lives in profile

**Where:** §4.1 / §12.1: *„Account и Profile са отделни слоеве: account управлява достъпа и status, а profile съдържа data и settings."* §12.1 lists email under profile. **Clash:** Email is the login identifier and the destination for auth/verification mail. Treating it as profile data means a "profile edit" can affect account access. The spec does not say where email lives architecturally for login lookup, nor what happens to in-flight verification when email changes (TABLE 37 verification link is 24h, but no mention of locking the email change until verified).

### 9.3 (A) TABLE 13 row 6 says partner has "read-only access until clicking activation link" — but how does an unactivated partner log in?

**Where:** TABLE 13 row 5 "Одобрен за activation" / row 6 "Activation link – срок и resend": *„Read-only до клик на activation link; след activation account става Active."* **Clash:** Before activation, the partner account is in Inactive status. TABLE 16 row 1 "Login достъп" for Inactive \= "Да". But the password presumably has not been set yet (activation typically sets the password). What credentials does the partner use to log in before clicking activation? The activation link itself? If so, then "read-only access" is via the link, not a separate session.

### 9.4 (G) TABLE 18 enumerates four QR statuses but only two have defined transitions

**Where:** TABLE 18 R3 lists QR statuses *„Активен, Неактивен, В обработка, Заменен"*. TABLE 16 R7 covers automatic Активен ↔ Неактивен on partner status changes. Nothing in the spec defines *„В обработка"* (in processing) or *„Заменен"* (replaced). **Clash:** What triggers *„В обработка"* — admin action, ops pipeline, physical-replacement order? Who can move a QR to *„Заменен"*, and what happens to scans against the previous token? Is scanning allowed in either intermediate state? Two of four enumerated statuses have no semantics — the QR code state machine is documented for half its surface.

### 9.5 (G) TABLE 18 R6 Partner-Panel snapshot lists 3 of 4 QR statuses (drops "Заменен")

**Where:** TABLE 18 R3 (statuses): *„Активен, Неактивен, В обработка, Заменен"*. TABLE 18 R6 (Partner-side видимост на QR merged cell): *„статус (Активен / Неактивен / В обработка)"* — *„Заменен"* is missing. **Clash:** Distinct from 9.4 (which is about missing transitions): this is about a missing visibility surface. The partner can see three of the four states the back-end recognises. When a QR is moved to *„Заменен"* in the admin panel, the partner's read-only Partner Panel view has no row to render. An implementer wiring the Partner-Panel snapshot does not know whether to hide the location, fall through to a different label, or render the back-end label verbatim.

---

## 10\. Terminology overloads

### 10.1 (T) "Заявки" — Partner Applications **and** help-system tickets

**Where:** §5.1 menu *„Партньори \> Заявки"* \= Partner Applications (TABLE 11). §11.5 / TABLE 46 *„Помощ \> Нова заявка / Моите заявки / Всички заявки"* \= help-system requests. **Clash:** Same Bulgarian noun, two unrelated entity types, both surfaced as menu items in the same admin panel. The spec never instructs the UI to disambiguate (e.g., "Партньорски заявки" vs "Помощни заявки").

### 10.2 (T) "Процент" — partner discount **and** cashback/margin split

**Where:** §6.2 *„договорения процент"* \= partner discount (per partner). §9.2 *„Проценти — разпределение между партньорски процент, кешбек към абонат и марджин"* \= global split. **Clash:** Both are configured through Настройки (and per-partner). Naming both *„процент"* invites mis-configuration. The same field name in two different places can be confused for the same field.

### 10.3 (T) "Status" — at least ten different scopes, no qualifier

**Where:** §4.1 User account status, §4.2 subscription status, §4.4 cashback record status, §5.3 partner account status, §10.1 admin account status (values themselves undefined — see 2.6), §11.4 unified request status (TABLE 45), §7.3 dispute status (TABLE 28 — duplicates the unified set per 1.4), QR code status (TABLE 18), partner application status (TABLE 11), reporting-period status (TABLE 23: Отворен / За проверка / Заключен / Фактуриран). **Clash:** At least ten distinct status scopes. The spec writes the unqualified word *„статус"* repeatedly. A reader cannot resolve *„статус"* from a single sentence without surrounding context. Schema-level naming will inherit this ambiguity unless the spec pins it down (e.g. `subscription_status`, `cashback_status`, `partner_account_status`, `reporting_period_status`, …).

### 10.4 (A) "Numeric-only reference number" framing — reconciled in TABLE 42 R1 but reader of §11.6 alone may miss the bracket framing

**Where:** §11.6: *„Requests имат numeric-only reference number."* TABLE 42 R1 *clarifies* the visible marker as `[#1234]` (brackets are framing; the ID itself is numeric). TABLE 43 R4 reinforces. **Note:** This is *not* a contradiction — TABLE 42 R1 itself supplies the disambiguation in the same paragraph that introduces the marker. Flagging only because a parser implementation that reads §11.6 in isolation may assume the visible token is bare numeric and miss the `[#…]` framing. Strictly a parser foot-gun, not a clash; included for completeness.

### 10.5 (T) "Archived profile" in TABLE 31 R4 conflates account-status with profile data

**Where:** TABLE 31 R4 (Маркетингови) ends *„Спира при оттегляне или Archived profile"*. §4.1 and §12.1 explicitly separate the two: account holds status, profile holds data. Archived is an **account** status, not a profile state. **Clash:** Either a slip of vocabulary in the spec or a real semantic — does the profile have its own Archived state separate from the account's? If the former, fix the wording to *„Archived account"*. If the latter, define what an "Archived profile" means and how it relates to the account's status.

### 10.6 (T) `бизнес формула` referenced in TABLE 47 R2 has no definition in the spec

**Where:** TABLE 47 R2 (Финанси role) restriction: *„Създаване на супер админи и промяна на бизнес формула."* Full-document search across all 162 paragraphs and 48 tables: the phrase *„бизнес формула"* appears nowhere else in the spec. **Clash:** A role restriction is gated on a concept the spec never names anywhere else. The closest candidate is §9.2 *„Проценти — разпределение между партньорски процент, кешбек към абонат и марджин"*, but the spec does not make the link. A permission boundary that cannot be located in the spec is not implementable — the Финанси role's exclusion clause has no referent.

---

## 11\. SLA, priority, and request-handling gaps

### 11.1 (G) Help-system requests have no SLA

**Where:** Partner Applications have an explicit 24h internal / 2-working-day external SLA (TABLE 11). §11 (unified request system) defines only priority and status, no SLA. **Clash:** Support / Dispute / Change / Other requests have no documented SLA target, no SLA-breach signal, no priority-to-SLA mapping.

### 11.2 (G) Request priority levels are referenced but never enumerated

**Where:** §11 prose: *„Филтрирането и приоритизацията се правят по type/category, priority, status и assignee."* **Clash:** Priority values are never listed (Low/Medium/High/Urgent?). Default-priority-per-type rules are absent. UI-level priority change rules are absent.

### 11.3 (G) "Други" request type is a catch-all with no handling rules

**Where:** TABLE 44 row 6: type \= *„Други"*, who submits \= *„Всеки"*, examples \= *„Заявки, които не попадат в горните категории."* **Clash:** No default priority, no routing rule, no SLA, no auto-assignment. Operationally this is the bucket that grows unboundedly without ownership.

### 11.4 (G) Admin password-reset rate-limit threshold is qualitative

**Where:** TABLE 37 row 5: *„Password reset (админ) … При повтарящи се reset-и – admin alert."* **Clash:** "Repeated" is not defined. Two in a day? Three in an hour? The rule cannot be implemented as written.

---

## 12\. Currency, locale, and timing

### 12.1 (A) BGN with "EUR support after EU adoption" — no transition rule

**Where:** TABLE 39 row 1: *„Валута: BGN (с поддръжка за EUR след въвеждане в България)."* **Clash:** Transition flip is undefined. Are old transactions converted at a fixed rate? Reported in both currencies? Are partners invoiced going forward in EUR while historical reports remain BGN? The operational migration is unspecified.

**Update (2026-08-10, BC-QA-031):** This clash was resolved by implementing dual-currency (BGN+EUR) display gated by a `currency_transition_window_open` flag (`utils/currencyDisplay.ts` and all call sites across admin/partner/user routes and services). Bulgaria's BGN→EUR transition is now effectively over, and the feature has been fully removed — all monetary amounts are EUR-only, with none of the transition-window machinery remaining. This entry is kept as the historical record of the original spec ambiguity; the resolution history is: feature removed, EUR-only retained.

### 12.2 (G) Receipt-OCR matching threshold is unspecified

**Where:** §5.5 (Касови бележки) collects receipt profile, merchant name, variations, reference photos. TABLE 27 row 3: "Receipt match" is a binary risk signal. **Clash:** What is "match"? Exact merchant string? Fuzzy match with score threshold? Required fields? The signal is consumed by risk-level computation (which is itself undefined — see 5.1) so this gap compounds.

### 12.3 (A) Forwarded-email rule does not distinguish internal forwards

**Where:** §11.2 edge case: *„Препратен имейл (Fwd:) от трета страна. → Headers не match-ват. → Създава се нов request."* **Clash:** An internal admin who forwards an inbound mail (because they replied from a personal client) will create a duplicate request. The edge case targets third-party forwards but does not exclude internal/same-domain forwards.

---

## 13\. Audit / history scope ambiguities

### 13.1 (A) §10.4 history scope vs §14 checklist

**Where:** §10.4: history records *„решения по risk review (с причина), всички resend-и на activation / verification / password reset links, всички промени на Partner status и всички request actions от admin страна."* §14 checklist: *„Всички request actions, risk decisions, status changes и link resend-и се записват в history / internal notes според случая."* **Clash:** §10.4 lists *Partner* status changes only. §14 says *status changes* (presumably any). Are User and Admin status transitions also in §10.4? Spec is silent. Is the audit log a single concatenated log or per-entity history? "History / internal notes според случая" leaves the storage decision to implementer.

### 13.2 (G) No audit row for permission changes

**Where:** §10.4 enumerates the audited events. §13 says super admin manages permissions for each admin account. **Clash:** Permission-grant and permission-revoke events are not listed as audited actions, despite being security-critical.

### 13.3 (G) §10.2 "двойно одобрение" for super-admin creation is undefined

**Where:** §10.2: *„Нов супер админ изисква двойно одобрение."* §10.3 mentions *„Чакащи одобрения — заявки за нов супер админ или други критични действия."* No rule specifies the protocol behind dual approval. **Clash:** Multiple unknowns sit on a security-critical surface:

- **Who can be the second approver** — any super-admin? A different super-admin from the requester? Does a single super-admin approving their own request count as "double"?  
- **Quorum / threshold** — must both approvals be affirmative, or is one majority of a larger set?  
- **Expiry** — does a pending approval time out? If so, after how long? TABLE 37 lists link-validity windows for normal account flows but not for governance approvals.  
- **Revocation** — can either approver withdraw their approval before the action commits? Is a partial approval recorded in §10.4 history? For a process gated specifically because it is high-impact, the spec provides no actionable rule.

---

## 14\. Document hygiene

### 14.1 (G) Twelve empty placeholder tables sit in the spec as "АКТУАЛИЗИРАНО" stubs

**Where:** Tables 4, 8, 10, 12, 14, 17, 20, 25, 30, 33, 35, 40 — twelve single-cell tables, each containing only the word *„АКТУАЛИЗИРАНО"* ("UPDATED"). They appear to be edit-tracking markers left in from a prior revision pass. **Clash:** A reader cannot tell whether a stub is intentionally empty, awaiting content, or replaced an older table whose content moved. Implementers iterating the spec's tables programmatically (schema map, doc-to-test harness) pick these up as content. The systemic editorial issue is invisible to any reader who only reads prose. Either remove these markers entirely or replace each with an explicit *"\[Reserved for future revision — content moved to §X.Y\]"* note pointing to where the real content lives.

### 14.2 (G) §1 is titled "Цел, стандарти и принципи" but contains only Цел and one принцип

**Where:** §1 heading vs body — §1.1 (Цел) and §1.2 (Основен UX принцип) are the only sub-sections. No "стандарти" subsection exists, and no further "принципи" beyond the single UX one. **Clash:** Either the section heading should be narrowed to "Цел и UX принцип" or two missing subsections (стандарти; additional принципи) need to be filled in. Reader expectation set by the section title is not met.

### 14.3 (A) TABLE 0 menu category numbering (1–10) competes with body §-numbering (§3–§12)

**Where:** TABLE 0 enumerates ten menu categories numbered 1–10 (1. Табло, 2\. Абонати, …, 8\. Администратори, …). Body sections use 1–14 (§3 Табло, §4 Абонати, …, §10 Администратори, …). **Clash:** A reference like *„§8.4"* is ambiguous out of context: it could mean body §8.4 (Маркетинг \> Списъци, which is what 1.1 reads it as) or menu category 8.4 (Администратори \> История на действията, which has its own internal indices). The clashes doc 1.1 silently takes the body reading. The spec should adopt a single numbering convention or prefix references explicitly (e.g. *„меню 8.4"* vs *„§8.4"*). Until then every cross-reference in the spec is one ambiguity away from a defect.

### 14.4 (A) §11.2 prose introduces two lists with trailing colons but the lists live in tables with no inline reference

**Where:** §11.2 paragraph beginning *„Всеки имейл, изпращан от системата по съществуващ request … трябва да съдържа:"* ends with a colon. The list it promises is TABLE 42\. A second paragraph *„… parser-ът следва приоритетна последователност за определяне дали имейлът е нов request или reply по съществуващ request:"* also ends with a colon — its list is TABLE 43\. **Clash:** Both prose paragraphs dangle. Neither carries an inline *„виж TABLE …"* pointer. A reader walking the prose hits two orphaned colons before silently inferring that the next table is the intended list. Document hygiene defect; resolution is one editorial line per paragraph linking to its table.

---

## Recommended order to close these

The clashes that block implementation are concentrated in **§§2–5** (subscription statuses, cashback state machine, payout gate, risk-signal mapping). Closing those first unblocks the bulk of backend work. The remaining items are doc-quality issues that an implementer can defer with a TODO list but cannot resolve unilaterally:

1. **2.1 (G) \+ 4.1 (G) \+ 4.2 (G)** — fill in the subscription-status table, populate the empty *Subscription gate* row, write the status × payout-allowed matrix as a single combined table.  
2. **5.1 (G)** — write the risk-signal × risk-level mapping (one short table).  
3. **3.1 (C) \+ 3.2 (G) \+ 3.3 (G)** — extend the cashback state-machine to cover Paid → re-review → {Cleared, Voided} and the bank-confirmed terminal state.  
4. **2.4 (G)** — write the Archived → reactivation rule for both Users and Partners (trigger, credential path, partner-side downstream effects).  
5. **6.1 (C)** — add the missing 11 request-event templates across TABLE 31 (4 user rows), TABLE 32 (3 partner rows), and a new admin-template table (4 rows).  
6. **8.3 (C) \+ 8.1 (C)** — pick a canonical model for office@ (notification destination *or* request-creating channel), then write the email-gateway intent rule on that model.  
7. **7.1 (C)** — decide plus-addressing scope for v1.2 and align §14 / TABLE 42 R4 / TABLE 43 R3 / TABLE 36 to a single answer.  
8. **1.1 (C)** — single-reference fix (`§8.4` → `§5.5`).  
9. **1.5 (C)** — pick canonical Partner Application stage labels and align TABLE 11 \+ TABLE 13\.  
10. **9.4 (G)** — define triggers for QR statuses *В обработка* and *Заменен*.  
11. **10.3 (T)** — adopt qualified status naming across the document and DB schema.  
12. **14.1 (G)** — purge or annotate the twelve *АКТУАЛИЗИРАНО* placeholder tables.  
13. Everything else (the remaining \~58 items — most are A/T/G polish; pick up after the 12 above).

