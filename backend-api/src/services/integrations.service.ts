import prisma from '../lib/prisma';
import { encryptCredentials } from '../utils/credentialCrypto';

export const integrationsService = {
  async getConnected(partnerId: string) {
    return prisma.connectedIntegration.findMany({
      where: { partnerId },
      select: {
        id: true,
        integrationId: true,
        status: true,
        settings: true,
        connectedAt: true,
        updatedAt: true,
        // credentials intentionally excluded — must never be echoed back (INV-SYS-018)
      },
      orderBy: { connectedAt: 'asc' },
    });
  },

  async connect(
    partnerId: string,
    integrationId: string,
    credentials: unknown,
    settings: unknown,
  ) {
    const encryptedCredentials = credentials != null ? encryptCredentials(credentials) : null;

    return prisma.connectedIntegration.upsert({
      where: { partnerId_integrationId: { partnerId, integrationId } },
      create: {
        partnerId,
        integrationId,
        status: 'active',
        credentials: encryptedCredentials,
        settings: settings as any,
      },
      update: {
        status: 'active',
        credentials: encryptedCredentials,
        settings: settings as any,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        integrationId: true,
        status: true,
        settings: true,
        connectedAt: true,
        updatedAt: true,
        // credentials intentionally excluded (INV-SYS-018)
      },
    });
  },

  async disconnect(partnerId: string, connectionId: string): Promise<boolean> {
    const result = await prisma.connectedIntegration.deleteMany({
      where: { id: connectionId, partnerId },
    });
    return result.count > 0;
  },

  async findConnection(partnerId: string, connectionId: string) {
    return prisma.connectedIntegration.findFirst({
      where: { id: connectionId, partnerId },
      select: {
        id: true,
        integrationId: true,
        status: true,
        connectedAt: true,
        updatedAt: true,
      },
    });
  },

  async getStats(partnerId: string) {
    const connections = await prisma.connectedIntegration.findMany({
      where: { partnerId },
      select: { integrationId: true, status: true },
    });
    return {
      activeIntegrations: connections.filter((c) => c.status === 'active').length,
      connectedIntegrationIds: connections.map((c) => c.integrationId),
    };
  },
};
