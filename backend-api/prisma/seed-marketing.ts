import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('Seeding marketing data…');

  // ─── Templates ──────────────────────────────────────────────────────────────

  const [tplWelcome, tplCashback, tplPush, tplSms, tplMonthly, tplReengagement] = await Promise.all([
    prisma.marketingTemplate.create({
      data: {
        name: 'Welcome to BoomCard',
        type: 'EMAIL',
        subject: 'Your BoomCard is ready — start earning cashback today',
        body: `<h1>Welcome to BoomCard!</h1>
<p>Your card is activated and ready to use. Present it at any participating partner to start earning cashback on every purchase.</p>
<p>You currently have <strong>47 partner locations</strong> near Sofia where you can earn cashback. Check the app to discover them.</p>
<p>Happy spending,<br>The BoomCard Team</p>`,
        usageCount: 12450,
        lastUsed: new Date('2026-04-27'),
      },
    }),
    prisma.marketingTemplate.create({
      data: {
        name: 'Cashback Earned Notification',
        type: 'EMAIL',
        subject: 'You\'ve earned cashback — here\'s your summary',
        body: `<h2>Cashback credited!</h2>
<p>A new cashback reward has been added to your BoomCard balance. Your total available balance is ready to spend at any partner location.</p>
<p>Keep using your BoomCard to unlock higher cashback tiers.</p>`,
        usageCount: 23414,
        lastUsed: new Date('2026-04-28'),
      },
    }),
    prisma.marketingTemplate.create({
      data: {
        name: 'New Partner Nearby',
        type: 'PUSH',
        subject: null,
        body: '🎉 New partner nearby! {{partner_name}} is now accepting BoomCard. Earn cashback on your next visit.',
        usageCount: 8920,
        lastUsed: new Date('2026-04-25'),
      },
    }),
    prisma.marketingTemplate.create({
      data: {
        name: 'Cashback Balance Reminder',
        type: 'SMS',
        subject: null,
        body: 'BoomCard: You have {{balance}} BGN cashback ready to spend. Use it at any of our 47+ partner locations. Reply STOP to unsubscribe.',
        usageCount: 2150,
        lastUsed: new Date('2026-04-20'),
      },
    }),
    prisma.marketingTemplate.create({
      data: {
        name: 'Monthly Statement',
        type: 'EMAIL',
        subject: 'Your BoomCard monthly summary — {{month}} {{year}}',
        body: `<h2>Your monthly BoomCard summary</h2>
<p>Here's what you earned this month:</p>
<ul>
  <li>Cashback earned: <strong>{{cashback_earned}} BGN</strong></li>
  <li>Transactions: <strong>{{transaction_count}}</strong></li>
  <li>Top partner: <strong>{{top_partner}}</strong></li>
</ul>
<p>Keep it up — you're on track to reach the next cashback tier!</p>`,
        usageCount: 5670,
        lastUsed: new Date('2026-04-01'),
      },
    }),
    prisma.marketingTemplate.create({
      data: {
        name: 'Re-engagement — We Miss You',
        type: 'EMAIL',
        subject: 'It\'s been a while — here\'s what\'s new at BoomCard',
        body: `<h2>We've missed you!</h2>
<p>You haven't used your BoomCard in a while. Here's what you've been missing:</p>
<ul>
  <li>12 new partner locations added near you</li>
  <li>Improved cashback rates at restaurant partners</li>
  <li>New instant cashback feature — no waiting period</li>
</ul>
<p>Come back and start earning again. Your balance is waiting.</p>`,
        usageCount: 890,
        lastUsed: new Date('2026-03-15'),
      },
    }),
  ]);

  console.log('  ✓ 6 templates created');

  // ─── Audience Lists ──────────────────────────────────────────────────────────

  await Promise.all([
    prisma.marketingList.create({
      data: {
        name: 'All Active Subscribers',
        type: 'SEGMENT',
        description: 'Users with an active subscription who have consented to marketing emails',
        size: 12450,
      },
    }),
    prisma.marketingList.create({
      data: {
        name: 'Premium Card Holders',
        type: 'SEGMENT',
        description: 'Subscribers on the Premium or Business plan',
        size: 2340,
      },
    }),
    prisma.marketingList.create({
      data: {
        name: 'Inactive Users — 90+ Days',
        type: 'DYNAMIC',
        description: 'Users who have not made a transaction in over 90 days. Updated nightly.',
        size: 1820,
      },
    }),
    prisma.marketingList.create({
      data: {
        name: 'Sofia Region',
        type: 'SEGMENT',
        description: 'All users with a Sofia billing or home address',
        size: 5670,
      },
    }),
    prisma.marketingList.create({
      data: {
        name: 'New Signups — April 2026',
        type: 'STATIC',
        description: 'Users who registered in April 2026. Snapshot taken 2026-04-28.',
        size: 342,
      },
    }),
    prisma.marketingList.create({
      data: {
        name: 'Email Consent — Active',
        type: 'DYNAMIC',
        description: 'All users with marketingConsentEmail = true and no unsubscribe event. Synced hourly.',
        size: 9876,
      },
    }),
  ]);

  console.log('  ✓ 6 audience lists created');

  // ─── Campaigns ───────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.marketingCampaign.create({
      data: {
        name: 'Spring 2026 Partner Promo',
        type: 'EMAIL',
        status: 'SENT',
        audience: 4532,
        sentAt: new Date('2026-04-01'),
        openRate: 38.2,
        clickRate: 12.4,
        templateId: tplWelcome.id,
      },
    }),
    prisma.marketingCampaign.create({
      data: {
        name: 'New Partners Push Blast',
        type: 'PUSH',
        status: 'SENT',
        audience: 8721,
        sentAt: new Date('2026-04-10'),
        openRate: 28.1,
        clickRate: 8.3,
        templateId: tplPush.id,
      },
    }),
    prisma.marketingCampaign.create({
      data: {
        name: 'SMS Cashback Balance Reminder',
        type: 'SMS',
        status: 'SENT',
        audience: 2150,
        sentAt: new Date('2026-04-15'),
        openRate: null,
        clickRate: null,
        templateId: tplSms.id,
      },
    }),
    prisma.marketingCampaign.create({
      data: {
        name: 'Q2 Subscriber Newsletter',
        type: 'EMAIL',
        status: 'SCHEDULED',
        audience: 5000,
        sentAt: null,
        openRate: null,
        clickRate: null,
        templateId: tplMonthly.id,
      },
    }),
    prisma.marketingCampaign.create({
      data: {
        name: 'Welcome Series — Batch 2',
        type: 'EMAIL',
        status: 'DRAFT',
        audience: 0,
        sentAt: null,
        openRate: null,
        clickRate: null,
        templateId: tplWelcome.id,
      },
    }),
    prisma.marketingCampaign.create({
      data: {
        name: 'Summer 2026 Re-engagement',
        type: 'EMAIL',
        status: 'PAUSED',
        audience: 3200,
        sentAt: null,
        openRate: null,
        clickRate: null,
        templateId: tplReengagement.id,
      },
    }),
  ]);

  console.log('  ✓ 6 campaigns created');

  // ─── Automations ─────────────────────────────────────────────────────────────

  await Promise.all([
    prisma.marketingAutomation.create({
      data: {
        name: 'Welcome Email on Signup',
        trigger: 'user.signup',
        status: 'ACTIVE',
        totalRuns: 12450,
        lastRunAt: new Date('2026-04-28'),
        templateId: tplWelcome.id,
      },
    }),
    prisma.marketingAutomation.create({
      data: {
        name: 'Card Issued Confirmation',
        trigger: 'card.issued',
        status: 'ACTIVE',
        totalRuns: 8920,
        lastRunAt: new Date('2026-04-28'),
        templateId: tplWelcome.id,
      },
    }),
    prisma.marketingAutomation.create({
      data: {
        name: 'Cashback Milestone Alert',
        trigger: 'cashback.milestone',
        status: 'PAUSED',
        totalRuns: 2341,
        lastRunAt: new Date('2026-03-30'),
        templateId: tplCashback.id,
      },
    }),
    prisma.marketingAutomation.create({
      data: {
        name: 'Subscription Renewal Reminder',
        trigger: 'subscription.renew_due',
        status: 'ACTIVE',
        totalRuns: 890,
        lastRunAt: new Date('2026-04-27'),
        templateId: tplMonthly.id,
      },
    }),
    prisma.marketingAutomation.create({
      data: {
        name: 'Lapsed User Re-engagement',
        trigger: 'user.inactive_30d',
        status: 'DRAFT',
        totalRuns: 0,
        lastRunAt: null,
        templateId: tplReengagement.id,
      },
    }),
    prisma.marketingAutomation.create({
      data: {
        name: 'Monthly Statement Delivery',
        trigger: 'billing.month_end',
        status: 'ACTIVE',
        totalRuns: 5670,
        lastRunAt: new Date('2026-04-01'),
        templateId: tplMonthly.id,
      },
    }),
  ]);

  console.log('  ✓ 6 automations created');
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
