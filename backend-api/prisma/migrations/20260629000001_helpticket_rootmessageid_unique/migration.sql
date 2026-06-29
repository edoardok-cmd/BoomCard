-- Partial unique index on HelpTicket.rootMessageId
-- Prevents duplicate ticket creation when an email provider redelivers the
-- same message (TOCTOU race between findFirst and create). NULL values are
-- excluded so pre-existing tickets with null rootMessageId are unaffected.
CREATE UNIQUE INDEX "HelpTicket_rootMessageId_unique"
  ON "HelpTicket"("rootMessageId")
  WHERE "rootMessageId" IS NOT NULL;
