const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

async function setup() {
  // Create test admin
  const adminUser = await prisma.user.create({
    data: {
      email: `admin-task-audit-${Date.now()}@test.local`,
      firstName: 'Test',
      lastName: 'AdminAudit',
      role: 'ADMIN',
      status: 'ACTIVE',
      emailVerified: true,
      passwordHash: 'dummy-hash',
    },
  });

  // Create test partner user
  const partnerUser = await prisma.user.create({
    data: {
      email: `partner-task-audit-${Date.now()}@test.local`,
      firstName: 'Test',
      lastName: 'PartnerAudit',
      role: 'PARTNER',
      status: 'ACTIVE',
      emailVerified: true,
      passwordHash: 'dummy-hash',
    },
  });

  // Create partner in PENDING status with ONBOARDING requestStatus
  const partner = await prisma.partner.create({
    data: {
      businessName: 'Test Business Audit',
      userId: partnerUser.id,
      email: partnerUser.email,
      category: 'restaurants',
      status: 'PENDING',
      requestStatus: 'ONBOARDING',
    },
  });

  // Issue an activation link for this partner
  const activationLink = await prisma.activationLink.create({
    data: {
      partnerId: partner.id,
      token: 'test-token-' + Date.now(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdById: adminUser.id,
      reason: 'INITIAL',
    },
  });

  // Generate JWT tokens
  const adminToken = jwt.sign(
    {
      id: adminUser.id,
      email: adminUser.email,
      role: 'ADMIN',
    },
    process.env.JWT_SECRET || 'test-secret-key',
    { expiresIn: '24h' }
  );

  console.log(JSON.stringify({
    adminUserId: adminUser.id,
    adminToken,
    partnerId: partner.id,
    activationLinkId: activationLink.id,
  }, null, 2));

  await prisma.$disconnect();
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
