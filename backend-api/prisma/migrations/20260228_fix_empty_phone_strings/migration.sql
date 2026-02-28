-- Fix empty phone strings: convert '' to NULL
-- Empty strings were stored due to missing validation on profile update endpoint

UPDATE "User" SET phone = NULL WHERE phone = '';
UPDATE "Partner" SET phone = NULL WHERE phone = '';
UPDATE "Venue" SET phone = NULL WHERE phone = '';
