-- Stage 6B. Preserve existing schedules and historical assignments.
-- All application timestamps are UTC instants; Prisma stores TIMESTAMP(3).
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TYPE "TechnicianAvailabilityStatus" AS ENUM ('AVAILABLE','UNAVAILABLE','OFF_DUTY');

ALTER TABLE "TechnicianProfile" ADD COLUMN "timeZone" VARCHAR(64) NOT NULL DEFAULT 'UTC';
ALTER TABLE "WorkOrder" ADD COLUMN "plannedEndAt" TIMESTAMP(3), ADD COLUMN "estimatedDurationMinutes" INTEGER;
ALTER TABLE "Assignment" ADD COLUMN "windowStartAt" TIMESTAMP(3), ADD COLUMN "windowEndAt" TIMESTAMP(3);

ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_schedule_consistent"
  CHECK (
    ("scheduledAt" IS NULL AND "plannedEndAt" IS NULL AND "estimatedDurationMinutes" IS NULL)
    OR ("scheduledAt" IS NOT NULL AND "plannedEndAt" IS NULL AND "estimatedDurationMinutes" IS NULL)
    OR ("scheduledAt" IS NOT NULL AND "plannedEndAt" > "scheduledAt"
        AND "estimatedDurationMinutes" BETWEEN 15 AND 720
        AND "plannedEndAt" = "scheduledAt" + ("estimatedDurationMinutes" * interval '1 minute'))
  );
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_window_consistent" CHECK (
  ("windowStartAt" IS NULL AND "windowEndAt" IS NULL)
  OR ("windowStartAt" IS NOT NULL AND "windowEndAt" > "windowStartAt")
);

CREATE TABLE "TechnicianAvailability" (
  id UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  status "TechnicianAvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
  "weeklyHours" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicianAvailability_pkey" PRIMARY KEY (id),
  CONSTRAINT "TechnicianAvailability_organizationId_technicianId_key" UNIQUE ("organizationId","technicianId"),
  CONSTRAINT "TechnicianAvailability_technicianId_key" UNIQUE ("technicianId"),
  CONSTRAINT "TechnicianAvailability_weekly_array" CHECK (jsonb_typeof("weeklyHours")='array')
);
CREATE INDEX "TechnicianAvailability_organizationId_status_idx" ON "TechnicianAvailability"("organizationId",status);

CREATE TABLE "TechnicianTimeOff" (
  id UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  reason VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TechnicianTimeOff_pkey" PRIMARY KEY(id),
  CONSTRAINT "TechnicianTimeOff_organizationId_id_key" UNIQUE ("organizationId",id),
  CONSTRAINT "TechnicianTimeOff_valid_window" CHECK ("endAt" > "startAt")
);
CREATE INDEX "TechnicianTimeOff_organizationId_technicianId_startAt_endAt_idx"
  ON "TechnicianTimeOff"("organizationId","technicianId","startAt","endAt");

CREATE TABLE "Skill" (
  id UUID NOT NULL, "organizationId" UUID NOT NULL,
  name VARCHAR(80) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Skill_pkey" PRIMARY KEY(id),
  CONSTRAINT "Skill_organizationId_id_key" UNIQUE("organizationId",id),
  CONSTRAINT "Skill_organizationId_name_key" UNIQUE("organizationId",name)
);
CREATE TABLE "TechnicianSkill" (
  "organizationId" UUID NOT NULL, "technicianId" UUID NOT NULL, "skillId" UUID NOT NULL,
  CONSTRAINT "TechnicianSkill_pkey" PRIMARY KEY ("organizationId","technicianId","skillId")
);
CREATE INDEX "TechnicianSkill_organizationId_skillId_idx" ON "TechnicianSkill"("organizationId","skillId");

CREATE TABLE "WorkOrderSkill" (
  "organizationId" UUID NOT NULL, "workOrderId" UUID NOT NULL, "skillId" UUID NOT NULL,
  CONSTRAINT "WorkOrderSkill_pkey" PRIMARY KEY ("organizationId","workOrderId","skillId")
);
CREATE INDEX "WorkOrderSkill_organizationId_skillId_idx" ON "WorkOrderSkill"("organizationId","skillId");

