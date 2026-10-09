-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('cierre_sesion', 'reemplazada', 'revocada_por_usuario', 'revocada_por_administrador', 'cuenta_desactivada');

-- CreateEnum
CREATE TYPE "login_failure_scope" AS ENUM ('ip', 'cuenta_ip', 'cuenta');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revocation_reason" "session_revocation_reason",

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_failures" (
    "id" UUID NOT NULL,
    "scope" "login_failure_scope" NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "login_failures_scope_key_hash_created_at_idx" ON "login_failures"("scope", "key_hash", "created_at");

-- CreateIndex
CREATE INDEX "login_failures_created_at_idx" ON "login_failures"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restricciones que Prisma no puede expresar
ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_token_hash_format_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "sessions_csrf_token_chk" CHECK (btrim("csrf_token") <> ''),
  ADD CONSTRAINT "sessions_expires_after_created_chk" CHECK ("expires_at" > "created_at"),
  -- Una sesión revocada siempre indica el motivo, y solo ella
  ADD CONSTRAINT "sessions_revocation_consistent_chk" CHECK (("revoked_at" IS NULL) = ("revocation_reason" IS NULL));

ALTER TABLE "login_failures"
  ADD CONSTRAINT "login_failures_key_hash_chk" CHECK (btrim("key_hash") <> '');
