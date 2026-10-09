-- CreateEnum
CREATE TYPE "official_status" AS ENUM ('activo', 'inactivo', 'suspendido');

-- CreateEnum
CREATE TYPE "assignment_role" AS ENUM ('arbitro_central', 'asistente_1', 'asistente_2', 'cuarto_arbitro', 'juez_mesa', 'cronometrista', 'anotador', 'juez_taekwondo', 'arbitro_ajedrez', 'comisario');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('designado', 'confirmado', 'rechazado');

-- CreateTable
CREATE TABLE "officials" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "user_id" UUID,
    "club_id" UUID,
    "status" "official_status" NOT NULL DEFAULT 'activo',
    "license_number" TEXT,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "officials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "official_sports" (
    "official_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,

    CONSTRAINT "official_sports_pkey" PRIMARY KEY ("official_id","sport_id")
);

-- CreateTable
CREATE TABLE "official_unavailabilities" (
    "id" UUID NOT NULL,
    "official_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "official_unavailabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_assignments" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "official_id" UUID NOT NULL,
    "role" "assignment_role" NOT NULL,
    "status" "assignment_status" NOT NULL DEFAULT 'designado',
    "notes" TEXT,
    "response_note" TEXT,
    "responded_at" TIMESTAMPTZ(3),
    "assigned_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "officials_person_id_key" ON "officials"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "officials_user_id_key" ON "officials"("user_id");

-- CreateIndex
CREATE INDEX "officials_club_id_idx" ON "officials"("club_id");

-- CreateIndex
CREATE INDEX "officials_status_idx" ON "officials"("status");

-- CreateIndex
CREATE INDEX "official_sports_sport_id_idx" ON "official_sports"("sport_id");

-- CreateIndex
CREATE INDEX "official_unavailabilities_official_id_starts_at_ends_at_idx" ON "official_unavailabilities"("official_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "event_assignments_official_id_idx" ON "event_assignments"("official_id");

-- CreateIndex
CREATE INDEX "event_assignments_assigned_by_id_idx" ON "event_assignments"("assigned_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_assignments_event_id_official_id_key" ON "event_assignments"("event_id", "official_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_assignments_event_id_role_key" ON "event_assignments"("event_id", "role");

-- AddForeignKey
ALTER TABLE "officials" ADD CONSTRAINT "officials_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officials" ADD CONSTRAINT "officials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "officials" ADD CONSTRAINT "officials_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_sports" ADD CONSTRAINT "official_sports_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "officials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_sports" ADD CONSTRAINT "official_sports_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_unavailabilities" ADD CONSTRAINT "official_unavailabilities_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "officials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "officials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK ─────────────────────

ALTER TABLE "official_unavailabilities"
  ADD CONSTRAINT "official_unavailabilities_range" CHECK ("ends_at" > "starts_at");

-- Una designación respondida (confirmada o rechazada) tiene fecha de respuesta.
ALTER TABLE "event_assignments"
  ADD CONSTRAINT "event_assignments_response_consistent"
  CHECK ("status" = 'designado' OR "responded_at" IS NOT NULL);
