-- ReceiptUploadToken: single-use tokens bind an /upload to its server-computed
-- hash/livePhoto result. /submit must present a token; the server trusts only
-- the fields stored here, defeating the client-hash forgery gap.

CREATE TABLE "ReceiptUploadToken" (
    "id"             TEXT         NOT NULL,
    "token"          TEXT         NOT NULL,
    "userId"         TEXT         NOT NULL,
    "imageHash"      TEXT         NOT NULL,
    "perceptualHash" TEXT,
    "livePhotoOk"    BOOLEAN      NOT NULL DEFAULT true,
    "imageUrl"       TEXT         NOT NULL,
    "imageKey"       TEXT         NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "consumedAt"     TIMESTAMP(3),

    CONSTRAINT "ReceiptUploadToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReceiptUploadToken_token_key" ON "ReceiptUploadToken"("token");
CREATE INDEX "ReceiptUploadToken_userId_idx" ON "ReceiptUploadToken"("userId");
CREATE INDEX "ReceiptUploadToken_expiresAt_idx" ON "ReceiptUploadToken"("expiresAt");

ALTER TABLE "ReceiptUploadToken"
  ADD CONSTRAINT "ReceiptUploadToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
