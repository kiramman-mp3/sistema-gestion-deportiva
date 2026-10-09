-- CreateEnum
CREATE TYPE "championship_format" AS ENUM ('todos_contra_todos', 'eliminatoria_simple', 'fase_grupos_y_eliminatoria', 'sistema_suizo', 'cuadro_combates');

-- CreateEnum
CREATE TYPE "championship_status" AS ENUM ('borrador', 'inscripciones_abiertas', 'inscripciones_cerradas', 'en_curso', 'finalizado', 'archivado');

-- CreateEnum
CREATE TYPE "participant_kind" AS ENUM ('equipo', 'individual');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('borrador', 'pendiente', 'observada', 'aprobada', 'rechazada', 'retirada');

-- CreateEnum
CREATE TYPE "stage_type" AS ENUM ('grupo', 'eliminatoria', 'unico');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('programado', 'en_curso', 'finalizado', 'suspendido', 'postergado', 'cancelado');

-- CreateEnum
CREATE TYPE "participant_side" AS ENUM ('local', 'visitante', 'individual');

-- CreateEnum
CREATE TYPE "result_status" AS ENUM ('borrador', 'pendiente_revision', 'aprobado', 'rechazado', 'anulado');

-- CreateEnum
CREATE TYPE "result_outcome" AS ENUM ('victoria', 'empate', 'derrota', 'no_presentado');

-- CreateEnum
CREATE TYPE "football_event_type" AS ENUM ('gol', 'tarjeta_amarilla', 'tarjeta_roja', 'sustitucion');

-- CreateEnum
CREATE TYPE "chess_color" AS ENUM ('blancas', 'negras');

