-- Public ride pages leak the start location (typically a home address), the
-- exact start time and the organiser's real name to anyone with the link.
-- The column defaulted to TRUE and `createRide` never set it, so every ride
-- ever created was shared without its creator ever choosing to.
--
-- Going forward the flag is opt-in.
ALTER TABLE "ride" ALTER COLUMN "isPublic" SET DEFAULT false;

-- Existing rides are reset to private for the same reason: nobody opted in.
-- Creators can re-enable the link from the ride page in one click
-- (`setRidePublic`), which is a far smaller cost than leaving the data out.
UPDATE "ride" SET "isPublic" = false WHERE "isPublic" = true;
