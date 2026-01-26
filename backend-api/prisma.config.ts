import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  migrate: {
    async url() {
      const dotenv = await import('dotenv');
      dotenv.config({ path: path.join(import.meta.dirname, '.env') });
      return process.env.DATABASE_URL!;
    },
  },
  seed: {
    command: 'npx ts-node prisma/seed.ts',
  },
});
