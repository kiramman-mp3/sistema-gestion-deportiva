-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('activo', 'baja');

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "club_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_seasons" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "roster_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "team_seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" UUID NOT NULL,
    "team_season_id" UUID NOT NULL,
    "athlete_id" UUID NOT NULL,
    "sport_id" UUID NOT NULL,
    "season_id" UUID NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'activo',
    "jersey_number" INTEGER,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "leave_reason" TEXT,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_sport_id_idx" ON "teams"("sport_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_club_id_sport_id_name_key_key" ON "teams"("club_id", "sport_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "teams_id_sport_id_key" ON "teams"("id", "sport_id");

-- CreateIndex
CREATE INDEX "team_seasons_season_id_idx" ON "team_seasons"("season_id");

-- CreateIndex
CREATE INDEX "team_seasons_category_id_idx" ON "team_seasons"("category_id");

-- CreateIndex
CREATE INDEX "team_seasons_sport_id_idx" ON "team_seasons"("sport_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_seasons_team_id_season_id_key" ON "team_seasons"("team_id", "season_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_seasons_season_id_sport_id_name_key_key" ON "team_seasons"("season_id", "sport_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "team_seasons_id_sport_id_season_id_key" ON "team_seasons"("id", "sport_id", "season_id");

-- CreateIndex
CREATE INDEX "team_memberships_team_season_id_idx" ON "team_memberships"("team_season_id");

-- CreateIndex
CREATE INDEX "team_memberships_season_id_idx" ON "team_memberships"("season_id");

-- CreateIndex
CREATE INDEX "team_memberships_created_by_id_idx" ON "team_memberships"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_athlete_id_sport_id_season_id_key" ON "team_memberships"("athlete_id", "sport_id", "season_id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_club_id_fkey" FOREIGN KEY ("club_id") REFERENCES "clubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_team_id_sport_id_fkey" FOREIGN KEY ("team_id", "sport_id") REFERENCES "teams"("id", "sport_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_seasons" ADD CONSTRAINT "team_seasons_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_season_id_sport_id_season_id_fkey" FOREIGN KEY ("team_season_id", "sport_id", "season_id") REFERENCES "team_seasons"("id", "sport_id", "season_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reglas que Prisma no puede expresar ---------------------------------------

ALTER TABLE "teams"
  ADD CONSTRAINT "teams_name_chk" CHECK (btrim("name") <> '' AND btrim("name_key") <> '');

ALTER TABLE "team_seasons"
  ADD CONSTRAINT "team_seasons_name_chk" CHECK (btrim("name") <> '' AND btrim("name_key") <> '');

ALTER TABLE "team_memberships"
  ADD CONSTRAINT "team_memberships_jersey_chk" CHECK ("jersey_number" IS NULL OR "jersey_number" BETWEEN 0 AND 999),
  -- Una baja siempre queda con fecha y motivo; un alta vigente no puede tenerlos.
  ADD CONSTRAINT "team_memberships_leave_chk" CHECK (
    ("status" = 'activo' AND "left_at" IS NULL AND "leave_reason" IS NULL)
    OR ("status" = 'baja' AND "left_at" IS NOT NULL AND btrim(coalesce("leave_reason", '')) <> '')
  );

-- Un dorsal no se repite entre los jugadores vigentes de una misma plantilla.
CREATE UNIQUE INDEX "team_memberships_active_jersey_idx"
  ON "team_memberships" ("team_season_id", "jersey_number")
  WHERE "status" = 'activo' AND "jersey_number" IS NOT NULL;
