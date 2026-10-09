-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('sistema', 'correo');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pendiente', 'enviada', 'fallida');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "template_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "link" TEXT,
    "status" "notification_status" NOT NULL DEFAULT 'pendiente',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3),
    "last_error" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_channel_read_at_created_at_idx" ON "notifications"("user_id", "channel", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_channel_status_next_attempt_at_created_at_idx" ON "notifications"("channel", "status", "next_attempt_at", "created_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK ─────────────────────

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_attempts_check" CHECK ("attempts" >= 0),
  -- Solo rutas internas de la interfaz: nunca direcciones externas.
  ADD CONSTRAINT "notifications_link_internal" CHECK ("link" IS NULL OR "link" LIKE '#/%'),
  -- Los avisos del sistema no se «envían» por cola.
  ADD CONSTRAINT "notifications_system_not_pending" CHECK ("channel" <> 'sistema' OR "status" = 'enviada');
