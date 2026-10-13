-- CreateTable
CREATE TABLE "institution_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "short_name" TEXT,
    "affiliation" TEXT,
    "canton" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "about" TEXT,
    "contact_info" TEXT,
    "privacy_policy" TEXT,
    "document_footer" TEXT,
    "president_name" TEXT,
    "secretary_name" TEXT,
    "public_clubs" BOOLEAN NOT NULL DEFAULT true,
    "public_athletes" BOOLEAN NOT NULL DEFAULT true,
    "public_news" BOOLEAN NOT NULL DEFAULT true,
    "public_resolutions" BOOLEAN NOT NULL DEFAULT false,
    "logo_file_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "institution_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_settings_logo_file_id_key" ON "institution_settings"("logo_file_id");

-- CreateIndex
CREATE INDEX "institution_settings_updated_by_id_idx" ON "institution_settings"("updated_by_id");

-- AddForeignKey
ALTER TABLE "institution_settings" ADD CONSTRAINT "institution_settings_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_settings" ADD CONSTRAINT "institution_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK y fila inicial ─────────────────────

-- Fila única de configuración.
ALTER TABLE "institution_settings"
  ADD CONSTRAINT "institution_settings_single_row" CHECK ("id" = 1),
  ADD CONSTRAINT "institution_settings_name_not_blank" CHECK (length(btrim("name")) > 0);

-- La configuración existe desde el primer arranque (valores que antes estaban fijos en el código).
INSERT INTO "institution_settings" ("id", "name", "short_name", "affiliation", "canton", "updated_at")
VALUES (
  1,
  'Liga Deportiva Cantonal de Quero',
  'Liga de Quero',
  'Afiliada a Federación Deportiva de Tungurahua',
  'Quero - Tungurahua - Ecuador',
  CURRENT_TIMESTAMP
);
