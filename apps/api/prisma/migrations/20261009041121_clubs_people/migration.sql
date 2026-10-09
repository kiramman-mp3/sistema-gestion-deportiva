-- CreateEnum
CREATE TYPE "club_status" AS ENUM ('activo', 'inactivo', 'suspendido', 'archivado');

-- CreateEnum
CREATE TYPE "person_status" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "id_type" AS ENUM ('cedula', 'pasaporte', 'otro');

-- CreateEnum
CREATE TYPE "athlete_eligibility" AS ENUM ('pendiente', 'habilitado', 'inhabilitado');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('publicacion_perfil', 'publicacion_foto', 'tratamiento_datos');

-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('otorgado', 'revocado');

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_name" TEXT,
    "code" TEXT,
    "sector" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "club_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_users" (
    "club_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID,

    CONSTRAINT "club_users_pkey" PRIMARY KEY ("club_id","user_id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE,
    "status" "person_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_private_data" (
    "person_id" UUID NOT NULL,
    "id_type" "id_type",
    "id_number" TEXT,
    "id_key" TEXT,
    "phone" TEXT,
    "guardian_name" TEXT,
    "guardian_relation" TEXT,
    "guardian_phone" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "person_private_data_pkey" PRIMARY KEY ("person_id")
);

-- CreateTable
CREATE TABLE "club_representatives" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "role_name" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "club_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athletes" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "code_number" SERIAL NOT NULL,
    "eligibility" "athlete_eligibility" NOT NULL DEFAULT 'pendiente',
    "public_profile" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "athletes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "status" "consent_status" NOT NULL DEFAULT 'otorgado',
    "purpose" TEXT,
    "granted_by_name" TEXT NOT NULL,
    "granted_by_relation" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" TEXT,
    "recorded_by_id" UUID NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_name_key_key" ON "clubs"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_slug_key" ON "clubs"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_code_key" ON "clubs"("code");

-- CreateIndex
CREATE INDEX "club_users_user_id_idx" ON "club_users"("user_id");

-- CreateIndex
CREATE INDEX "club_users_created_by_id_idx" ON "club_users"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_private_data_id_key_key" ON "person_private_data"("id_key");

-- CreateIndex
CREATE INDEX "club_representatives_club_id_valid_until_idx" ON "club_representatives"("club_id", "valid_until");

-- CreateIndex
CREATE INDEX "club_representatives_person_id_idx" ON "club_representatives"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_person_id_key" ON "athletes"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "athletes_code_number_key" ON "athletes"("code_number");

-- CreateIndex
CREATE INDEX "athletes_club_id_idx" ON "athletes"("club_id");

-- CreateIndex
CREATE INDEX "consent_records_person_id_type_status_idx" ON "consent_records"("person_id", "type", "status");

-- CreateIndex
CREATE INDEX "consent_records_recorded_by_id_idx" ON "consent_records"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "club_users" ADD CONSTRAINT "club_users_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_users" ADD CONSTRAINT "club_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_users" ADD CONSTRAINT "club_users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_private_data" ADD CONSTRAINT "person_private_data_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_representatives" ADD CONSTRAINT "club_representatives_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_representatives" ADD CONSTRAINT "club_representatives_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no puede expresar
ALTER TABLE "clubs"
  ADD CONSTRAINT "clubs_name_chk" CHECK (btrim("name") <> '' AND btrim("name_key") <> ''),
  ADD CONSTRAINT "clubs_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  ADD CONSTRAINT "clubs_code_chk" CHECK ("code" IS NULL OR btrim("code") <> '');

ALTER TABLE "persons"
  ADD CONSTRAINT "persons_names_chk" CHECK (btrim("first_name") <> '' AND btrim("last_name") <> ''),
  -- La fecha futura se rechaza en el servicio: un CHECK con CURRENT_DATE no es inmutable y rompe restauraciones.
  ADD CONSTRAINT "persons_birth_date_chk" CHECK ("birth_date" IS NULL OR "birth_date" >= DATE '1900-01-01');

ALTER TABLE "person_private_data"
  ADD CONSTRAINT "person_private_data_id_consistent_chk" CHECK (
    ("id_type" IS NULL) = ("id_number" IS NULL) AND ("id_number" IS NULL) = ("id_key" IS NULL)
  ),
  ADD CONSTRAINT "person_private_data_id_number_chk" CHECK ("id_number" IS NULL OR btrim("id_number") <> '');

ALTER TABLE "club_representatives"
  ADD CONSTRAINT "club_representatives_role_chk" CHECK (btrim("role_name") <> ''),
  ADD CONSTRAINT "club_representatives_period_chk" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from");

ALTER TABLE "consent_records"
  ADD CONSTRAINT "consent_records_granted_by_chk" CHECK (btrim("granted_by_name") <> '' AND btrim("granted_by_relation") <> ''),
  -- Un consentimiento revocado siempre registra cuándo, y solo él
  ADD CONSTRAINT "consent_records_revocation_chk" CHECK (("status" = 'revocado') = ("revoked_at" IS NOT NULL)),
  ADD CONSTRAINT "consent_records_expiry_chk" CHECK ("expires_at" IS NULL OR "expires_at" > "recorded_at");

-- A lo sumo un consentimiento vigente por persona y tipo (el historial se conserva revocado)
CREATE UNIQUE INDEX "consent_records_one_active_idx" ON "consent_records" ("person_id", "type") WHERE "status" = 'otorgado';
