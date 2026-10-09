-- AlterEnum
ALTER TYPE "session_revocation_reason" ADD VALUE 'contrasena_cambiada';

-- AlterEnum
ALTER TYPE "user_status" ADD VALUE 'pendiente';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
