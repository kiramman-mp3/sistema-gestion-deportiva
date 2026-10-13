-- CreateEnum
CREATE TYPE "issued_document_kind" AS ENUM ('carne', 'certificado_inscripcion');

-- CreateTable
CREATE TABLE "issued_documents" (
    "id" UUID NOT NULL,
    "kind" "issued_document_kind" NOT NULL,
    "serial" SERIAL NOT NULL,
    "athlete_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "verification_code" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "issued_by_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,

    CONSTRAINT "issued_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_serial_key" ON "issued_documents"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_verification_code_key" ON "issued_documents"("verification_code");

-- CreateIndex
CREATE INDEX "issued_documents_athlete_id_season_id_kind_idx" ON "issued_documents"("athlete_id", "season_id", "kind");

-- CreateIndex
CREATE INDEX "issued_documents_issued_by_id_idx" ON "issued_documents"("issued_by_id");

-- CreateIndex
CREATE INDEX "issued_documents_revoked_by_id_idx" ON "issued_documents"("revoked_by_id");

-- CreateIndex
CREATE INDEX "issued_documents_season_id_idx" ON "issued_documents"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_athlete_id_season_id_kind_version_key" ON "issued_documents"("athlete_id", "season_id", "kind", "version");

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK ─────────────────────

ALTER TABLE "issued_documents"
  ADD CONSTRAINT "issued_documents_version_valid" CHECK ("version" >= 1),
  -- Código de verificación: 16 caracteres Base32.
  ADD CONSTRAINT "issued_documents_code_format" CHECK ("verification_code" ~ '^[A-Z2-7]{16}$'),
  -- Un documento anulado dice quién, cuándo y por qué.
  ADD CONSTRAINT "issued_documents_revocation_consistent"
  CHECK (
    ("revoked_at" IS NULL AND "revoked_by_id" IS NULL AND "revoke_reason" IS NULL)
    OR ("revoked_at" IS NOT NULL AND "revoked_by_id" IS NOT NULL AND "revoke_reason" IS NOT NULL)
  );

-- De cada deportista, temporada y tipo solo hay una versión vigente a la vez.
CREATE UNIQUE INDEX "issued_documents_one_valid_per_version_key"
  ON "issued_documents" ("athlete_id", "season_id", "kind")
  WHERE "revoked_at" IS NULL;
