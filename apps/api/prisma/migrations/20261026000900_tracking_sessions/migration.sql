ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tracking_identity" UNIQUE ("organizationId", id, "workOrderId", "technicianId");

CREATE TABLE "TrackingSession" (
  id UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "assignmentId" UUID NOT NULL,
  "workOrderId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  "accuracyMeters" DOUBLE PRECISION,
  "recordedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  CONSTRAINT "TrackingSession_pkey" PRIMARY KEY (id),
  CONSTRAINT "TrackingSession_location_consistency" CHECK (
    (latitude IS NULL AND longitude IS NULL AND "accuracyMeters" IS NULL AND "recordedAt" IS NULL AND "receivedAt" IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND "accuracyMeters" IS NOT NULL AND "recordedAt" IS NOT NULL AND "receivedAt" IS NOT NULL)
  ),
  CONSTRAINT "TrackingSession_location_range" CHECK (
    (latitude IS NULL OR latitude BETWEEN -90 AND 90)
    AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
    AND ("accuracyMeters" IS NULL OR "accuracyMeters" BETWEEN 0 AND 10000)
  ),
  CONSTRAINT "TrackingSession_ended_is_redacted" CHECK ("endedAt" IS NULL OR (latitude IS NULL AND longitude IS NULL AND "accuracyMeters" IS NULL AND "recordedAt" IS NULL AND "receivedAt" IS NULL)),
  CONSTRAINT "TrackingSession_expiration_after_consent" CHECK ("expiresAt" > "consentedAt")
);
CREATE UNIQUE INDEX "TrackingSession_organizationId_id_key" ON "TrackingSession"("organizationId",id);
CREATE INDEX "TrackingSession_organizationId_technicianId_endedAt_idx" ON "TrackingSession"("organizationId","technicianId","endedAt");
CREATE INDEX "TrackingSession_organizationId_workOrderId_endedAt_idx" ON "TrackingSession"("organizationId","workOrderId","endedAt");
CREATE INDEX "TrackingSession_expiresAt_endedAt_idx" ON "TrackingSession"("expiresAt","endedAt");
CREATE UNIQUE INDEX "TrackingSession_one_active_per_technician" ON "TrackingSession"("organizationId","technicianId") WHERE "endedAt" IS NULL;
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_assignment_fkey" FOREIGN KEY ("organizationId","assignmentId","workOrderId","technicianId") REFERENCES "Assignment"("organizationId",id,"workOrderId","technicianId") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_workOrder_fkey" FOREIGN KEY ("organizationId","workOrderId") REFERENCES "WorkOrder"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_technician_fkey" FOREIGN KEY ("organizationId","technicianId") REFERENCES "TechnicianProfile"("organizationId",id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrackingSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TrackingSession" TO fieldops_app USING (public.fieldops_can_access("organizationId")) WITH CHECK (public.fieldops_can_access("organizationId"));
GRANT SELECT,INSERT,UPDATE ON "TrackingSession" TO fieldops_app;

-- Guard non-HTTP assignment/member mutations by clearing sensitive coordinates at the database boundary.
CREATE FUNCTION public.fieldops_tracking_assignment_end() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='ACTIVE' AND NEW.status<>'ACTIVE' THEN
    UPDATE public."TrackingSession" SET "endedAt"=COALESCE("endedAt",CURRENT_TIMESTAMP),
      latitude=NULL,longitude=NULL,"accuracyMeters"=NULL,"recordedAt"=NULL,"receivedAt"=NULL
    WHERE "organizationId"=NEW."organizationId" AND "assignmentId"=NEW.id AND "endedAt" IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_assignment_end() FROM PUBLIC;
CREATE TRIGGER "TrackingSession_assignment_end" AFTER UPDATE OF status ON "Assignment" FOR EACH ROW EXECUTE FUNCTION public.fieldops_tracking_assignment_end();

CREATE FUNCTION public.fieldops_tracking_membership_end() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.status<>'ACTIVE' OR NEW."roleId" IS DISTINCT FROM OLD."roleId" THEN
    UPDATE public."TrackingSession" s SET "endedAt"=COALESCE(s."endedAt",CURRENT_TIMESTAMP),
      latitude=NULL,longitude=NULL,"accuracyMeters"=NULL,"recordedAt"=NULL,"receivedAt"=NULL
    FROM public."TechnicianProfile" t WHERE t."organizationId"=s."organizationId" AND t.id=s."technicianId"
      AND t."membershipId"=NEW.id AND s."organizationId"=NEW."organizationId" AND s."endedAt" IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_membership_end() FROM PUBLIC;
CREATE TRIGGER "TrackingSession_membership_end" AFTER UPDATE OF status, "roleId" ON "Membership" FOR EACH ROW EXECUTE FUNCTION public.fieldops_tracking_membership_end();

CREATE FUNCTION public.fieldops_tracking_user_end() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF NOT NEW."isActive" THEN
    UPDATE public."TrackingSession" s SET "endedAt"=COALESCE(s."endedAt",CURRENT_TIMESTAMP),
      latitude=NULL,longitude=NULL,"accuracyMeters"=NULL,"recordedAt"=NULL,"receivedAt"=NULL
    FROM public."TechnicianProfile" t JOIN public."Membership" m ON m.id=t."membershipId"
    WHERE t."organizationId"=s."organizationId" AND t.id=s."technicianId"
      AND m."userId"=NEW.id AND s."endedAt" IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_user_end() FROM PUBLIC;
CREATE TRIGGER "TrackingSession_user_end" AFTER UPDATE OF "isActive" ON "User" FOR EACH ROW EXECUTE FUNCTION public.fieldops_tracking_user_end();
