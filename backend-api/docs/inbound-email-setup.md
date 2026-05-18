# Inbound Email Setup (Spec §11.2)

The hybrid ticketing model requires inbound email parsing. Resend (our
outbound provider) does **not** offer inbound. Pick one of the providers
below and point its inbound webhook at:

```
POST https://boomcard-api.fly.dev/api/email/inbound
```

The endpoint accepts a normalized JSON payload (see
`InboundEmailPayload` in `src/services/ticketInbound.service.ts`). Each
provider's raw payload differs, so the deployment owns the adapter that
translates from provider format → `InboundEmailPayload` before the
webhook is invoked.

## Required fields

```ts
{
  from: "Name <addr@host>" | "addr@host",
  to: "support@boomcard.bg",
  subject: "Re: [#abcd1234] My problem",
  text: "...",
  html?: "...",
  messageId: "<inbound-message-id@sender-domain>",
  inReplyTo?: "<system-message-id@mail.boomcard.bg>",
  references?: ["<msg1>", "<msg2>"],
  xBoomCardTicketId?: "uuid-of-ticket",
  autoSubmitted?: "auto-replied" // RFC 3834
}
```

## Auth

Set ONE of these env vars in production:

- `INBOUND_EMAIL_HMAC_SECRET` — provider signs the JSON body with
  HMAC-SHA256 and sends as `X-Inbound-Signature: <hex>`. Preferred —
  used by serious adapters.
- `EMAIL_WEBHOOK_SECRET` — shared secret sent as `X-Webhook-Secret:
  <secret>`. Fallback for providers that don't support HMAC.

If neither is set, the endpoint logs a warning and accepts unsigned
requests (development only).

## Provider notes

### Mailgun (recommended)

1. Create a Route for `match_recipient(".*@boomcard.bg")` →
   `forward("https://boomcard-api.fly.dev/api/email/inbound")`.
2. Adapter: Mailgun's `Routes → Forward` posts form-encoded data, not
   our JSON shape. Either:
   - Use Mailgun's "Store" action and poll via the Mailgun API
     (translating to our schema on the poller), or
   - Front the webhook with a tiny serverless function (Vercel /
     Cloudflare Worker) that normalizes Mailgun fields:
     `sender → from`, `recipient → to`, `subject`, `body-plain → text`,
     `body-html → html`, `Message-Id → messageId`,
     `In-Reply-To → inReplyTo`, `References → references` (space
     split), `X-BoomCard-Ticket-Id → xBoomCardTicketId`,
     `Auto-Submitted → autoSubmitted`.
3. HMAC: compute SHA-256 over the *normalized* JSON body (after
   translation) and forward as `X-Inbound-Signature`.

### Postmark

1. Add an Inbound stream and set the webhook URL to our endpoint
   (Postmark posts JSON natively).
2. Postmark's fields map directly: `From`, `To`, `Subject`, `TextBody`,
   `HtmlBody`, `MessageID`, `Headers[].Name='In-Reply-To'`,
   `Headers[].Name='References'`. Same caveat — front with an adapter
   that fills `xBoomCardTicketId` from `Headers[].Name='X-BoomCard-Ticket-Id'`
   and `autoSubmitted` from `Headers[].Name='Auto-Submitted'`.

### Amazon SES Inbound + SNS

1. Configure an SES receipt rule for `*@boomcard.bg` → SNS topic →
   Lambda → POST normalized JSON to our endpoint.
2. Lambda is your normalizer; emit the schema above + HMAC header.

## Things the endpoint already handles

- Threading priority (§11.2): `X-BoomCard-Ticket-Id` header → reply
  Message-ID lookup → `[#XXXX]` subject match → new ticket.
- Spoof protection: reply from an email not in the allowed set
  (owner / externalEmail / prior reply senders) creates a NEW
  `linkedTicketId`-pointing ticket, never injects into the existing
  thread.
- Auto-replies (`Auto-Submitted: auto-replied`): logged as
  `isAutoReply=true` note, no reopen, no notification fan-out.
- Bounces / DSNs: detected via subject + sender heuristics, dropped
  silently (with a warn log).
- Closed-ticket reply: auto-reopens via `reopenedAt` watermark + audit
  log entry (`TICKET_REOPENED_VIA_EMAIL`).
- Auto-reply confirmation: when a new ticket is created from inbound
  email, the system emails the sender with the `[#XXXXXXXX]` reference
  + threading headers (Spec §11.1).

## Smoke test (no real provider)

```bash
curl -X POST http://localhost:3000/api/email/inbound \
  -H 'Content-Type: application/json' \
  -d '{
    "from": "test@example.com",
    "to": "support@boomcard.bg",
    "subject": "Smoke test",
    "text": "Hello, this is a test inbound email.",
    "messageId": "<smoke-test-1@example.com>"
  }'
```

In dev (no `INBOUND_EMAIL_HMAC_SECRET` / `EMAIL_WEBHOOK_SECRET` set),
the request is accepted with a warning. In production, it MUST be
signed or 401s.

Expected response on first run: `201 { ok: true, ticketId: "...",
created: true }`. The sender (`test@example.com`) receives an
auto-reply with the ticket reference; replying to it will append to
the same ticket via the `In-Reply-To` header.
