# FieldOps Stage 6B — Scheduling foundation

## Architecture

Stage 6B extends the existing NestJS and Prisma implementation. No Smart Dispatch scoring engine, route optimization or new infrastructure was created. All changes are on the pre-existing feature/stage-6a-tracking-backend branch.

- Reuse WorkOrder.scheduledAt as planned start; add plannedEndAt and estimatedDurationMinutes. Legacy orders with only scheduledAt remain valid until explicitly rescheduled.
- Store instants in PostgreSQL TIMESTAMP(3) via Prisma UTC Date values; incoming ISO 8601 timestamps MUST include Z or an explicit numeric offset. The React datetime-local input converts the selected user-local time to an explicit UTC ISO timestamp.
- Every complete schedule is 15–720 minutes; scheduled end must exactly equal start + estimated minutes.
- TechnicianProfile.timeZone is a validated IANA zone such as Asia/Damascus. Weekly shifts are local weekday 0=Sunday through 6=Saturday with startMinute/endMinute in 0..1440; no overnight shift in a single row (split at midnight). Multiple non-overlapping shifts per weekday are supported.
- An empty weeklyHours array explicitly means **no configured working-hours restriction** to preserve existing technicians and work orders. Configure working hours before production scheduling.
- TechnicianAvailability status is AVAILABLE/UNAVAILABLE/OFF_DUTY; BUSY is derived from active in-progress or currently reserved work, rather than manually editable. A current time-off period yields OFF_DUTY.
- Skills: Skill catalog per organization, TechnicianSkill, WorkOrderSkill. Administrators create and assign skills; dispatcher/admin attach required skills to work orders. Changing skills on active assignments is rejected if it would remove a requirement.
- TechnicianTimeOff rejects overlap with already reserved active assignments; pending reservations reject overlapping time off.
- Assignment.windowStartAt/windowEndAt are immutable historical snapshots for completed/reassigned assignments, but kept in sync for ACTIVE assignments using PostgreSQL triggers.

## Conflict prevention

The migration installs btree_gist and the partial GiST exclusion constraint `Assignment_no_overlapping_windows` on tenant, technician and a half-open timestamp range [start,end) when status='ACTIVE'. Adjacent assignments with end exactly equal to the next start are allowed. All service write operations run in scoped Serializable Prisma transactions. Errors from concurrent updates and database exclusion constraints return 409 to clients.

Assignment flows call SchedulingService before creating the assignment. Scheduling changes validate a currently assigned technician and rely on the PostgreSQL trigger to refresh the ACTIVE assignment reservation in the same transaction. Resignments preserve previous rows and release the previous active reservation; work-order completion/cancellation releases the active reservation through the existing workflow.

**Limitation:** legacy unscheduled assignments lack a window and do not reserve time. Explicitly schedule them before expecting time-overlap protection. After a time window elapses, an ACTIVE assignment still reserves its historical window until status changes; a new future nonoverlapping assignment is unaffected.

## Endpoints

All endpoints are prefixed `/api/v1/organizations/:organizationId/scheduling`, require verified JWT and organization membership.

| Method | Path | Allowed |
| --- | --- | --- |
| GET | /technicians | ADMIN, DISPATCHER |
| GET | /me | TECHNICIAN |
| PUT | /me/availability | TECHNICIAN for own record |
| PUT | /technicians/:id/availability | ADMIN |
| POST | /me/time-off | TECHNICIAN |
| POST | /technicians/:id/time-off | ADMIN |
| DELETE | /me/time-off/:id | TECHNICIAN owns record |
| DELETE | /time-off/:id | ADMIN |
| GET | /skills | ADMIN, DISPATCHER, TECHNICIAN |
| POST | /skills | ADMIN |
| PUT | /technicians/:id/skills | ADMIN |
| PUT | /work-orders/:id/skills | ADMIN, DISPATCHER |
| PATCH | /work-orders/:id/schedule | ADMIN, DISPATCHER |

Schedule example:

```json
{
  "expectedVersion": 3,
  "plannedStartAt": "2026-11-01T09:00:00.000Z",
  "plannedEndAt": "2026-11-01T11:00:00.000Z",
  "estimatedDurationMinutes": 120
}
```

Availability example:

```json
{
  "status": "AVAILABLE",
  "timeZone": "Asia/Damascus",
  "weeklyHours": [
    { "day": 0, "startMinute": 540, "endMinute": 1020 },
    { "day": 1, "startMinute": 540, "endMinute": 1020 }
  ]
}
```

## Windows PowerShell (repository root)

```powershell
git fetch origin
git switch feature/stage-6a-tracking-backend
git pull --ff-only origin feature/stage-6a-tracking-backend
npm ci
docker compose up -d --wait
npm run db:generate
npm exec -w @fieldops/api -- prisma validate
npm exec -w @fieldops/api -- prisma migrate status
npm exec -w @fieldops/api -- prisma migrate deploy
npm run typecheck
npm run test
npm run build
npm run dev
```

Use a SEPARATE test DB, never the development DB:

```powershell
$env:TEST_DATABASE_URL = "postgresql://fieldops:local-development-only@localhost:5432/fieldops_test?schema=public"
npm run test:integration -w @fieldops/api
npm exec -w @fieldops/web -- playwright install chromium
npm run build -w @fieldops/api
npm run test:e2e:api -w @fieldops/web
```

Only run `CREATE DATABASE fieldops_test` once if it does not already exist. Do not run `prisma migrate reset` on project data.

## Tests

- Jest for UTC offsets, exact durations, weekly shifts and DST transitions.
- Supertest/PostgreSQL for authorization, cross-tenant RLS, skills, time-off, rejected overlaps, GiST exclusion and concurrent assignment races.
- Vitest for browser datetime-local to UTC conversion and form validation.
- Playwright connected browser walkthrough checks dispatcher scheduling and technician availability.
- Existing authentication, WorkOrder lifecycle, tracking and analytics tests remain in the CI suite.

## Current limitations

- Scheduling prevents overlap for complete time windows only; pre-existing unscheduled assignments are permitted for backwards compatibility.
- An hour range with no weekly hours configured is intentionally unrestricted. An organization should configure technician shifts before enforcing formal work policies.
- Availability changes that conflict with existing future active reservations are rejected; reschedule/reassign first.
- Database exlusion covers assignment overlaps, not all possible direct SQL edits of availability, time off or required skills. All normal API writes use the scoped scheduling service. Restrict DB owner access to migrations/administrators.
- An external calendar provider, holiday calendar, recurring leave templates and Smart Dispatch scoring are not implemented.
