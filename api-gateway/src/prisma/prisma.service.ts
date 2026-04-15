import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// The api-gateway does not have its own Prisma schema.
// This is a placeholder service for the gateway's repository layer.
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  [key: string]: any;

  async onModuleInit() {
    // No database connection — gateway proxies to backend-api
  }

  async onModuleDestroy() {
    // No database connection to close
  }
}
