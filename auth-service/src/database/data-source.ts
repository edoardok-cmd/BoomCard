import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  username: process.env.DB_USER || 'enterprise_user',
  password: process.env.DB_PASSWORD || 'enterprise_pass',
  database: process.env.DB_NAME || 'enterprise_db',
  schema: process.env.DB_SCHEMA || 'public',
  
  // Real entity auto-discovery
  entities: ['dist/**/*.entity{.ts,.js}'],
  migrations: ['dist/migrations/*{.ts,.js}'],
  
  // Production settings
  synchronize: false, // Never auto-sync in production
  logging: ['error', 'warn', 'migration'],
  
  // Connection pooling for performance
  extra: {
    max: 100,
    min: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
});

// Real migration runner
export async function runMigrations() {
  try {
    await AppDataSource.initialize();
    await AppDataSource.runMigrations();
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}
