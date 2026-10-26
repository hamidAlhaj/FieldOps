ALTER TABLE "User" ADD COLUMN theme VARCHAR(5) NOT NULL DEFAULT 'light', ADD COLUMN "notifyAssignments" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "notifyStatusUpdates" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD CONSTRAINT "User_theme_valid" CHECK (theme IN ('light', 'dark'));
GRANT SELECT ("notifyAssignments", "notifyStatusUpdates") ON "User" TO fieldops_app;
GRANT UPDATE (name, "updatedAt") ON "Organization" TO fieldops_app;
