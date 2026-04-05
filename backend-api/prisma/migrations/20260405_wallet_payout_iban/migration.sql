-- Add Paysera B2C payout IBAN fields to wallets table
-- These are stored once and reused on subsequent payout requests.
ALTER TABLE "wallets" ADD COLUMN "payoutIban" TEXT;
ALTER TABLE "wallets" ADD COLUMN "payoutBeneficiaryName" TEXT;
