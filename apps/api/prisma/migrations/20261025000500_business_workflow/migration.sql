-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER');

-- AlterTable
ALTER TABLE "MaintenanceRequest" ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "completionNotes" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "acceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "assignmentId" UUID,
ADD COLUMN     "kind" "PhotoKind";

-- CreateTable
CREATE TABLE "ProgressUpdate" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "percent" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotoContent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "aggregateType" VARCHAR(40) NOT NULL,
    "aggregateId" UUID NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "version" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgressUpdate_organizationId_workOrderId_createdAt_idx" ON "ProgressUpdate"("organizationId", "workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "ProgressUpdate_organizationId_assignmentId_idx" ON "ProgressUpdate"("organizationId", "assignmentId");

-- CreateIndex
CREATE INDEX "ProgressUpdate_organizationId_authorId_idx" ON "ProgressUpdate"("organizationId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoContent_attachmentId_key" ON "PhotoContent"("attachmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotoContent_organizationId_attachmentId_key" ON "PhotoContent"("organizationId", "attachmentId");

-- CreateIndex
CREATE INDEX "OutboxEvent_publishedAt_createdAt_idx" ON "OutboxEvent"("publishedAt", "createdAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_organizationId_aggregateType_aggregateId_idx" ON "OutboxEvent"("organizationId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "MaintenanceRequest_organizationId_reviewedById_idx" ON "MaintenanceRequest"("organizationId", "reviewedById");

-- CreateIndex
CREATE INDEX "Attachment_organizationId_assignmentId_kind_idx" ON "Attachment"("organizationId", "assignmentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_organizationId_id_key" ON "Attachment"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "MaintenanceRequest_organizationId_reviewedById_fkey" FOREIGN KEY ("organizationId", "reviewedById") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_organizationId_assignmentId_fkey" FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "Assignment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_organizationId_workOrderId_fkey" FOREIGN KEY ("organizationId", "workOrderId") REFERENCES "WorkOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_organizationId_assignmentId_fkey" FOREIGN KEY ("organizationId", "assignmentId") REFERENCES "Assignment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "ProgressUpdate_organizationId_authorId_fkey" FOREIGN KEY ("organizationId", "authorId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoContent" ADD CONSTRAINT "PhotoContent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotoContent" ADD CONSTRAINT "PhotoContent_organizationId_attachmentId_fkey" FOREIGN KEY ("organizationId", "attachmentId") REFERENCES "Attachment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEvent" ADD CONSTRAINT "OutboxEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only tenant data; only the dedicated publisher can mark events delivered.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ProgressUpdate', 'PhotoContent', 'OutboxEvent'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I TO fieldops_app USING (public.fieldops_can_access("organizationId")) WITH CHECK (public.fieldops_can_access("organizationId"))', t);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO fieldops_app', t);
  END LOOP;
END $$;
ALTER TABLE "WorkOrder" ADD CONSTRAINT "Order_progress_range" CHECK (progress BETWEEN 0 AND 100);
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "Progress_range" CHECK (percent BETWEEN 0 AND 99 AND length(trim(note)) > 0);
ALTER TABLE "PhotoContent" ADD CONSTRAINT "Photo_size_limit" CHECK (octet_length(bytes) BETWEEN 1 AND 5242880);
ALTER TABLE "MaintenanceRequest" ADD CONSTRAINT "Request_positive_version" CHECK (version >= 0);
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_order_identity" UNIQUE ("organizationId", id, "workOrderId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Photo_assignment_order" FOREIGN KEY ("organizationId", "assignmentId", "workOrderId") REFERENCES "Assignment" ("organizationId", id, "workOrderId");
ALTER TABLE "ProgressUpdate" ADD CONSTRAINT "Progress_assignment_order" FOREIGN KEY ("organizationId", "assignmentId", "workOrderId") REFERENCES "Assignment" ("organizationId", id, "workOrderId");
ALTER TABLE "Attachment" ADD CONSTRAINT "Photo_kind_assignment" CHECK ((kind IS NULL AND "assignmentId" IS NULL) OR (kind IS NOT NULL AND "assignmentId" IS NOT NULL AND "workOrderId" IS NOT NULL));
