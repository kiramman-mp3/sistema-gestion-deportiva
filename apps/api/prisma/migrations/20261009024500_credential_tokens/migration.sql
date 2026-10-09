-- CreateEnum
CREATE TYPE "credential_token_kind" AS ENUM ('activacion', 'restablecimiento');

-- CreateTable
CREATE TABLE "credential_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "credential_token_kind" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "credential_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_tokens_token_hash_key" ON "credential_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "credential_tokens_user_id_used_at_revoked_at_idx" ON "credential_tokens"("user_id", "used_at", "revoked_at");

-- CreateIndex
CREATE INDEX "credential_tokens_expires_at_idx" ON "credential_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "credential_tokens_created_by_id_idx" ON "credential_tokens"("created_by_id");

-- AddForeignKey
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_tokens" ADD CONSTRAINT "credential_tokens_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no puede expresar
ALTER TABLE "credential_tokens"
  ADD CONSTRAINT "credential_tokens_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "credential_tokens_expires_after_created_chk" CHECK ("expires_at" > "created_at"),
  -- Un token usado no puede además figurar como anulado, y viceversa
  ADD CONSTRAINT "credential_tokens_single_end_chk" CHECK ("used_at" IS NULL OR "revoked_at" IS NULL);

-- Integridad entre estado de la cuenta y contraseña:
--  · una cuenta activa siempre tiene contraseña;
--  · una cuenta pendiente de activación nunca la tiene.
ALTER TABLE "users"
  ADD CONSTRAINT "users_active_requires_password_chk" CHECK ("status" <> 'activo' OR "password_hash" IS NOT NULL),
  ADD CONSTRAINT "users_pending_without_password_chk" CHECK ("status" <> 'pendiente' OR "password_hash" IS NULL);
