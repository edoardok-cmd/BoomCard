/**
 * PostgreSQL Data Import Script
 *
 * This script imports data from the SQLite export JSON file into PostgreSQL.
 * Run this AFTER migrating the schema to PostgreSQL.
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface MigrationData {
  users: any[];
  refreshTokens: any[];
  partners: any[];
  venues: any[];
  offers: any[];
  transactions: any[];
  receipts: any[];
  receiptAnalytics: any[];
  merchantWhitelist: any[];
  venueFraudConfig: any[];
  loyaltyAccounts: any[];
  loyaltyTransactions: any[];
  rewards: any[];
  rewardRedemptions: any[];
  badges: any[];
  userBadges: any[];
  bookings: any[];
  reviews: any[];
  conversations: any[];
  conversationParticipants: any[];
  messages: any[];
  notifications: any[];
  favorites: any[];
  cards: any[];
  stickers: any[];
  stickerLocations: any[];
  stickerScans: any[];
  venueStickerConfigs: any[];
}

async function loadData(filePath: string): Promise<MigrationData> {
  console.log(`📂 Loading data from ${filePath}...\n`);

  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(fileContent);

    console.log('✅ Data loaded successfully!\n');
    return data;
  } catch (error) {
    console.error('❌ Error loading file:', error);
    throw error;
  }
}

function cleanRelations(data: any): any {
  // Remove relation fields that Prisma will handle
  const cleaned = { ...data };
  const relationFields = [
    'refreshTokens',
    'partner',
    'transactions',
    'receipts',
    'loyaltyAccount',
    'conversations',
    'messages',
    'notifications',
    'bookings',
    'reviews',
    'favorites',
    'cards',
    'stickerScans',
    'user',
    'venues',
    'offers',
    'stickers',
    'stickerLocations',
    'stickerConfig',
    'receipt',
    'stickerScan',
    'transaction',
    'participants',
    'scans',
    'badges',
    'rewards',
    'redemptions',
    'userBadges',
    'venue',
    'location',
    'sticker',
    'card',
    'account',
    'reward',
    'badge',
    'conversation',
  ];

  relationFields.forEach((field) => {
    delete cleaned[field];
  });

  return cleaned;
}

async function importData(data: MigrationData) {
  console.log('📊 Starting PostgreSQL data import...\n');

  try {
    // Import in order of dependencies

    // 1. Users (no dependencies)
    console.log('Importing users...');
    for (const user of data.users) {
      await prisma.user.create({
        data: cleanRelations(user),
      });
    }
    console.log(`✓ Imported ${data.users.length} users`);

    // 2. Refresh Tokens
    console.log('Importing refresh tokens...');
    for (const token of data.refreshTokens) {
      await prisma.refreshToken.create({
        data: cleanRelations(token),
      });
    }
    console.log(`✓ Imported ${data.refreshTokens.length} refresh tokens`);

    // 3. Partners
    console.log('Importing partners...');
    for (const partner of data.partners) {
      await prisma.partner.create({
        data: cleanRelations(partner),
      });
    }
    console.log(`✓ Imported ${data.partners.length} partners`);

    // 4. Venues
    console.log('Importing venues...');
    for (const venue of data.venues) {
      await prisma.venue.create({
        data: cleanRelations(venue),
      });
    }
    console.log(`✓ Imported ${data.venues.length} venues`);

    // 5. Offers
    console.log('Importing offers...');
    for (const offer of data.offers) {
      await prisma.offer.create({
        data: cleanRelations(offer),
      });
    }
    console.log(`✓ Imported ${data.offers.length} offers`);

    // 6. Bookings
    console.log('Importing bookings...');
    for (const booking of data.bookings) {
      await prisma.booking.create({
        data: cleanRelations(booking),
      });
    }
    console.log(`✓ Imported ${data.bookings.length} bookings`);

    // 7. Transactions
    console.log('Importing transactions...');
    for (const transaction of data.transactions) {
      await prisma.transaction.create({
        data: cleanRelations(transaction),
      });
    }
    console.log(`✓ Imported ${data.transactions.length} transactions`);

    // 8. Receipts
    console.log('Importing receipts...');
    for (const receipt of data.receipts) {
      await prisma.receipt.create({
        data: cleanRelations(receipt),
      });
    }
    console.log(`✓ Imported ${data.receipts.length} receipts`);

    // 9. Receipt Analytics
    console.log('Importing receipt analytics...');
    for (const analytics of data.receiptAnalytics) {
      await prisma.receiptAnalytics.create({
        data: cleanRelations(analytics),
      });
    }
    console.log(`✓ Imported ${data.receiptAnalytics.length} receipt analytics`);

    // 10. Merchant Whitelist
    console.log('Importing merchant whitelist...');
    for (const merchant of data.merchantWhitelist) {
      await prisma.merchantWhitelist.create({
        data: cleanRelations(merchant),
      });
    }
    console.log(`✓ Imported ${data.merchantWhitelist.length} merchant whitelist entries`);

    // 11. Venue Fraud Config
    console.log('Importing venue fraud configs...');
    for (const config of data.venueFraudConfig) {
      await prisma.venueFraudConfig.create({
        data: cleanRelations(config),
      });
    }
    console.log(`✓ Imported ${data.venueFraudConfig.length} venue fraud configs`);

    // 12. Loyalty Accounts
    console.log('Importing loyalty accounts...');
    for (const account of data.loyaltyAccounts) {
      await prisma.loyaltyAccount.create({
        data: cleanRelations(account),
      });
    }
    console.log(`✓ Imported ${data.loyaltyAccounts.length} loyalty accounts`);

    // 13. Loyalty Transactions
    console.log('Importing loyalty transactions...');
    for (const transaction of data.loyaltyTransactions) {
      await prisma.loyaltyTransaction.create({
        data: cleanRelations(transaction),
      });
    }
    console.log(`✓ Imported ${data.loyaltyTransactions.length} loyalty transactions`);

    // 14. Rewards
    console.log('Importing rewards...');
    for (const reward of data.rewards) {
      await prisma.reward.create({
        data: cleanRelations(reward),
      });
    }
    console.log(`✓ Imported ${data.rewards.length} rewards`);

    // 15. Reward Redemptions
    console.log('Importing reward redemptions...');
    for (const redemption of data.rewardRedemptions) {
      await prisma.rewardRedemption.create({
        data: cleanRelations(redemption),
      });
    }
    console.log(`✓ Imported ${data.rewardRedemptions.length} reward redemptions`);

    // 16. Badges
    console.log('Importing badges...');
    for (const badge of data.badges) {
      await prisma.badge.create({
        data: cleanRelations(badge),
      });
    }
    console.log(`✓ Imported ${data.badges.length} badges`);

    // 17. User Badges
    console.log('Importing user badges...');
    for (const userBadge of data.userBadges) {
      await prisma.userBadge.create({
        data: cleanRelations(userBadge),
      });
    }
    console.log(`✓ Imported ${data.userBadges.length} user badges`);

    // 18. Reviews
    console.log('Importing reviews...');
    for (const review of data.reviews) {
      await prisma.review.create({
        data: cleanRelations(review),
      });
    }
    console.log(`✓ Imported ${data.reviews.length} reviews`);

    // 19. Conversations
    console.log('Importing conversations...');
    for (const conversation of data.conversations) {
      await prisma.conversation.create({
        data: cleanRelations(conversation),
      });
    }
    console.log(`✓ Imported ${data.conversations.length} conversations`);

    // 20. Conversation Participants
    console.log('Importing conversation participants...');
    for (const participant of data.conversationParticipants) {
      await prisma.conversationParticipant.create({
        data: cleanRelations(participant),
      });
    }
    console.log(`✓ Imported ${data.conversationParticipants.length} conversation participants`);

    // 21. Messages
    console.log('Importing messages...');
    for (const message of data.messages) {
      await prisma.message.create({
        data: cleanRelations(message),
      });
    }
    console.log(`✓ Imported ${data.messages.length} messages`);

    // 22. Notifications
    console.log('Importing notifications...');
    for (const notification of data.notifications) {
      await prisma.notification.create({
        data: cleanRelations(notification),
      });
    }
    console.log(`✓ Imported ${data.notifications.length} notifications`);

    // 23. Favorites
    console.log('Importing favorites...');
    for (const favorite of data.favorites) {
      await prisma.favorite.create({
        data: cleanRelations(favorite),
      });
    }
    console.log(`✓ Imported ${data.favorites.length} favorites`);

    // 24. Cards
    console.log('Importing cards...');
    for (const card of data.cards) {
      await prisma.card.create({
        data: cleanRelations(card),
      });
    }
    console.log(`✓ Imported ${data.cards.length} cards`);

    // 25. Sticker Locations
    console.log('Importing sticker locations...');
    for (const location of data.stickerLocations) {
      await prisma.stickerLocation.create({
        data: cleanRelations(location),
      });
    }
    console.log(`✓ Imported ${data.stickerLocations.length} sticker locations`);

    // 26. Stickers
    console.log('Importing stickers...');
    for (const sticker of data.stickers) {
      await prisma.sticker.create({
        data: cleanRelations(sticker),
      });
    }
    console.log(`✓ Imported ${data.stickers.length} stickers`);

    // 27. Sticker Scans
    console.log('Importing sticker scans...');
    for (const scan of data.stickerScans) {
      await prisma.stickerScan.create({
        data: cleanRelations(scan),
      });
    }
    console.log(`✓ Imported ${data.stickerScans.length} sticker scans`);

    // 28. Venue Sticker Configs
    console.log('Importing venue sticker configs...');
    for (const config of data.venueStickerConfigs) {
      await prisma.venueStickerConfig.create({
        data: cleanRelations(config),
      });
    }
    console.log(`✓ Imported ${data.venueStickerConfigs.length} venue sticker configs`);

    console.log('\n✅ Data import complete!\n');
  } catch (error) {
    console.error('❌ Error importing data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const inputPath = path.join(__dirname, '..', 'migrations', 'sqlite-export.json');

  console.log('🚀 PostgreSQL Data Import Tool');
  console.log('═'.repeat(50));
  console.log('This script will import data from SQLite export to PostgreSQL\n');

  // Check if file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Export file not found: ${inputPath}`);
    console.error('Please run the export script first: npm run migrate:export\n');
    process.exit(1);
  }

  try {
    const data = await loadData(inputPath);
    await importData(data);

    console.log('✅ Migration complete! Your PostgreSQL database is ready.\n');
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

main();
