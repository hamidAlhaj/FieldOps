-- The stronger three-column FKs added in migration 005 are represented in
-- Prisma now. Remove their redundant two-column predecessors without data loss.
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_organizationId_assignmentId_fkey";
ALTER TABLE "ProgressUpdate" DROP CONSTRAINT "ProgressUpdate_organizationId_assignmentId_fkey";
