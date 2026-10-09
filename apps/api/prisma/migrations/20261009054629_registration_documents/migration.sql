-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('identificacion', 'certificado_medico', 'formulario_inscripcion', 'otro');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_photos" (
    "athlete_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "athlete_photos_pkey" PRIMARY KEY ("athlete_id")
);

-- CreateTable
CREATE TABLE "athlete_documents" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "type" "document_type" NOT NULL,
    "title" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ(3),
    "verified_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "athlete_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_filename_key" ON "stored_files"("filename");

-- CreateIndex
CREATE INDEX "stored_files_created_by_id_idx" ON "stored_files"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_photos_file_id_key" ON "athlete_photos"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_documents_file_id_key" ON "athlete_documents"("file_id");

-- CreateIndex
CREATE INDEX "athlete_documents_athlete_id_idx" ON "athlete_documents"("athlete_id");

-- CreateIndex
CREATE INDEX "athlete_documents_verified_by_id_idx" ON "athlete_documents"("verified_by_id");

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_photos" ADD CONSTRAINT "athlete_photos_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_photos" ADD CONSTRAINT "athlete_photos_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no puede expresar ---------------------------------------

ALTER TABLE "stored_files"
  ADD CONSTRAINT "stored_files_size_chk" CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760);

ALTER TABLE "athlete_documents"
  ADD CONSTRAINT "athlete_documents_title_chk" CHECK (btrim("title") <> ''),
  ADD CONSTRAINT "athlete_documents_verified_chk" CHECK (
    ("verified" = false AND "verified_at" IS NULL AND "verified_by_id" IS NULL)
    OR ("verified" = true AND "verified_at" IS NOT NULL AND "verified_by_id" IS NOT NULL)
  );

