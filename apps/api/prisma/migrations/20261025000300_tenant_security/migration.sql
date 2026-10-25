-- Application queries must SET LOCAL ROLE inside a transaction.
-- Use a separate owner/migration connection, never expose its client to request handlers.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldops_app') THEN
    CREATE ROLE fieldops_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fieldops_app' AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'fieldops_app must not bypass RLS';
  END IF;
  EXECUTE format('GRANT fieldops_app TO %I', current_user);
END $$;
GRANT USAGE ON SCHEMA public TO fieldops_app;

-- Owner-only helper avoids recursive Membership RLS. Explicit schema/search_path
-- and no dynamic SQL prevent object shadowing; callers cannot choose an actor.
CREATE FUNCTION public.fieldops_can_access(tenant uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $$
  SELECT tenant = nullif(current_setting('app.organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM public."Membership" m JOIN public."User" u ON u.id = m."userId"
      WHERE m."organizationId" = tenant
        AND m."userId" = nullif(current_setting('app.actor_id', true), '')::uuid
        AND m.status = 'ACTIVE' AND u."isActive"
    )
$$;
REVOKE ALL ON FUNCTION public.fieldops_can_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldops_can_access(uuid) TO fieldops_app;

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Membership" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "TechnicianProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TechnicianProfile" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "CustomerProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CustomerProfile" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "Team" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Team" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TeamMember" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "MaintenanceRequest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaintenanceRequest" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "WorkOrder" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrder" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "Assignment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Assignment" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "WorkOrderStatusHistory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "WorkOrderStatusHistory" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "TechnicianLocationUpdate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TechnicianLocationUpdate" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attachment" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog" TO fieldops_app
USING (public.fieldops_can_access("organizationId"))
WITH CHECK (public.fieldops_can_access("organizationId"));

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Organization" TO fieldops_app
USING (public.fieldops_can_access(id));
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_users ON "User" TO fieldops_app USING (
  EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId" = "User".id
    AND m."organizationId" = nullif(current_setting('app.organization_id', true), '')::uuid)
);
GRANT SELECT ON "Organization", "User", "Role", "Membership" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TechnicianProfile" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CustomerProfile" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Team" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TeamMember" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MaintenanceRequest" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkOrder" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Assignment" TO fieldops_app;
GRANT SELECT, INSERT ON "WorkOrderStatusHistory" TO fieldops_app;
GRANT SELECT, INSERT ON "TechnicianLocationUpdate" TO fieldops_app;
GRANT SELECT, INSERT ON "Attachment" TO fieldops_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Notification" TO fieldops_app;
GRANT SELECT, INSERT ON "AuditLog" TO fieldops_app;

CREATE UNIQUE INDEX "Assignment_one_active_per_order" ON "Assignment" ("organizationId", "workOrderId") WHERE status = 'ACTIVE';
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_end_consistent" CHECK (
  (status = 'ACTIVE' AND "endedAt" IS NULL) OR (status <> 'ACTIVE' AND "endedAt" IS NOT NULL)
);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_one_parent" CHECK (num_nonnulls("requestId", "workOrderId") = 1);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_positive_size" CHECK ("sizeBytes" > 0);
ALTER TABLE "TechnicianLocationUpdate" ADD CONSTRAINT "Location_valid_coordinates" CHECK (
  latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND ("accuracyMeters" IS NULL OR "accuracyMeters" >= 0)
);
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "Request_valid_coordinates" CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "Request_cancellation_reason" CHECK (status <> 'CANCELLED' OR length(trim("cancellationReason")) > 0 AND "cancellationReason" IS NOT NULL);
ALTER TABLE "WorkOrder" ADD CONSTRAINT "Order_cancellation_reason" CHECK (status <> 'CANCELLED' OR length(trim("cancellationReason")) > 0 AND "cancellationReason" IS NOT NULL);
ALTER TABLE "WorkOrder" ADD CONSTRAINT "Order_positive_version" CHECK (version >= 0);
ALTER TABLE "WorkOrder" ADD CONSTRAINT "Order_completion_timestamps" CHECK (
  (status NOT IN ('COMPLETED', 'VERIFIED', 'CLOSED') OR "completedAt" IS NOT NULL) AND
  (status NOT IN ('VERIFIED', 'CLOSED') OR "verifiedAt" IS NOT NULL) AND
  (status <> 'CLOSED' OR "closedAt" IS NOT NULL)
);
-- Canonical email avoids duplicates differing only in case/whitespace.
ALTER TABLE "User" ADD CONSTRAINT "User_canonical_email" CHECK (email = lower(trim(email)));
