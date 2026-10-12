-- Fecha de publicación elegida por quien redacta (AAAA-MM-DD, hora de Ecuador).
-- Puede ser pasada o futura; si es futura, la publicación queda programada hasta ese día.
ALTER TABLE "announcements" ADD COLUMN "publish_date" DATE;

UPDATE "announcements"
SET "publish_date" = (COALESCE("published_at", "created_at") AT TIME ZONE 'America/Guayaquil')::date;

ALTER TABLE "announcements" ALTER COLUMN "publish_date" SET NOT NULL;

-- CreateIndex
CREATE INDEX "announcements_publish_date_idx" ON "announcements"("publish_date");
