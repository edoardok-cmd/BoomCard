/**
 * SQLite to PostgreSQL Migration Script
 *
 * This script exports all data from the SQLite database to JSON files
 * that can be imported into PostgreSQL.
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

async function exportData(): Promise<MigrationData> {
  console.log('📊 Starting SQLite data export...\n');

  const data: MigrationData = {
    users: [],
    refreshTokens: [],
    partners: [],
    venues: [],
    offers: [],
    transactions: [],
    receipts: [],
    receiptAnalytics: [],
    merchantWhitelist: [],
    venueFraudConfig: [],
    loyaltyAccounts: [],
    loyaltyTransactions: [],
    rewards: [],
    rewardRedemptions: [],
    badges: [],
    userBadges: [],
    bookings: [],
    reviews: [],
    conversations: [],
    conversationParticipants: [],
    messages: [],
    notifications: [],
    favorites: [],
    cards: [],
    stickers: [],
    stickerLocations: [],
    stickerScans: [],
    venueStickerConfigs: [],
  };

  try {
    // Export Users
    console.log('Exporting users...');
    data.users = await prisma.user.findMany({
      include: {
        refreshTokens: true,
        partner: true,
        transactions: true,
        receipts: true,
        loyaltyAccount: true,
        bookings: true,
        reviews: true,
        favorites: true,
        cards: true,
        stickerScans: true,
      },
    });
    console.log(`✓ Exported ${data.users.length} users`);

    // Export RefreshTokens
    console.log('Exporting refresh tokens...');
    data.refreshTokens = await prisma.refreshToken.findMany();
    console.log(`✓ Exported ${data.refreshTokens.length} refresh tokens`);

    // Export Partners
    console.log('Exporting partners...');
    data.partners = await prisma.partner.findMany({
      include: {
        venues: true,
        offers: true,
        reviews: true,
        bookings: true,
        transactions: true,
      },
    });
    console.log(`✓ Exported ${data.partners.length} partners`);

    // Export Venues
    console.log('Exporting venues...');
    data.venues = await prisma.venue.findMany({
      include: {
        bookings: true,
        stickers: true,
        stickerLocations: true,
        stickerScans: true,
        stickerConfig: true,
      },
    });
    console.log(`✓ Exported ${data.venues.length} venues`);

    // Export Offers
    console.log('Exporting offers...');
    data.offers = await prisma.offer.findMany({
      include: {
        transactions: true,
      },
    });
    console.log(`✓ Exported ${data.offers.length} offers`);

    // Export Transactions
    console.log('Exporting transactions...');
    data.transactions = await prisma.transaction.findMany({
      include: {
        receipt: true,
        stickerScan: true,
      },
    });
    console.log(`✓ Exported ${data.transactions.length} transactions`);

    // Export Receipts
    console.log('Exporting receipts...');
    data.receipts = await prisma.receipt.findMany({
      include: {
        transaction: true,
      },
    });
    console.log(`✓ Exported ${data.receipts.length} receipts`);

    // Export Receipt Analytics
    console.log('Exporting receipt analytics...');
    data.receiptAnalytics = await prisma.receiptAnalytics.findMany();
    console.log(`✓ Exported ${data.receiptAnalytics.length} receipt analytics`);

    // Export Merchant Whitelist
    console.log('Exporting merchant whitelist...');
    data.merchantWhitelist = await prisma.merchantWhitelist.findMany();
    console.log(`✓ Exported ${data.merchantWhitelist.length} merchant whitelist entries`);

    // Export Venue Fraud Config
    console.log('Exporting venue fraud configs...');
    data.venueFraudConfig = await prisma.venueFraudConfig.findMany();
    console.log(`✓ Exported ${data.venueFraudConfig.length} venue fraud configs`);

    // Export Loyalty Accounts
    console.log('Exporting loyalty accounts...');
    data.loyaltyAccounts = await prisma.loyaltyAccount.findMany({
      include: {
        transactions: true,
        rewards: true,
        badges: true,
      },
    });
    console.log(`✓ Exported ${data.loyaltyAccounts.length} loyalty accounts`);

    // Export Loyalty Transactions
    console.log('Exporting loyalty transactions...');
    data.loyaltyTransactions = await prisma.loyaltyTransaction.findMany();
    console.log(`✓ Exported ${data.loyaltyTransactions.length} loyalty transactions`);

    // Export Rewards
    console.log('Exporting rewards...');
    data.rewards = await prisma.reward.findMany({
      include: {
        redemptions: true,
      },
    });
    console.log(`✓ Exported ${data.rewards.length} rewards`);

    // Export Reward Redemptions
    console.log('Exporting reward redemptions...');
    data.rewardRedemptions = await prisma.rewardRedemption.findMany();
    console.log(`✓ Exported ${data.rewardRedemptions.length} reward redemptions`);

    // Export Badges
    console.log('Exporting badges...');
    data.badges = await prisma.badge.findMany({
      include: {
        userBadges: true,
      },
    });
    console.log(`✓ Exported ${data.badges.length} badges`);

    // Export User Badges
    console.log('Exporting user badges...');
    data.userBadges = await prisma.userBadge.findMany();
    console.log(`✓ Exported ${data.userBadges.length} user badges`);

    // Export Bookings
    console.log('Exporting bookings...');
    data.bookings = await prisma.booking.findMany({
      include: {
        transactions: true,
      },
    });
    console.log(`✓ Exported ${data.bookings.length} bookings`);

    // Export Reviews
    console.log('Exporting reviews...');
    data.reviews = await prisma.review.findMany();
    console.log(`✓ Exported ${data.reviews.length} reviews`);

    // Export Conversations
    console.log('Exporting conversations...');
    data.conversations = await prisma.conversation.findMany({
      include: {
        participants: true,
        messages: true,
      },
    });
    console.log(`✓ Exported ${data.conversations.length} conversations`);

    // Export Conversation Participants
    console.log('Exporting conversation participants...');
    data.conversationParticipants = await prisma.conversationParticipant.findMany();
    console.log(`✓ Exported ${data.conversationParticipants.length} conversation participants`);

    // Export Messages
    console.log('Exporting messages...');
    data.messages = await prisma.message.findMany();
    console.log(`✓ Exported ${data.messages.length} messages`);

    // Export Notifications
    console.log('Exporting notifications...');
    data.notifications = await prisma.notification.findMany();
    console.log(`✓ Exported ${data.notifications.length} notifications`);

    // Export Favorites
    console.log('Exporting favorites...');
    data.favorites = await prisma.favorite.findMany();
    console.log(`✓ Exported ${data.favorites.length} favorites`);

    // Export Cards
    console.log('Exporting cards...');
    data.cards = await prisma.card.findMany({
      include: {
        stickerScans: true,
      },
    });
    console.log(`✓ Exported ${data.cards.length} cards`);

    // Export Stickers
    console.log('Exporting stickers...');
    data.stickers = await prisma.sticker.findMany({
      include: {
        scans: true,
      },
    });
    console.log(`✓ Exported ${data.stickers.length} stickers`);

    // Export Sticker Locations
    console.log('Exporting sticker locations...');
    data.stickerLocations = await prisma.stickerLocation.findMany({
      include: {
        stickers: true,
      },
    });
    console.log(`✓ Exported ${data.stickerLocations.length} sticker locations`);

    // Export Sticker Scans
    console.log('Exporting sticker scans...');
    data.stickerScans = await prisma.stickerScan.findMany();
    console.log(`✓ Exported ${data.stickerScans.length} sticker scans`);

    // Export Venue Sticker Configs
    console.log('Exporting venue sticker configs...');
    data.venueStickerConfigs = await prisma.venueStickerConfig.findMany();
    console.log(`✓ Exported ${data.venueStickerConfigs.length} venue sticker configs`);

    console.log('\n✅ Data export complete!\n');
    return data;
  } catch (error) {
    console.error('❌ Error exporting data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function saveToFile(data: MigrationData, outputPath: string) {
  console.log(`💾 Saving data to ${outputPath}...\n`);

  try {
    // Create output directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save to JSON file
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');

    // Calculate file size
    const stats = fs.statSync(outputPath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Data saved successfully!`);
    console.log(`📁 File: ${outputPath}`);
    console.log(`📊 Size: ${fileSizeMB} MB\n`);

    // Print summary
    console.log('📈 Migration Summary:');
    console.log('─'.repeat(50));
    Object.entries(data).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        console.log(`${key.padEnd(30)} ${value.length.toString().padStart(6)} records`);
      }
    });
    console.log('─'.repeat(50));
    console.log('\n✅ Export complete! You can now import this data to PostgreSQL.\n');
  } catch (error) {
    console.error('❌ Error saving file:', error);
    throw error;
  }
}

async function main() {
  const outputPath = path.join(__dirname, '..', 'migrations', 'sqlite-export.json');

  console.log('🚀 SQLite to PostgreSQL Migration Tool');
  console.log('═'.repeat(50));
  console.log('This script will export all data from SQLite to JSON\n');

  try {
    const data = await exportData();
    await saveToFile(data, outputPath);

    console.log('📋 Next Steps:');
    console.log('1. Set up PostgreSQL database');
    console.log('2. Update DATABASE_URL in .env.production');
    console.log('3. In schema.prisma, change provider from "sqlite" to "postgresql"');
    console.log('4. Run: npx prisma migrate dev --name init_postgresql');
    console.log('5. Run: npm run migrate:import (to import the data)\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
