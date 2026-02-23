import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env synchronously before defining config
dotenv.config({ path: path.join(__dirname, '.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL environment variable is not set. Check your .env file.');
}

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),

  // Datasource URL for db push and all db commands
  datasource: {
    url: databaseUrl!,
  },

  // URL for migrations (prisma migrate deploy/status/resolve)
  migrate: {
    url: databaseUrl!,
  },

  seed: {
    command: 'npx ts-node prisma/seed.ts',
  },
});
