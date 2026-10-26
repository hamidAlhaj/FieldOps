-- Incremental, non-destructive: previously active unbound leases cannot be trusted.
-- Preserve their metadata, immediately end those leases, and remove coordinates.
ALTER TABLE "TrackingSession" ADD COLUMN "authSessionId" UUID;

UPDATE "TrackingSession"
SET "endedAt" = CURRENT_TIMESTAMP,
    latitude = NULL, longitude = NULL, "accuracyMeters" = NULL,
    "recordedAt" = NULL, "receivedAt" = NULL
WHERE "endedAt" IS NULL;

ALTER TABLE "TrackingSession"
  ADD CONSTRAINT "TrackingSession_active_auth_required"
  CHECK ("endedAt" IS NOT NULL OR "authSessionId" IS NOT NULL);

ALTER TABLE "TrackingSession"
  ADD CONSTRAINT "TrackingSession_authSessionId_fkey"
  FOREIGN KEY ("authSessionId") REFERENCES "AuthSession"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "TrackingSession_authSessionId_endedAt_idx"
  ON "TrackingSession" ("authSessionId", "endedAt");

-- Caller never obtains SELECT on AuthSession. This minimal helper checks and
-- row-locks the verified JWT session before any location write/read. A concurrent
-- logout must serialize against that lock, so revocation cannot be missed.
CREATE FUNCTION public.fieldops_tracking_session_authorized(session_id uuid, actor_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF session_id IS NULL OR actor_id IS NULL
    OR actor_id IS DISTINCT FROM
       nullif(current_setting('app.actor_id', true), '')::uuid
  THEN RETURN FALSE;
  END IF;

  -- Match the existing password-change lock order (User then AuthSession).
  -- This also serializes an account disable with a new tracking lease.
  PERFORM u.id FROM public."User" u
    WHERE u.id = actor_id AND u."isActive"
    FOR SHARE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  PERFORM a.id FROM public."AuthSession" a
    WHERE a.id = session_id AND a."userId" = actor_id
      AND a."revokedAt" IS NULL
      AND a."expiresAt" > clock_timestamp()
    FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_session_authorized(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldops_tracking_session_authorized(uuid,uuid)
  TO fieldops_app;

-- Called by the existing logout/password-change/revocation flows which update
-- AuthSession. SECURITY DEFINER is required because the application tenant role
-- does not have write access to AuthSession.
CREATE FUNCTION public.fieldops_tracking_auth_end()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW."revokedAt" IS NOT NULL OR NEW."expiresAt" <= clock_timestamp() THEN
    UPDATE public."TrackingSession"
    SET "endedAt"=COALESCE("endedAt", CURRENT_TIMESTAMP),
        latitude=NULL, longitude=NULL, "accuracyMeters"=NULL,
        "recordedAt"=NULL, "receivedAt"=NULL
    WHERE "authSessionId"=NEW.id AND "endedAt" IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_auth_end() FROM PUBLIC;
CREATE TRIGGER "TrackingSession_auth_end"
AFTER UPDATE OF "revokedAt", "expiresAt" ON "AuthSession"
FOR EACH ROW EXECUTE FUNCTION public.fieldops_tracking_auth_end();

-- Read-only visibility check, scoped to the current tenant. This deliberately
-- does not grant the application role SELECT on AuthSession.
CREATE FUNCTION public.fieldops_tracking_auth_is_active(tracking_id uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."TrackingSession" s
    JOIN public."AuthSession" a ON a.id = s."authSessionId"
    JOIN public."User" u ON u.id = a."userId"
    WHERE s.id = tracking_id
      AND s."organizationId" =
          nullif(current_setting('app.organization_id', true), '')::uuid
      AND a."revokedAt" IS NULL
      AND a."expiresAt" > clock_timestamp()
      AND u."isActive"
  )
$$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_auth_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldops_tracking_auth_is_active(uuid)
  TO fieldops_app;

-- Membership is deliberately read-only to fieldops_app. Row locking needs
-- higher privileges, so authorize it in a narrowly scoped SECURITY DEFINER helper.
CREATE FUNCTION public.fieldops_tracking_membership_lock(tenant_id uuid, actor_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF tenant_id IS DISTINCT FROM
       nullif(current_setting('app.organization_id', true), '')::uuid
     OR actor_id IS DISTINCT FROM
       nullif(current_setting('app.actor_id', true), '')::uuid
  THEN RETURN FALSE;
  END IF;
  PERFORM id FROM public."Membership"
    WHERE "organizationId"=tenant_id AND "userId"=actor_id
      AND status='ACTIVE'
    FOR SHARE;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.fieldops_tracking_membership_lock(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fieldops_tracking_membership_lock(uuid,uuid) TO fieldops_app;
