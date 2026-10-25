-- Earlier releases allowed starting work without an explicit acceptance command.
-- Preserve those assignments. The inferred timestamp is clearly audited; it is
-- not presented as a newly submitted technician acceptance.
WITH legacy AS (
  SELECT a.id, COALESCE((SELECT min(h."createdAt") FROM "WorkOrderStatusHistory" h
    WHERE h."workOrderId" = a."workOrderId" AND h."organizationId" = a."organizationId"
      AND h."toStatus" = 'IN_PROGRESS' AND h."createdAt" >= a."createdAt"), a."createdAt") AS started
  FROM "Assignment" a JOIN "WorkOrder" w ON w.id = a."workOrderId"
  WHERE a."acceptedAt" IS NULL AND
    ((a.status = 'ACTIVE' AND w.status = 'IN_PROGRESS') OR a.status = 'COMPLETED')
), updated AS (
  UPDATE "Assignment" a SET "acceptedAt" = legacy.started FROM legacy WHERE a.id = legacy.id
  RETURNING a.*
)
INSERT INTO "AuditLog" (id, "organizationId", "actorId", action, "entityType", "entityId", metadata, "createdAt")
SELECT gen_random_uuid(), "organizationId", "assignedById", 'LEGACY_ACCEPTANCE_BACKFILLED',
  'WorkOrder', "workOrderId", jsonb_build_object('assignmentId', id, 'inferred', true, 'source', 'historical start or assignment timestamp'), now()
FROM updated;
UPDATE "WorkOrder" SET progress = 100 WHERE status IN ('COMPLETED', 'VERIFIED', 'CLOSED');
