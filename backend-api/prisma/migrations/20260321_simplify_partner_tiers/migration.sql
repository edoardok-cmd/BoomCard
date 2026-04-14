-- No-op: this migration is superseded by 20260321_dynamic_partner_types,
-- which replaces the PartnerTier enum with a dynamic PartnerType table
-- and already handles the BASIC/LIGHT/PREMIUM mapping.
SELECT 1;
