/**
 * Seed script to create a card for test@boomcard.com user
 *
 * Usage: npx ts-node prisma/seed-test-card.ts
 */

import { PrismaClient, CardType } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Generate unique card number in format BOOM-XXXX-XXXX-XXXX
function generateCardNumber(): string {
  const segments = [];
  for (let i = 0; i < 3; i++) {
    const segment = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    segments.push(segment.toString());
  }
  return `BOOM-${segments.join('-')}`;
}

// Generate QR code data
function generateQRCode(cardNumber: string, userId: string): string {
  return JSON.stringify({
    cardNumber,
    userId,
    timestamp: new Date().toISOString(),
  });
}

async function main() {
  console.log('🚀 Starting card seed for test@boomcard.com...\n');

  // Find the test user
  console.log('📧 Looking for user: test@boomcard.com');
  const user = await prisma.user.findUnique({
    where: { email: 'test@boomcard.com' },
    include: { cards: true },
  });

  if (!user) {
    console.error('❌ ERROR: User test@boomcard.com not found in database');
    console.log('\n💡 TIP: Make sure the user exists before running this script');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})\n`);

  // Check if user already has a card
  if (user.cards && user.cards.length > 0) {
    console.log('⚠️  User already has a card:');
    user.cards.forEach((card, index) => {
      console.log(`   ${index + 1}. ${card.cardNumber} (${card.type}) - Status: ${card.status}`);
    });
    console.log('\n💡 No action needed - card already exists');
    process.exit(0);
  }

  // Generate card data
  const cardNumber = generateCardNumber();
  const qrCode = generateQRCode(cardNumber, user.id);

  console.log('🎴 Creating new card...');
  console.log(`   Card Number: ${cardNumber}`);
  console.log(`   Card Type: STANDARD`);
  console.log(`   Status: ACTIVE`);

  // Create the card
  const card = await prisma.card.create({
    data: {
      userId: user.id,
      cardNumber,
      type: CardType.STANDARD,
      status: 'ACTIVE',
      qrCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  console.log('\n✅ SUCCESS! Card created:');
  console.log(`   ID: ${card.id}`);
  console.log(`   Card Number: ${card.cardNumber}`);
  console.log(`   Type: ${card.type}`);
  console.log(`   Status: ${card.status}`);
  console.log(`   Created At: ${card.createdAt.toISOString()}`);

  console.log('\n🎉 Done! User test@boomcard.com now has a card.');
  console.log('📱 The mobile app can now fetch this card via /api/cards/my-card');
}

main()
  .catch((error) => {
    console.error('\n❌ Error running seed script:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
