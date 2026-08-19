-- Composite indexes matching the where/orderBy shapes the app actually runs.
-- The schema carried mostly single-column foreign-key indexes, while every
-- list sorts by createdAt — so Postgres read all of a user's rows and sorted
-- them in memory.
--
-- CONCURRENTLY is deliberately not used: Prisma Migrate runs statements in a
-- transaction, which forbids it. On a small table set this is fine; on a hot
-- production database, apply these by hand with CONCURRENTLY instead.

CREATE INDEX "notification_userId_createdAt_id_idx" ON "notification"("userId", "createdAt", "id");
CREATE INDEX "notification_userId_type_targetId_idx" ON "notification"("userId", "type", "targetId");

CREATE INDEX "post_authorId_createdAt_id_idx" ON "post"("authorId", "createdAt", "id");

CREATE INDEX "ride_creatorId_createdAt_id_idx" ON "ride"("creatorId", "createdAt", "id");
CREATE INDEX "ride_groupId_status_startTime_idx" ON "ride"("groupId", "status", "startTime");
CREATE INDEX "ride_startLat_startLng_idx" ON "ride"("startLat", "startLng");

CREATE INDEX "ride_participant_rideId_status_createdAt_idx" ON "ride_participant"("rideId", "status", "createdAt");

CREATE INDEX "group_member_groupId_status_idx" ON "group_member"("groupId", "status");
CREATE INDEX "group_member_userId_status_idx" ON "group_member"("userId", "status");

CREATE INDEX "group_message_groupId_createdAt_idx" ON "group_message"("groupId", "createdAt");
CREATE INDEX "group_announcement_groupId_createdAt_idx" ON "group_announcement"("groupId", "createdAt");

CREATE INDEX "direct_message_senderId_recipientId_createdAt_idx" ON "direct_message"("senderId", "recipientId", "createdAt");
CREATE INDEX "direct_message_recipientId_senderId_createdAt_idx" ON "direct_message"("recipientId", "senderId", "createdAt");
CREATE INDEX "direct_message_recipientId_readAt_idx" ON "direct_message"("recipientId", "readAt");

CREATE INDEX "activity_log_action_createdAt_idx" ON "activity_log"("action", "createdAt");
CREATE INDEX "activity_log_actorId_createdAt_idx" ON "activity_log"("actorId", "createdAt");

CREATE INDEX "session_expiresAt_idx" ON "session"("expiresAt");
CREATE INDEX "user_banned_createdAt_idx" ON "user"("banned", "createdAt");
CREATE INDEX "radnet_event_detailSyncedAt_date_idx" ON "radnet_event"("detailSyncedAt", "date");

-- Re-uploading an image reused a position and silently created duplicates.
-- Collapse any existing duplicates before adding the constraint.
DELETE FROM "post_image" a
  USING "post_image" b
  WHERE a."postId" = b."postId"
    AND a."position" = b."position"
    AND a."id" > b."id";

CREATE UNIQUE INDEX "post_image_postId_position_key" ON "post_image"("postId", "position");
