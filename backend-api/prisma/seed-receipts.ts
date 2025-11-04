import { PrismaClient, ReceiptStatus } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  // Get the demo user
  const demoUser = await prisma.user.findUnique({
    where: { email: 'demo@boomcard.bg' },
  });

  if (!demoUser) {
    console.error('Demo user not found. Please run main seed first.');
    return;
  }

  console.log(`Creating receipts for user: ${demoUser.email}`);

  // Create 5 test receipts
  const receipts = [
    {
      userId: demoUser.id,
      merchantName: 'Kaufland',
      totalAmount: 45.80,
      date: new Date('2025-11-03T10:30:00Z'),
      rawText: 'KAUFLAND BULGARIA\nул. Витоша 123\nСофия 1000\n\nХляб           2.50 лв\nМляко          3.20 лв\nСирене         8.90 лв\nДомати         4.50 лв\nКартофи        3.80 лв\nОлио          12.90 лв\nЯйца           6.00 лв\nПаста          4.00 лв\n\nОБЩО:         45.80 лв\nПлатено: Карта\nДата: 03.11.2025 10:30',
      confidence: 0.92,
      items: JSON.stringify([
        { name: 'Хляб', price: 2.50, quantity: 1 },
        { name: 'Мляко', price: 3.20, quantity: 1 },
        { name: 'Сирене', price: 8.90, quantity: 1 },
        { name: 'Домати', price: 4.50, quantity: 1 },
        { name: 'Картофи', price: 3.80, quantity: 1 },
        { name: 'Олио', price: 12.90, quantity: 1 },
        { name: 'Яйца', price: 6.00, quantity: 1 },
        { name: 'Паста', price: 4.00, quantity: 1 },
      ]),
      status: ReceiptStatus.APPROVED,
      isValidated: true,
      validatedBy: 'admin',
      validatedAt: new Date(),
      imageHash: crypto.createHash('sha256').update(`kaufland-${Date.now()}`).digest('hex'),
    },
    {
      userId: demoUser.id,
      merchantName: 'Billa',
      totalAmount: 32.50,
      date: new Date('2025-11-02T15:20:00Z'),
      rawText: 'BILLA\nбул. Витошка 45\nСофия\n\nПлодове        12.30 лв\nЗеленчуци       8.90 лв\nМесо           11.30 лв\n\nОБЩО:          32.50 лв\nПлатено: Карта',
      confidence: 0.88,
      items: JSON.stringify([
        { name: 'Плодове', price: 12.30, quantity: 1 },
        { name: 'Зеленчуци', price: 8.90, quantity: 1 },
        { name: 'Месо', price: 11.30, quantity: 1 },
      ]),
      status: ReceiptStatus.APPROVED,
      isValidated: true,
      validatedBy: 'admin',
      validatedAt: new Date(),
      imageHash: crypto.createHash('sha256').update(`billa-${Date.now()}`).digest('hex'),
    },
    {
      userId: demoUser.id,
      merchantName: 'Lidl',
      totalAmount: 28.90,
      date: new Date('2025-11-01T12:10:00Z'),
      rawText: 'LIDL\nул. Граф Игнатиев 78\nСофия\n\nХляб            1.80 лв\nКафе            8.90 лв\nШоколад         5.20 лв\nМляко           3.00 лв\nЯйца            5.00 лв\n Масло           5.00 лв\n\nОБЩО:          28.90 лв',
      confidence: 0.95,
      items: JSON.stringify([
        { name: 'Хляб', price: 1.80, quantity: 1 },
        { name: 'Кафе', price: 8.90, quantity: 1 },
        { name: 'Шоколад', price: 5.20, quantity: 1 },
        { name: 'Мляко', price: 3.00, quantity: 1 },
        { name: 'Яйца', price: 5.00, quantity: 1 },
        { name: 'Масло', price: 5.00, quantity: 1 },
      ]),
      status: ReceiptStatus.APPROVED,
      isValidated: true,
      validatedBy: 'admin',
      validatedAt: new Date(),
      imageHash: crypto.createHash('sha256').update(`lidl-${Date.now()}`).digest('hex'),
    },
    {
      userId: demoUser.id,
      merchantName: 'Fantastico',
      totalAmount: 56.40,
      date: new Date('2025-10-31T18:45:00Z'),
      rawText: 'FANTASTICO\nбул. България 102\nСофия\n\nМесо           23.50 лв\nРиба           18.90 лв\nПлодове        14.00 лв\n\nОБЩО:          56.40 лв\nПлатено: Карта',
      confidence: 0.90,
      items: JSON.stringify([
        { name: 'Месо', price: 23.50, quantity: 1 },
        { name: 'Риба', price: 18.90, quantity: 1 },
        { name: 'Плодове', price: 14.00, quantity: 1 },
      ]),
      status: ReceiptStatus.PENDING,
      isValidated: false,
      imageHash: crypto.createHash('sha256').update(`fantastico-${Date.now()}`).digest('hex'),
    },
    {
      userId: demoUser.id,
      merchantName: 'Kaufland',
      totalAmount: 38.20,
      date: new Date('2025-10-30T09:15:00Z'),
      rawText: 'KAUFLAND BULGARIA\nул. Витоша 123\nСофия 1000\n\nМляко           6.40 лв\nЯйца            5.80 лв\nМасло          12.00 лв\nПлодове         8.00 лв\nЗеленчуци       6.00 лв\n\nОБЩО:          38.20 лв',
      confidence: 0.93,
      items: JSON.stringify([
        { name: 'Мляко', price: 6.40, quantity: 2 },
        { name: 'Яйца', price: 5.80, quantity: 1 },
        { name: 'Масло', price: 12.00, quantity: 1 },
        { name: 'Плодове', price: 8.00, quantity: 1 },
        { name: 'Зеленчуци', price: 6.00, quantity: 1 },
      ]),
      status: ReceiptStatus.APPROVED,
      isValidated: true,
      validatedBy: 'admin',
      validatedAt: new Date(),
      imageHash: crypto.createHash('sha256').update(`kaufland2-${Date.now()}`).digest('hex'),
    },
  ];

  // Create all receipts
  for (const receiptData of receipts) {
    const receipt = await prisma.receipt.create({
      data: receiptData,
    });
    console.log(`✅ Created receipt: ${receipt.id} - ${receipt.merchantName} - ${receipt.totalAmount} лв`);
  }

  console.log(`\n🎉 Successfully created ${receipts.length} test receipts!`);

  // Show statistics
  const stats = await prisma.receipt.groupBy({
    by: ['status'],
    _count: true,
    where: { userId: demoUser.id },
  });

  console.log('\n📊 Receipt Statistics:');
  stats.forEach((stat) => {
    console.log(`  ${stat.status}: ${stat._count} receipts`);
  });

  const totalAmount = await prisma.receipt.aggregate({
    where: { userId: demoUser.id },
    _sum: { totalAmount: true },
  });

  console.log(`\n💰 Total Amount: ${totalAmount._sum.totalAmount?.toFixed(2) || 0} лв`);

  const cashbackReceipts = await prisma.receipt.findMany({
    where: {
      userId: demoUser.id,
      status: ReceiptStatus.APPROVED,
    },
  });

  const totalCashback = cashbackReceipts.reduce((sum, r) => sum + (r.totalAmount || 0) * 0.05, 0);
  console.log(`🎁 Total Cashback (5%): ${totalCashback.toFixed(2)} лв`);
}

main()
  .catch((e) => {
    console.error('Error seeding receipts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
