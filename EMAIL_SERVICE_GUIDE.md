# Email Service Guide - Resend Integration

Complete guide for using the BoomCard email service powered by Resend.

## What is Resend?

Resend is a modern email API for developers:
- 🚀 99.9% delivery rate
- 💰 3,000 emails/month FREE
- 📊 Real-time analytics
- 🎨 React Email components support
- ⚡ Fast and reliable

**Why Resend over SendGrid/Mailgun?**
- Cheaper: Free tier vs $15-20/month
- Modern developer experience
- Better TypeScript support
- Used by Vercel, Next.js teams

---

## Step 1: Create Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Sign up with GitHub or email
3. Verify your email address
4. You're ready! (No credit card required for free tier)

---

## Step 2: Get API Key

1. Go to [https://resend.com/api-keys](https://resend.com/api-keys)
2. Click **"Create API Key"**
3. Name it: `BoomCard Production`
4. Select permissions: **"Sending access"**
5. Copy the API key (starts with `re_`)

⚠️ **Important**: Save the API key immediately - you can't view it again!

---

## Step 3: Configure Domain

### Option A: Use Resend's Domain (Testing)

For testing, you can send from `onboarding@resend.dev`:
- Already configured
- No setup needed
- Limited to 1 email per day

### Option B: Use Your Own Domain (Production)

1. Go to [https://resend.com/domains](https://resend.com/domains)
2. Click **"Add Domain"**
3. Enter: `boomcard.bg`
4. Add DNS records to your domain:

```
Type: TXT
Name: @
Value: resend-verification-xxx

Type: MX
Name: @
Priority: 10
Value: mx1.resend.com

Type: MX
Name: @
Priority: 20
Value: mx2.resend.com

Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; pct=100; rua=mailto:dmarc@boomcard.bg
```

5. Wait for verification (usually 5-10 minutes)
6. Once verified, you can send from `noreply@boomcard.bg`

---

## Step 4: Configure Backend

Add to `backend-api/.env`:

```env
# Email Service (Resend)
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=noreply@boomcard.bg
EMAIL_FROM_NAME=BoomCard
```

**For Development:**
```env
# Use Resend's test domain
RESEND_API_KEY=re_your_api_key
EMAIL_FROM=onboarding@resend.dev
EMAIL_FROM_NAME=BoomCard (Dev)
NODE_ENV=development
```

**For Production:**
```env
# Use your verified domain
RESEND_API_KEY=re_your_production_api_key
EMAIL_FROM=noreply@boomcard.bg
EMAIL_FROM_NAME=BoomCard
NODE_ENV=production
```

---

## Step 5: Using the Email Service

The email service is already integrated! Here's how it works:

### Automatic Emails

The following emails are sent automatically:

1. **Payment Confirmation** - When payment is successful
2. **Wallet Update** - When wallet balance changes
3. **Receipt Confirmation** - When receipt is submitted (coming soon)
4. **Welcome Email** - When user registers (coming soon)

### Manual Email Sending

```typescript
import { emailService } from '../services/email.service';

// Send custom email
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Hello from BoomCard!',
  html: '<h1>Hello!</h1><p>This is a test email.</p>',
  text: 'Hello! This is a test email.',
});

// Send payment confirmation
await emailService.sendPaymentConfirmation('user@example.com', {
  customerName: 'John Doe',
  orderId: 'BOOM-123456',
  amount: 50.00,
  currency: 'BGN',
  date: new Date(),
});

// Send receipt confirmation
await emailService.sendReceiptConfirmation('user@example.com', {
  customerName: 'John Doe',
  merchantName: 'Restaurant ABC',
  amount: 45.00,
  cashbackAmount: 2.25,
  submissionDate: new Date(),
});

// Send wallet update
await emailService.sendWalletUpdate('user@example.com', {
  customerName: 'John Doe',
  newBalance: 125.50,
  changeAmount: 50.00,
  transactionType: 'credit',
  description: 'Wallet topped up',
  date: new Date(),
});

// Send welcome email
await emailService.sendWelcomeEmail('user@example.com', {
  customerName: 'John Doe',
  email: 'john@example.com',
  dashboardUrl: 'https://boomcard.bg/dashboard',
});
```

---

## Email Templates

### 1. Payment Confirmation

**Trigger**: Payment successfully processed via Paysera

**Contains:**
- Payment amount
- Order ID
- Transaction date
- CTA: "View Wallet"

**Preview:**
![Payment Confirmation](https://via.placeholder.com/600x400?text=Payment+Confirmation)

### 2. Receipt Confirmation

**Trigger**: Receipt submitted and verified

**Contains:**
- Cashback amount (highlighted)
- Merchant name
- Purchase amount
- Submission date
- CTA: "View All Receipts"

**Preview:**
![Receipt Confirmation](https://via.placeholder.com/600x400?text=Receipt+Confirmation)

### 3. Wallet Update

**Trigger**: Wallet balance changes

**Contains:**
- Amount added/spent
- New balance
- Transaction type (credit/debit)
- CTA: "View Wallet"

**Preview:**
![Wallet Update](https://via.placeholder.com/600x400?text=Wallet+Update)

### 4. Welcome Email

**Trigger**: New user registration

**Contains:**
- Platform features
- Quick start guide
- CTA: "Get Started"

**Preview:**
![Welcome Email](https://via.placeholder.com/600x400?text=Welcome+Email)

---

## Testing Emails

### Method 1: Resend Dashboard

1. Go to [https://resend.com/emails](https://resend.com/emails)
2. View all sent emails
3. Check delivery status
4. View rendered HTML

### Method 2: Send Test Email

```typescript
// In your test file or API endpoint
import { emailService } from './services/email.service';

await emailService.sendEmail({
  to: 'your-test-email@gmail.com',
  subject: 'Test Email',
  html: '<h1>Test</h1><p>This is a test email from BoomCard.</p>',
});
```

### Method 3: Integration Tests

```typescript
describe('Email Service', () => {
  it('should send payment confirmation', async () => {
    const result = await emailService.sendPaymentConfirmation('test@example.com', {
      customerName: 'Test User',
      orderId: 'TEST-001',
      amount: 50.00,
      currency: 'BGN',
      date: new Date(),
    });

    expect(result.success).toBe(true);
  });
});
```

---

## Monitoring & Analytics

### Resend Dashboard

View in real-time:
- **Emails Sent**: Total count
- **Delivery Rate**: % successfully delivered
- **Bounce Rate**: % failed deliveries
- **Open Rate**: % opened (if tracking enabled)
- **Click Rate**: % clicked links

### Logs

Emails are logged in your backend:

```bash
# View sent emails
grep "✅ Email sent successfully" backend-api/logs/app.log

# View failed emails
grep "❌ Error sending email" backend-api/logs/app.log

# View disabled mode (development)
grep "📧 [EMAIL DISABLED]" backend-api/logs/app.log
```

---

## Troubleshooting

### Issue: Emails Not Sending

**Cause 1**: API key not configured
```bash
# Check .env file
cat backend-api/.env | grep RESEND
```

**Solution**: Add `RESEND_API_KEY` to `.env`

**Cause 2**: Production mode not enabled
```bash
# Emails only send in production
echo $NODE_ENV
```

**Solution**: Set `NODE_ENV=production`

**Cause 3**: Domain not verified
```bash
# Check Resend dashboard
curl https://api.resend.com/domains \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

**Solution**: Verify domain in Resend dashboard

### Issue: Emails in Spam

**Cause**: Missing SPF/DKIM records

**Solution**:
1. Add all DNS records from Resend dashboard
2. Wait 24-48 hours for DNS propagation
3. Send test email and check spam score

### Issue: Template Not Rendering

**Cause**: HTML/CSS issues

**Solution**:
1. Test in Resend dashboard first
2. Avoid complex CSS (use inline styles)
3. Use tables for layout (email-safe)

---

## Best Practices

### 1. Email Frequency

- **Don't spam**: Max 1 email per action
- **Batch notifications**: Group similar updates
- **Allow opt-out**: Respect user preferences

### 2. Content

- **Subject lines**: Keep under 50 characters
- **Preheader text**: First 100 characters matter
- **CTAs**: Clear, single action per email
- **Mobile-friendly**: 60% of emails opened on mobile

### 3. Deliverability

- **Warm up domain**: Start with low volume
- **Clean lists**: Remove bounces regularly
- **Monitor metrics**: Watch bounce/spam rates
- **Authenticate**: Use SPF, DKIM, DMARC

### 4. Development

- **Test thoroughly**: Use test emails
- **Error handling**: Always catch email errors
- **Fallbacks**: Don't block on email sends
- **Logging**: Log all email attempts

---

## Rate Limits

### Free Tier (3,000/month)

- 100 emails per day
- Burst: 10 emails per second
- Perfect for startups

### Paid Plans

- **Pro ($20/month)**: 50,000 emails
- **Business ($80/month)**: 250,000 emails
- **Enterprise**: Custom pricing

**Current usage**: Check [https://resend.com/usage](https://resend.com/usage)

---

## Advanced Features

### 1. Email Attachments

```typescript
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Invoice',
  html: '<p>Your invoice is attached.</p>',
  attachments: [
    {
      filename: 'invoice.pdf',
      content: pdfBuffer,
    },
  ],
});
```

### 2. Scheduled Emails

```typescript
await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Scheduled Email',
  html: '<p>This will be sent later.</p>',
  scheduledAt: '2025-12-25T09:00:00Z',
});
```

### 3. Email Templates (React Email)

```bash
# Install React Email
npm install react-email @react-email/components
```

```typescript
import { render } from '@react-email/render';
import WelcomeEmail from './emails/Welcome';

const html = render(<WelcomeEmail name="John" />);

await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome!',
  html,
});
```

### 4. Webhooks

Set up webhooks to track:
- Email delivered
- Email bounced
- Email opened
- Link clicked

```typescript
// Webhook endpoint
router.post('/webhooks/resend', (req, res) => {
  const { type, data } = req.body;

  if (type === 'email.delivered') {
    logger.info(`Email ${data.email_id} delivered`);
  }

  res.send('OK');
});
```

---

## Migration from Other Providers

### From SendGrid

```typescript
// Before (SendGrid)
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

await sgMail.send({
  to: 'user@example.com',
  from: 'noreply@boomcard.bg',
  subject: 'Hello',
  html: '<p>Hello!</p>',
});

// After (Resend)
import { emailService } from './services/email.service';

await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello!</p>',
});
```

### From Mailgun

```typescript
// Before (Mailgun)
const mailgun = require('mailgun-js')({
  apiKey: process.env.MAILGUN_API_KEY,
  domain: 'boomcard.bg',
});

await mailgun.messages().send({
  to: 'user@example.com',
  from: 'noreply@boomcard.bg',
  subject: 'Hello',
  html: '<p>Hello!</p>',
});

// After (Resend)
import { emailService } from './services/email.service';

await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hello!</p>',
});
```

---

## Cost Comparison

| Provider | Free Tier | Paid (50k emails) |
|----------|-----------|-------------------|
| **Resend** | 3,000/month | $20/month |
| SendGrid | 100/day | $15/month |
| Mailgun | 5,000/month (trial only) | $35/month |
| Amazon SES | 62,000/month (with AWS) | $5/month |
| Postmark | 100/month | $15/month |

**Winner**: Resend for startups, Amazon SES for high volume

---

## Support

**Resend Support:**
- Docs: https://resend.com/docs
- Discord: https://resend.com/discord
- Email: support@resend.com

**BoomCard Team:**
- GitHub Issues: your-repo/issues
- Email: dev@boomcard.bg

---

**Setup Date:** _____________________
**Configured By:** _____________________
**Domain Verified:** Yes / No
**Free Tier Limit:** 3,000 / month
**Current Usage:** _____ / 3,000
