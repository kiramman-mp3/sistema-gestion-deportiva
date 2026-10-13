-- Vínculos con Quero del deportista (nacimiento, matrimonio, padre o madre).
-- CreateEnum
CREATE TYPE "quero_link_kind" AS ENUM ('nacimiento', 'matrimonio', 'padre', 'madre');

-- CreateEnum
CREATE TYPE "origin_link_source" AS ENUM ('manual', 'registro_civil');

-- CreateTable
CREATE TABLE "athlete_origin_links" (
    "id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "kind" "quero_link_kind" NOT NULL,
    "related_name" TEXT,
    "related_id_number" TEXT,
    "birth_place" TEXT,
    "source" "origin_link_source" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "athlete_origin_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "athlete_origin_links_athlete_id_kind_key" ON "athlete_origin_links"("athlete_id", "kind");

-- AddForeignKey
ALTER TABLE "athlete_origin_links" ADD CONSTRAINT "athlete_origin_links_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
