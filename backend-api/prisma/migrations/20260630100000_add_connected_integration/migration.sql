CREATE TABLE "connected_integrations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "credentials" JSONB,
    "settings" JSONB,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connected_integrations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connected_integrations_partnerId_integrationId_key" ON "connected_integrations"("partnerId", "integrationId");
CREATE INDEX "connected_integrations_partnerId_idx" ON "connected_integrations"("partnerId");

ALTER TABLE "connected_integrations" ADD CONSTRAINT "connected_integrations_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