-- CreateTable
CREATE TABLE "venues" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "capacity" INTEGER,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championships" (
    "id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "format" "championship_format" NOT NULL,
    "status" "championship_status" NOT NULL DEFAULT 'borrador',
    "registration_start" DATE,
    "registration_end" DATE,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "championships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_rule_versions" (
    "id" UUID NOT NULL,
    "championship_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rules_json" JSONB NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "kind" "participant_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_participants" (
    "participant_id" UUID NOT NULL,
    "kind" "participant_kind" NOT NULL DEFAULT 'equipo',
    "team_id" UUID NOT NULL,

    CONSTRAINT "team_participants_pkey" PRIMARY KEY ("participant_id")
);

-- CreateTable
CREATE TABLE "individual_participants" (
    "participant_id" UUID NOT NULL,
    "kind" "participant_kind" NOT NULL DEFAULT 'individual',
    "athlete_id" UUID NOT NULL,

    CONSTRAINT "individual_participants_pkey" PRIMARY KEY ("participant_id")
);

-- CreateTable
CREATE TABLE "registrations" (
    "id" UUID NOT NULL,
    "championship_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'pendiente',
    "notes" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" UUID NOT NULL,
    "championship_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "stage_type" "stage_type" NOT NULL DEFAULT 'grupo',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "venue_id" UUID,
    "scheduled_at" TIMESTAMPTZ(3),
    "actual_start_at" TIMESTAMPTZ(3),
    "actual_end_at" TIMESTAMPTZ(3),
    "status" "event_status" NOT NULL DEFAULT 'programado',
    "postponement_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "registration_id" UUID NOT NULL,
    "side" "participant_side" NOT NULL DEFAULT 'individual',
    "seed" INTEGER,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "status" "result_status" NOT NULL DEFAULT 'borrador',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "approval_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_values" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "event_participant_id" UUID NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "outcome" "result_outcome" NOT NULL DEFAULT 'empate',
    "rank" INTEGER,

    CONSTRAINT "result_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_revisions" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "previous_snapshot" JSONB NOT NULL,
    "new_snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "football_events" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "event_participant_id" UUID NOT NULL,
    "athlete_id" UUID,
    "event_type" "football_event_type" NOT NULL,
    "minute" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "football_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_period_scores" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "event_participant_id" UUID NOT NULL,
    "period_number" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "event_period_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taekwondo_bouts" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "event_participant_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "penalties" INTEGER NOT NULL DEFAULT 0,
    "decision" TEXT,

    CONSTRAINT "taekwondo_bouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chess_pairings" (
    "id" UUID NOT NULL,
    "result_id" UUID NOT NULL,
    "event_participant_id" UUID NOT NULL,
    "color" "chess_color" NOT NULL,
    "points" DECIMAL(3,1) NOT NULL,
    "buchholz" DECIMAL(5,2),

    CONSTRAINT "chess_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "venues_name_key" ON "venues"("name");

-- CreateIndex
CREATE INDEX "championships_season_id_idx" ON "championships"("season_id");

-- CreateIndex
CREATE INDEX "championships_sport_id_idx" ON "championships"("sport_id");

-- CreateIndex
CREATE INDEX "championships_category_id_idx" ON "championships"("category_id");

-- CreateIndex
CREATE INDEX "championships_status_idx" ON "championships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "championships_season_id_sport_id_category_id_name_key" ON "championships"("season_id", "sport_id", "category_id", "name");

-- CreateIndex
CREATE INDEX "competition_rule_versions_approved_by_id_idx" ON "competition_rule_versions"("approved_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_rule_versions_championship_id_version_key" ON "competition_rule_versions"("championship_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "participants_id_kind_key" ON "participants"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "team_participants_team_id_key" ON "team_participants"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_participants_participant_id_kind_key" ON "team_participants"("participant_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "individual_participants_athlete_id_key" ON "individual_participants"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "individual_participants_participant_id_kind_key" ON "individual_participants"("participant_id", "kind");

-- CreateIndex
CREATE INDEX "registrations_participant_id_idx" ON "registrations"("participant_id");

-- CreateIndex
CREATE INDEX "registrations_status_idx" ON "registrations"("status");

-- CreateIndex
CREATE INDEX "registrations_reviewed_by_id_idx" ON "registrations"("reviewed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "registrations_championship_id_participant_id_key" ON "registrations"("championship_id", "participant_id");

-- CreateIndex
CREATE INDEX "stages_championship_id_idx" ON "stages"("championship_id");

-- CreateIndex
CREATE UNIQUE INDEX "stages_championship_id_sequence_key" ON "stages"("championship_id", "sequence");

-- CreateIndex
CREATE INDEX "rounds_stage_id_idx" ON "rounds"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "rounds_stage_id_round_number_key" ON "rounds"("stage_id", "round_number");

-- CreateIndex
CREATE INDEX "events_round_id_idx" ON "events"("round_id");

-- CreateIndex
CREATE INDEX "events_venue_id_scheduled_at_idx" ON "events"("venue_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "events_scheduled_at_idx" ON "events"("scheduled_at");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "event_participants_registration_id_idx" ON "event_participants"("registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_participants_event_id_registration_id_key" ON "event_participants"("event_id", "registration_id");

-- CreateIndex
CREATE UNIQUE INDEX "results_event_id_key" ON "results"("event_id");

-- CreateIndex
CREATE INDEX "results_status_idx" ON "results"("status");

-- CreateIndex
CREATE INDEX "results_submitted_by_id_idx" ON "results"("submitted_by_id");

-- CreateIndex
CREATE INDEX "results_approved_by_id_idx" ON "results"("approved_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_values_result_id_event_participant_id_key" ON "result_values"("result_id", "event_participant_id");

-- CreateIndex
CREATE INDEX "result_revisions_result_id_idx" ON "result_revisions"("result_id");

-- CreateIndex
CREATE INDEX "result_revisions_changed_by_id_idx" ON "result_revisions"("changed_by_id");

-- CreateIndex
CREATE INDEX "football_events_result_id_idx" ON "football_events"("result_id");

-- CreateIndex
CREATE INDEX "football_events_athlete_id_idx" ON "football_events"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_period_scores_result_id_event_participant_id_period_n_key" ON "event_period_scores"("result_id", "event_participant_id", "period_number");

-- CreateIndex
CREATE INDEX "taekwondo_bouts_result_id_idx" ON "taekwondo_bouts"("result_id");

-- CreateIndex
CREATE INDEX "chess_pairings_result_id_idx" ON "chess_pairings"("result_id");

-- AddForeignKey
ALTER TABLE "championships" ADD CONSTRAINT "championships_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championships" ADD CONSTRAINT "championships_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championships" ADD CONSTRAINT "championships_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_rule_versions" ADD CONSTRAINT "competition_rule_versions_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_rule_versions" ADD CONSTRAINT "competition_rule_versions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_participants" ADD CONSTRAINT "team_participants_participant_id_kind_fkey" FOREIGN KEY ("participant_id", "kind") REFERENCES "participants"("id", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_participants" ADD CONSTRAINT "team_participants_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_participants" ADD CONSTRAINT "individual_participants_participant_id_kind_fkey" FOREIGN KEY ("participant_id", "kind") REFERENCES "participants"("id", "kind") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "individual_participants" ADD CONSTRAINT "individual_participants_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_championship_id_fkey" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_revisions" ADD CONSTRAINT "result_revisions_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_revisions" ADD CONSTRAINT "result_revisions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_events" ADD CONSTRAINT "football_events_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_events" ADD CONSTRAINT "football_events_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "football_events" ADD CONSTRAINT "football_events_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_period_scores" ADD CONSTRAINT "event_period_scores_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_period_scores" ADD CONSTRAINT "event_period_scores_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taekwondo_bouts" ADD CONSTRAINT "taekwondo_bouts_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taekwondo_bouts" ADD CONSTRAINT "taekwondo_bouts_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_pairings" ADD CONSTRAINT "chess_pairings_result_id_fkey" FOREIGN KEY ("result_id") REFERENCES "results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chess_pairings" ADD CONSTRAINT "chess_pairings_event_participant_id_fkey" FOREIGN KEY ("event_participant_id") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────────────── Restricciones CHECK ─────────────────────

ALTER TABLE "venues"
  ADD CONSTRAINT "venues_capacity_check"
  CHECK ("capacity" IS NULL OR "capacity" >= 0);

ALTER TABLE "championships"
  ADD CONSTRAINT "championships_dates_check"
  CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date"),
  ADD CONSTRAINT "championships_reg_dates_check"
  CHECK ("registration_end" IS NULL OR "registration_start" IS NULL OR "registration_end" >= "registration_start");

ALTER TABLE "competition_rule_versions"
  ADD CONSTRAINT "rule_versions_version_check"
  CHECK ("version" >= 1);

ALTER TABLE "team_participants"
  ADD CONSTRAINT "team_participants_kind_check"
  CHECK ("kind" = 'equipo');

ALTER TABLE "individual_participants"
  ADD CONSTRAINT "individual_participants_kind_check"
  CHECK ("kind" = 'individual');

ALTER TABLE "stages"
  ADD CONSTRAINT "stages_sequence_check"
  CHECK ("sequence" >= 1);

ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_number_check"
  CHECK ("round_number" >= 1);

ALTER TABLE "events"
  ADD CONSTRAINT "events_actual_dates_check"
  CHECK ("actual_end_at" IS NULL OR "actual_start_at" IS NULL OR "actual_end_at" >= "actual_start_at");

ALTER TABLE "result_values"
  ADD CONSTRAINT "result_values_score_check"
  CHECK ("score" >= 0);

ALTER TABLE "football_events"
  ADD CONSTRAINT "football_events_minute_check"
  CHECK ("minute" >= 0 AND "minute" <= 150);

ALTER TABLE "event_period_scores"
  ADD CONSTRAINT "period_scores_check"
  CHECK ("period_number" >= 1 AND "score" >= 0);

ALTER TABLE "taekwondo_bouts"
  ADD CONSTRAINT "taekwondo_bouts_check"
  CHECK ("round_number" >= 1 AND "points" >= 0 AND "penalties" >= 0);

ALTER TABLE "chess_pairings"
  ADD CONSTRAINT "chess_pairings_points_check"
  CHECK ("points" IN (0.0, 0.5, 1.0));