ALTER TABLE "TechnicianAvailability" ADD CONSTRAINT "TechnicianAvailability_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianAvailability" ADD CONSTRAINT "TechnicianAvailability_organizationId_technicianId_fkey" FOREIGN KEY("organizationId","technicianId") REFERENCES "TechnicianProfile"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianTimeOff" ADD CONSTRAINT "TechnicianTimeOff_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianTimeOff" ADD CONSTRAINT "TechnicianTimeOff_organizationId_technicianId_fkey" FOREIGN KEY("organizationId","technicianId") REFERENCES "TechnicianProfile"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianSkill" ADD CONSTRAINT "TechnicianSkill_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianSkill" ADD CONSTRAINT "TechnicianSkill_organizationId_technicianId_fkey" FOREIGN KEY("organizationId","technicianId") REFERENCES "TechnicianProfile"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TechnicianSkill" ADD CONSTRAINT "TechnicianSkill_organizationId_skillId_fkey" FOREIGN KEY("organizationId","skillId") REFERENCES "Skill"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSkill" ADD CONSTRAINT "WorkOrderSkill_organizationId_fkey" FOREIGN KEY("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSkill" ADD CONSTRAINT "WorkOrderSkill_organizationId_workOrderId_fkey" FOREIGN KEY("organizationId","workOrderId") REFERENCES "WorkOrder"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderSkill" ADD CONSTRAINT "WorkOrderSkill_organizationId_skillId_fkey" FOREIGN KEY("organizationId","skillId") REFERENCES "Skill"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['TechnicianAvailability','TechnicianTimeOff','Skill','TechnicianSkill','WorkOrderSkill'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO fieldops_app USING (public.fieldops_can_access("organizationId")) WITH CHECK (public.fieldops_can_access("organizationId"))',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO fieldops_app',t);
  END LOOP;
END $$;

CREATE INDEX "WorkOrder_organizationId_scheduledAt_plannedEndAt_idx" ON "WorkOrder"("organizationId","scheduledAt","plannedEndAt");
CREATE INDEX "Assignment_organizationId_technicianId_windowStartAt_idx"
  ON "Assignment"("organizationId","technicianId","windowStartAt");

-- Populate assignment reservation windows from work orders atomically,
-- regardless of whether assignment is created via REST or another app path.
CREATE FUNCTION public.fieldops_assignment_window() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE start_time timestamp(3); finish_time timestamp(3);
BEGIN
  IF TG_OP='INSERT' OR NEW."workOrderId" IS DISTINCT FROM OLD."workOrderId" THEN
    SELECT "scheduledAt","plannedEndAt" INTO start_time,finish_time
      FROM public."WorkOrder"
      WHERE id=NEW."workOrderId" AND "organizationId"=NEW."organizationId";
    IF NOT FOUND THEN RAISE EXCEPTION 'Work order does not belong to organization'; END IF;
    IF finish_time IS NOT NULL THEN
      NEW."windowStartAt":=start_time; NEW."windowEndAt":=finish_time;
    ELSE
      NEW."windowStartAt":=NULL; NEW."windowEndAt":=NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_assignment_window() FROM PUBLIC;
CREATE TRIGGER "Assignment_reservation_window" BEFORE INSERT OR UPDATE OF "workOrderId" ON "Assignment"
FOR EACH ROW EXECUTE FUNCTION public.fieldops_assignment_window();

CREATE FUNCTION public.fieldops_workorder_reschedule() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE public."Assignment" a SET
    "windowStartAt"=CASE WHEN NEW."plannedEndAt" IS NOT NULL THEN NEW."scheduledAt" ELSE NULL END,
    "windowEndAt"=NEW."plannedEndAt"
  WHERE a."organizationId"=NEW."organizationId" AND a."workOrderId"=NEW.id AND a.status='ACTIVE';
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_workorder_reschedule() FROM PUBLIC;
CREATE TRIGGER "WorkOrder_reservation_window" AFTER UPDATE OF "scheduledAt","plannedEndAt" ON "WorkOrder"
FOR EACH ROW EXECUTE FUNCTION public.fieldops_workorder_reschedule();

-- Existing old work orders with no complete range remain unscheduled and can be
-- upgraded explicitly via PATCH /schedule; no destructive historical backfill.
UPDATE "Assignment" a SET
  "windowStartAt"=o."scheduledAt", "windowEndAt"=o."plannedEndAt"
FROM "WorkOrder" o
WHERE a."organizationId"=o."organizationId" AND a."workOrderId"=o.id
  AND a.status='ACTIVE' AND o."plannedEndAt" IS NOT NULL;

-- PostgreSQL GiST exclusion is authoritative even under concurrent inserts,
-- updates or independent NestJS replicas. Half-open [start,end) permits back-to-back.
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_no_overlapping_windows"
 EXCLUDE USING gist (
  "organizationId" WITH =,
  "technicianId" WITH =,
  tsrange("windowStartAt","windowEndAt",'[)') WITH &&
 ) WHERE (status='ACTIVE' AND "windowStartAt" IS NOT NULL);
