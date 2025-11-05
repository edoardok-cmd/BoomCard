import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUser() {
  const email = 'test@boomcard.com';
  const password = 'Test123!';

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      console.log('✅ Test user already exists');
      console.log('📧 Email:', email);
      console.log('🔑 Password:', password);
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with wallet
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        role: 'USER',
        wallet: {
          create: {
            balance: 0,
            currency: 'BGN'
          }
        }
      }
    });

    console.log('✅ Test user created successfully!');
    console.log('');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('👤 User ID:', user.id);
    console.log('');
    console.log('You can now log in to the mobile app with these credentials!');

  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
