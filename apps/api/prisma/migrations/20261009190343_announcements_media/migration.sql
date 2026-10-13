-- CreateEnum
CREATE TYPE "announcement_kind" AS ENUM ('noticia', 'comunicado');

-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('borrador', 'publicado', 'archivado');

-- CreateEnum
CREATE TYPE "media_visibility" AS ENUM ('publico', 'privado');

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "alt_text" TEXT NOT NULL,
    "visibility" "media_visibility" NOT NULL DEFAULT 'publico',
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" UUID NOT NULL,
    "kind" "announcement_kind" NOT NULL DEFAULT 'noticia',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "announcement_status" NOT NULL DEFAULT 'borrador',
    "published_at" TIMESTAMPTZ(3),
    "author_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "cover_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_file_id_key" ON "media_assets"("file_id");

-- CreateIndex
CREATE INDEX "media_assets_uploaded_by_id_idx" ON "media_assets"("uploaded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "announcements_slug_key" ON "announcements"("slug");

-- CreateIndex
CREATE INDEX "announcements_status_published_at_idx" ON "announcements"("status", "published_at");

-- CreateIndex
CREATE INDEX "announcements_kind_status_idx" ON "announcements"("kind", "status");

-- CreateIndex
CREATE INDEX "announcements_author_id_idx" ON "announcements"("author_id");

-- CreateIndex
CREATE INDEX "announcements_updated_by_id_idx" ON "announcements"("updated_by_id");

-- CreateIndex
CREATE INDEX "announcements_cover_id_idx" ON "announcements"("cover_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_cover_id_fkey" FOREIGN KEY ("cover_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK ─────────────────────

ALTER TABLE "announcements"
  -- Dirección pública estable: minúsculas, números y guiones.
  ADD CONSTRAINT "announcements_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Solo lo publicado tiene fecha de publicación.
  ADD CONSTRAINT "announcements_published_has_date"
  CHECK (("status" = 'publicado') = ("published_at" IS NOT NULL) OR "status" = 'archivado'),
  ADD CONSTRAINT "announcements_title_not_blank" CHECK (length(btrim("title")) > 0),
  ADD CONSTRAINT "announcements_content_not_blank" CHECK (length(btrim("content")) > 0);

ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_alt_text_not_blank" CHECK (length(btrim("alt_text")) > 0);
