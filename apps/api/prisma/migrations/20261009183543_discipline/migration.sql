-- CreateEnum
CREATE TYPE "incident_type" AS ENUM ('agresion_fisica', 'agresion_verbal', 'conducta_antideportiva', 'invasion_campo', 'alineacion_indebida', 'no_presentacion', 'otro');

-- CreateEnum
CREATE TYPE "complaint_status" AS ENUM ('recibido', 'en_revision', 'resuelto', 'desestimado');

-- CreateEnum
CREATE TYPE "case_status" AS ENUM ('abierto', 'en_revision', 'resuelto', 'archivado');

-- CreateEnum
CREATE TYPE "case_entry_kind" AS ENUM ('apertura', 'nota', 'asignacion', 'recurso', 'notificacion', 'decision', 'reapertura', 'publicacion', 'archivo');

-- CreateEnum
CREATE TYPE "sanction_type" AS ENUM ('amonestacion', 'suspension_partidos', 'suspension_temporal', 'descuento_puntos', 'descalificacion', 'multa');

-- CreateEnum
CREATE TYPE "sanction_status" AS ENUM ('vigente', 'cumplida', 'anulada');

-- CreateTable
CREATE TABLE "event_incidents" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "athlete_id" UUID,
    "club_id" UUID,
    "type" "incident_type" NOT NULL,
    "description" TEXT NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "case_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "championship_id" UUID NOT NULL,
    "event_id" UUID,
    "club_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "complaint_status" NOT NULL DEFAULT 'recibido',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "dismiss_reason" TEXT,
    "case_id" UUID,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaint_attachments" (
    "id" UUID NOT NULL,
    "complaint_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinary_cases" (
    "id" UUID NOT NULL,
    "case_number" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "championship_id" UUID,
    "event_id" UUID,
    "club_id" UUID,
    "status" "case_status" NOT NULL DEFAULT 'abierto',
    "reviewer_id" UUID,
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolution" TEXT,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "public_title" TEXT,
    "public_summary" TEXT,
    "published_at" TIMESTAMPTZ(3),
    "published_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "disciplinary_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_entries" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "kind" "case_entry_kind" NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanctions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "athlete_id" UUID,
    "team_id" UUID,
    "club_id" UUID,
    "championship_id" UUID,
    "type" "sanction_type" NOT NULL,
    "reason" TEXT NOT NULL,
    "starts_at" DATE NOT NULL,
    "ends_at" DATE,
    "matches_count" INTEGER,
    "points" INTEGER,
    "status" "sanction_status" NOT NULL DEFAULT 'vigente',
    "status_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_incidents_event_id_idx" ON "event_incidents"("event_id");

-- CreateIndex
CREATE INDEX "event_incidents_athlete_id_idx" ON "event_incidents"("athlete_id");

-- CreateIndex
CREATE INDEX "event_incidents_club_id_idx" ON "event_incidents"("club_id");

-- CreateIndex
CREATE INDEX "event_incidents_reported_by_id_idx" ON "event_incidents"("reported_by_id");

-- CreateIndex
CREATE INDEX "event_incidents_case_id_idx" ON "event_incidents"("case_id");

-- CreateIndex
CREATE INDEX "complaints_championship_id_idx" ON "complaints"("championship_id");

-- CreateIndex
CREATE INDEX "complaints_event_id_idx" ON "complaints"("event_id");

-- CreateIndex
CREATE INDEX "complaints_club_id_status_idx" ON "complaints"("club_id", "status");

-- CreateIndex
CREATE INDEX "complaints_submitted_by_id_idx" ON "complaints"("submitted_by_id");

-- CreateIndex
CREATE INDEX "complaints_case_id_idx" ON "complaints"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "complaint_attachments_file_id_key" ON "complaint_attachments"("file_id");

-- CreateIndex
CREATE INDEX "complaint_attachments_complaint_id_idx" ON "complaint_attachments"("complaint_id");

-- CreateIndex
CREATE UNIQUE INDEX "disciplinary_cases_case_number_key" ON "disciplinary_cases"("case_number");

-- CreateIndex
CREATE INDEX "disciplinary_cases_status_opened_at_idx" ON "disciplinary_cases"("status", "opened_at");

-- CreateIndex
CREATE INDEX "disciplinary_cases_reviewer_id_idx" ON "disciplinary_cases"("reviewer_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_championship_id_idx" ON "disciplinary_cases"("championship_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_event_id_idx" ON "disciplinary_cases"("event_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_club_id_idx" ON "disciplinary_cases"("club_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_published_at_idx" ON "disciplinary_cases"("published_at");

-- CreateIndex
CREATE INDEX "disciplinary_cases_opened_by_id_idx" ON "disciplinary_cases"("opened_by_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_resolved_by_id_idx" ON "disciplinary_cases"("resolved_by_id");

-- CreateIndex
CREATE INDEX "disciplinary_cases_published_by_id_idx" ON "disciplinary_cases"("published_by_id");

-- CreateIndex
CREATE INDEX "case_entries_case_id_created_at_idx" ON "case_entries"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "case_entries_author_id_idx" ON "case_entries"("author_id");

-- CreateIndex
CREATE INDEX "sanctions_case_id_idx" ON "sanctions"("case_id");

-- CreateIndex
CREATE INDEX "sanctions_athlete_id_status_idx" ON "sanctions"("athlete_id", "status");

-- CreateIndex
CREATE INDEX "sanctions_team_id_status_idx" ON "sanctions"("team_id", "status");

-- CreateIndex
CREATE INDEX "sanctions_club_id_status_idx" ON "sanctions"("club_id", "status");

-- CreateIndex
CREATE INDEX "sanctions_championship_id_idx" ON "sanctions"("championship_id");

-- CreateIndex
CREATE INDEX "sanctions_created_by_id_idx" ON "sanctions"("created_by_id");

-- AddForeignKey
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_incidents" ADD CONSTRAINT "event_incidents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disciplinary_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disciplinary_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaint_attachments" ADD CONSTRAINT "complaint_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinary_cases" ADD CONSTRAINT "disciplinary_cases_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_entries" ADD CONSTRAINT "case_entries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disciplinary_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_entries" ADD CONSTRAINT "case_entries_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "disciplinary_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanctions" ADD CONSTRAINT "sanctions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK y triggers ─────────────────────

-- Un reclamo resuelto o desestimado tiene fecha de resolución; uno desestimado, su motivo.
ALTER TABLE "complaints"
  ADD CONSTRAINT "complaints_resolution_consistent"
  CHECK (
    ("status" IN ('recibido', 'en_revision') AND "resolved_at" IS NULL)
    OR ("status" IN ('resuelto', 'desestimado') AND "resolved_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "complaints_dismissed_has_reason"
  CHECK ("status" <> 'desestimado' OR "dismiss_reason" IS NOT NULL);

-- Un expediente resuelto documenta quién y cuándo decidió, y con qué resolución.
ALTER TABLE "disciplinary_cases"
  ADD CONSTRAINT "disciplinary_cases_resolution_documented"
  CHECK (
    "status" <> 'resuelto'
    OR ("resolution" IS NOT NULL AND "resolved_by_id" IS NOT NULL AND "resolved_at" IS NOT NULL)
  ),
  -- Solo se publica lo resuelto, con título y resumen redactados para el portal.
  ADD CONSTRAINT "disciplinary_cases_publication_consistent"
  CHECK (
    "published_at" IS NULL
    OR ("status" = 'resuelto' AND "public_title" IS NOT NULL AND "public_summary" IS NOT NULL AND "published_by_id" IS NOT NULL)
  );

-- Coherencia de la sanción: sujeto, alcance, vigencia y datos propios de cada tipo.
ALTER TABLE "sanctions"
  ADD CONSTRAINT "sanctions_has_subject"
  CHECK (num_nonnulls("athlete_id", "team_id", "club_id") >= 1),
  ADD CONSTRAINT "sanctions_period_valid"
  CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
  ADD CONSTRAINT "sanctions_matches_count_valid"
  CHECK (
    ("type" = 'suspension_partidos' AND "matches_count" IS NOT NULL AND "matches_count" >= 1)
    OR ("type" <> 'suspension_partidos' AND "matches_count" IS NULL)
  ),
  ADD CONSTRAINT "sanctions_temporal_has_end"
  CHECK ("type" <> 'suspension_temporal' OR "ends_at" IS NOT NULL),
  ADD CONSTRAINT "sanctions_points_valid"
  CHECK (
    ("type" = 'descuento_puntos' AND "points" IS NOT NULL AND "points" >= 1 AND "team_id" IS NOT NULL AND "championship_id" IS NOT NULL)
    OR ("type" <> 'descuento_puntos' AND "points" IS NULL)
  ),
  ADD CONSTRAINT "sanctions_status_reason"
  CHECK ("status" <> 'anulada' OR "status_reason" IS NOT NULL);

-- El historial de un expediente es de solo anexar.
CREATE OR REPLACE FUNCTION "case_entries_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Las entradas del expediente no se pueden modificar ni borrar'
    USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "case_entries_no_update_delete"
  BEFORE UPDATE OR DELETE ON "case_entries"
  FOR EACH ROW EXECUTE FUNCTION "case_entries_immutable"();

-- Las incidencias reportadas tampoco se editan: solo se pueden vincular a un expediente.
CREATE OR REPLACE FUNCTION "event_incidents_immutable"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Las incidencias no se pueden borrar' USING ERRCODE = '23001';
  END IF;
  IF NEW."event_id" IS DISTINCT FROM OLD."event_id"
     OR NEW."athlete_id" IS DISTINCT FROM OLD."athlete_id"
     OR NEW."club_id" IS DISTINCT FROM OLD."club_id"
     OR NEW."type" IS DISTINCT FROM OLD."type"
     OR NEW."description" IS DISTINCT FROM OLD."description"
     OR NEW."reported_by_id" IS DISTINCT FROM OLD."reported_by_id" THEN
    RAISE EXCEPTION 'Las incidencias no se pueden modificar' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "event_incidents_guard"
  BEFORE UPDATE OR DELETE ON "event_incidents"
  FOR EACH ROW EXECUTE FUNCTION "event_incidents_immutable"();
