-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('activo', 'inactivo', 'bloqueado');

-- CreateEnum
CREATE TYPE "catalog_status" AS ENUM ('activo', 'inactivo');

-- CreateEnum
CREATE TYPE "season_status" AS ENUM ('borrador', 'activa', 'finalizada', 'archivada');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'activo',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "reason" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sports" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age_min" INTEGER,
    "age_max" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "catalog_status" NOT NULL DEFAULT 'activo',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seasons" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "season_status" NOT NULL DEFAULT 'borrador',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_granted_by_id_idx" ON "user_roles"("granted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_key" ON "user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sports_code_key" ON "sports"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sports_name_key" ON "sports"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "seasons_name_key" ON "seasons"("name");

-- CreateIndex
CREATE INDEX "seasons_status_idx" ON "seasons"("status");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Restricciones que Prisma no puede expresar en schema.prisma.
-- Forman parte de esta migración y se versionan con ella.
-- ─────────────────────────────────────────────────────────────────────

-- Usuarios: correo normalizado y campos no vacíos
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase_chk" CHECK ("email" = lower("email") AND btrim("email") <> ''),
  ADD CONSTRAINT "users_display_name_chk" CHECK (btrim("display_name") <> ''),
  ADD CONSTRAINT "users_password_hash_chk" CHECK ("password_hash" <> '');

-- Roles y permisos: códigos estables con formato controlado
ALTER TABLE "roles"
  ADD CONSTRAINT "roles_code_format_chk" CHECK ("code" ~ '^[a-z][a-z0-9_]*$'),
  ADD CONSTRAINT "roles_name_chk" CHECK (btrim("name") <> '');

ALTER TABLE "permissions"
  ADD CONSTRAINT "permissions_code_format_chk" CHECK ("code" ~ '^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$');

-- Los roles de sistema no se pueden eliminar, ni siquiera por SQL directo
CREATE FUNCTION "prevent_system_role_delete"() RETURNS trigger AS $$
BEGIN
  IF OLD."is_system" THEN
    RAISE EXCEPTION 'No se puede eliminar el rol de sistema %', OLD."code"
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "roles_prevent_system_delete"
  BEFORE DELETE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION "prevent_system_role_delete"();

-- Auditoría: registros inmutables (sin UPDATE ni DELETE) y campos obligatorios
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_chk" CHECK (btrim("action") <> ''),
  ADD CONSTRAINT "audit_logs_entity_type_chk" CHECK (btrim("entity_type") <> '');

CREATE FUNCTION "audit_logs_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los registros de auditoría son inmutables (% no permitido)', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_immutable"();

-- Catálogos: códigos con formato controlado y nombres no vacíos
ALTER TABLE "sports"
  ADD CONSTRAINT "sports_code_format_chk" CHECK ("code" ~ '^[a-z][a-z0-9_]*$'),
  ADD CONSTRAINT "sports_name_chk" CHECK (btrim("name") <> '');

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_code_format_chk" CHECK ("code" ~ '^[a-z][a-z0-9_]*$'),
  ADD CONSTRAINT "categories_name_chk" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "categories_age_range_chk" CHECK (
    ("age_min" IS NULL OR "age_min" >= 0)
    AND ("age_max" IS NULL OR "age_max" <= 120)
    AND ("age_min" IS NULL OR "age_max" IS NULL OR "age_min" <= "age_max")
  );

-- Temporadas: fechas coherentes
ALTER TABLE "seasons"
  ADD CONSTRAINT "seasons_name_chk" CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "seasons_dates_chk" CHECK ("end_date" > "start_date");
