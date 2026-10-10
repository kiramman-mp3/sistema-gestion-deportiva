-- AlterTable
ALTER TABLE "institution_settings" ADD COLUMN     "cover_file_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "institution_settings_cover_file_id_key" ON "institution_settings"("cover_file_id");

-- AddForeignKey
ALTER TABLE "institution_settings" ADD CONSTRAINT "institution_settings_cover_file_id_fkey" FOREIGN KEY ("cover_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
