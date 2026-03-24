import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const ids = [
    '52c1c8a8-c610-41c6-84e4-92c323c5cd97',  // sofia bistro
    'b341e093-3fc0-4b48-a5f3-ed4713354b5f',  // luxury spa
    '6c66da24-8bff-43a1-9494-e4b0858a604b',  // grand hotel
  ];
  
  for (const id of ids) {
    const u = await prisma.user.update({ where: { id }, data: { role: 'PARTNER' }, select: { id: true, email: true, role: true } });
    console.log(JSON.stringify(u));
  }
  
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message); process.exit(1); });
