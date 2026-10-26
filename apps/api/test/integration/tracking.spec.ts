import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { PrismaService } from "../../src/prisma/prisma.service";

const { seedDatabase, id } = require("../../prisma/seed.cjs");
const origin = "http://localhost:5173";

describe("Tracking REST + PostgreSQL isolation and lifecycle", () => {
  const db = new PrismaClient();
  let app: INestApplication;
  let jwt: JwtService;
  const org = id("damascus");
  const otherOrg = id("aleppo");
  const existingOrder = id("damascus:reassigned:order");
  const tokens: Record<string, string> = {};
  const authSessionIds: Record<string, string> = {};
  const activeSessionIds: string[] = [];

  const trackingPath = (suffix: string, tenant = org) =>
    `/api/v1/organizations/${tenant}/tracking${suffix}`;
  const resourcePath = (suffix: string) =>
    `/api/v1/organizations/${org}${suffix}`;

  const post = (suffix: string, person: string, body: object, tenant = org) =>
    request(app.getHttpServer())
      .post(trackingPath(suffix, tenant))
      .set("Origin", origin)
      .auth(tokens[person], { type: "bearer" })
      .send(body);
  const get = (suffix: string, person: string, tenant = org) =>
    request(app.getHttpServer())
      .get(trackingPath(suffix, tenant))
      .auth(tokens[person], { type: "bearer" });
  const stop = (sessionId: string, person = "tech2") =>
    request(app.getHttpServer())
      .delete(trackingPath(`/sessions/${sessionId}`))
      .set("Origin", origin)
      .auth(tokens[person], { type: "bearer" });
  const command = (method: "post" | "patch", path: string, body: object, person = "dispatcher") =>
    request(app.getHttpServer())
      [method](resourcePath(path))
      .set("Origin", origin)
      .auth(tokens[person], { type: "bearer" })
      .send(body);

  async function issue(person: string, tenant = "damascus") {
    const userId = id(`${tenant}:${person}:user`);
    const auth = await db.authSession.create({
      data: { userId, expiresAt: new Date(Date.now() + 3600_000) },
    });
    const token = await jwt.signAsync(
      { sub: userId, sid: auth.id },
      { expiresIn: 900 },
    );
    tokens[person] = token;
    authSessionIds[person] = auth.id;
    return { token, authSessionId: auth.id };
  }

  async function start(workOrderId = existingOrder) {
    const result = await post("/sessions", "tech2", { workOrderId, consent: true }).expect(201);
    activeSessionIds.push(result.body.id);
    return result.body as { id: string; expiresAt: string; workOrderId: string };
  }

  const sample = (sessionId: string, recordedAt = new Date().toISOString()) =>
    post(`/sessions/${sessionId}/location`, "tech2", {
      latitude: 35.111111,
      longitude: 36.222222,
      accuracyMeters: 14,
      recordedAt,
    });

  async function newStartedOrder() {
    const created = await command("post", "/requests", {
      title: "Tracking integration request",
      description: "Tracking assignment lifecycle integration fixture",
      address: `Integration-only ${randomUUID()}`,
    }, "customer").expect(201);
    await command("post", `/requests/${created.body.id}/review`, {
      expectedVersion: created.body.version,
      note: "Integration fixture reviewed",
    }).expect(201);
    const order = await command("post", "/work-orders", {
      requestId: created.body.id,
      title: "Tracking integration work order",
      description: "Private tracking lease fixture",
    }).expect(201);
    await command("post", `/work-orders/${order.body.id}/assignments`, {
      technicianId: id("damascus:tech2:profile"),
      expectedVersion: order.body.version,
    }).expect(201);
    const accepted = await command("post", `/work-orders/${order.body.id}/accept`, {
      expectedVersion: order.body.version + 1,
    }, "tech2").expect(201);
    const started = await command("patch", `/work-orders/${order.body.id}/status`, {
      expectedVersion: accepted.body.version,
      status: "IN_PROGRESS",
    }, "tech2").expect(200);
    return started.body as { id: string; version: number };
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!decodeURIComponent(url.pathname).endsWith("_test"))
      throw new Error("A dedicated PostgreSQL _test database is required");
    process.env.JWT_ACCESS_SECRET = randomBytes(64).toString("hex");
    process.env.WEB_ORIGIN = origin;
    await db.$connect();
    await seedDatabase(db);
    jwt = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: { issuer: "fieldops-api", audience: "fieldops-web", algorithm: "HS256" },
    });
    for (const person of ["admin", "dispatcher", "tech1", "customer"]) {
      await issue(person);
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  beforeEach(async () => {
    // Never reuse a revoked/expired auth session between tests.
    await issue("tech2");
  });

  afterEach(async () => {
    // Use only ephemeral test leases and preserve all seed business entities.
    await db.trackingSession.updateMany({
      where: { id: { in: activeSessionIds.splice(0) }, endedAt: null },
      data: {
        endedAt: new Date(), latitude: null, longitude: null,
        accuracyMeters: null, recordedAt: null, receivedAt: null,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it("rejects missing consent, unassigned technician, customer and wrong tenant", async () => {
    await post("/sessions", "tech2", { workOrderId: existingOrder }).expect(400);
    await post("/sessions", "tech2", { workOrderId: existingOrder, consent: false }).expect(400);
    await post("/sessions", "tech1", { workOrderId: existingOrder, consent: true }).expect(403);
    await post("/sessions", "customer", { workOrderId: existingOrder, consent: true }).expect(403);
    await post("/sessions", "tech2", { workOrderId: existingOrder, consent: true }, otherOrg)
      .expect(403);
    await get("/locations", "admin", otherOrg).expect(403);
  });

  it("requires origin and valid field schema for every write", async () => {
    await request(app.getHttpServer())
      .post(trackingPath("/sessions"))
      .auth(tokens.tech2, { type: "bearer" })
      .send({ workOrderId: existingOrder, consent: true }).expect(403);
    const s = await start();
    await post(`/sessions/${s.id}/location`, "tech2", {
      latitude: 91, longitude: 36, accuracyMeters: 12, recordedAt: new Date().toISOString(),
    }).expect(400);
    await post(`/sessions/${s.id}/location`, "tech2", {
      latitude: "35.0", longitude: 36, accuracyMeters: 12, recordedAt: new Date().toISOString(),
    }).expect(400);
    await post(`/sessions/${s.id}/location`, "tech2", {
      latitude: 35, longitude: 36, accuracyMeters: -1, recordedAt: new Date().toISOString(),
    }).expect(400);
    await post(`/sessions/${s.id}/location`, "tech2", {
      latitude: 35, longitude: 36, accuracyMeters: 12, recordedAt: "invalid",
    }).expect(400);
    await sample(s.id, new Date(Date.now() - 31_000).toISOString()).expect(409);
  });

  it("shows coordinates only to authorized staff and persists one latest fix", async () => {
    const s = await start();
    const auditBefore = await db.auditLog.count({ where: { organizationId: org } });
    const outboxBefore = await db.outboxEvent.count({ where: { organizationId: org } });
    const uploaded = await sample(s.id).expect(201);
    expect(uploaded.body).not.toHaveProperty("latitude");
    expect(uploaded.body).not.toHaveProperty("longitude");
    await sample(s.id).expect(409); // 15-second server-side limit.
    const mine = await get("/mine", "tech2").expect(200);
    expect(mine.body.session.id).toBe(s.id);
    expect(JSON.stringify(mine.body)).not.toContain("35.111111");
    await get("/locations", "tech1").expect(403);
    await get("/locations", "customer").expect(403);
    await get("/locations", "admin").expect(200);
    const staff = await get("/locations", "dispatcher").expect(200);
    expect(staff.headers["cache-control"]).toContain("no-store");
    const visible = staff.body.sessions.find((row: {id:string}) => row.id === s.id);
    expect(visible.latitude).toBe(35.111111);
    expect(visible.longitude).toBe(36.222222);
    const stored = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(stored.latitude).toBe(35.111111);
    expect(await db.trackingSession.count({ where: { id: s.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { organizationId: org } })).toBe(auditBefore);
    expect(await db.outboxEvent.count({ where: { organizationId: org } })).toBe(outboxBefore);
  });

  it("prevents one technician uploading another technician's session", async () => {
    const s = await start();
    await post(`/sessions/${s.id}/location`, "tech1", {
      latitude: 35, longitude: 36, accuracyMeters: 20, recordedAt: new Date().toISOString(),
    }).expect(404);
    await stop(s.id, "tech1").expect(204);
    expect((await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } })).endedAt)
      .toBeNull();
  });

  it("stops, redacts, and never restarts a session on GET /mine", async () => {
    const s = await start();
    await sample(s.id).expect(201);
    await stop(s.id).expect(204);
    await stop(s.id).expect(204);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).toBeTruthy();
    expect([row.latitude, row.longitude, row.accuracyMeters, row.recordedAt, row.receivedAt])
      .toEqual([null, null, null, null, null]);
    expect((await get("/mine", "tech2").expect(200)).body.session).toBeNull();
    await sample(s.id).expect(404);
    expect(await db.trackingSession.count({ where: { technicianId: id("damascus:tech2:profile"), endedAt: null } })).toBe(0);
  });

  it("expires server-side, redacts, and denies late updates", async () => {
    const s = await start();
    await sample(s.id).expect(201);
    await db.trackingSession.update({
      where: { id: s.id }, data: {
        consentedAt: new Date(Date.now() - 130_000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await get("/mine", "tech2").expect(200).then((r) => expect(r.body.session).toBeNull());
    expect((await get("/locations", "dispatcher").expect(200)).body.sessions
      .some((row: {id:string}) => row.id === s.id)).toBe(false);
    await sample(s.id).expect(409);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).not.toBeNull();
    expect(row.latitude).toBeNull();
  });

  it("revokes and wipes coordinates when real logout revokes AuthSession", async () => {
    const s = await start();
    await sample(s.id).expect(201);
    const refresh = randomBytes(48).toString("base64url");
    await db.refreshToken.create({
      data: {
        sessionId: authSessionIds.tech2,
        tokenHash: createHash("sha256").update(refresh).digest("hex"),
      },
    });
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .set("Cookie", `fieldops_refresh=${refresh}`)
      .expect(204);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).toBeTruthy();
    expect(row.latitude).toBeNull();
    await sample(s.id).expect(401);
    expect((await get("/locations", "dispatcher").expect(200)).body.sessions
      .some((x: {id:string}) => x.id === s.id)).toBe(false);
  });

  it("revokes and redacts when user becomes inactive or membership is suspended", async () => {
    const userId = id("damascus:tech2:user");
    const membershipId = id("damascus:tech2");
    const one = await start();
    await sample(one.id).expect(201);
    try {
      await db.user.update({ where: { id: userId }, data: { isActive: false } });
      const row = await db.trackingSession.findUniqueOrThrow({ where: { id: one.id } });
      expect(row.latitude).toBeNull();
      expect(row.endedAt).toBeTruthy();
      await get("/mine", "tech2").expect(401);
    } finally {
      await db.user.update({ where: { id: userId }, data: { isActive: true } });
    }
    await issue("tech2");
    const two = await start();
    await sample(two.id).expect(201);
    try {
      await db.membership.update({
        where: { id: membershipId }, data: { status: "SUSPENDED" },
      });
      const row = await db.trackingSession.findUniqueOrThrow({ where: { id: two.id } });
      expect(row.latitude).toBeNull();
      expect(row.endedAt).toBeTruthy();
      await get("/mine", "tech2").expect(403);
    } finally {
      await db.membership.update({
        where: { id: membershipId }, data: { status: "ACTIVE" },
      });
    }
  });

  it("revokes immediately on reassignment and rejects writes after ownership changes", async () => {
    const order = await newStartedOrder();
    const s = await start(order.id);
    await sample(s.id).expect(201);
    await command("post", `/work-orders/${order.id}/assignments`, {
      technicianId: id("damascus:tech1:profile"),
      expectedVersion: order.version,
      reason: "Reassignment for security integration testing",
    }).expect(201);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).not.toBeNull();
    expect(row.latitude).toBeNull();
    await sample(s.id).expect(404);
  });

  it("revokes immediately on work-order cancellation", async () => {
    const order = await newStartedOrder();
    const s = await start(order.id);
    await sample(s.id).expect(201);
    await command("patch", `/work-orders/${order.id}/status`, {
      expectedVersion: order.version,
      status: "CANCELLED",
      reason: "Cancelled for integration validation",
    }).expect(200);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.latitude).toBeNull();
    expect(row.endedAt).not.toBeNull();
  });

  it("never creates two simultaneous leases for the same technician", async () => {
    const result = await Promise.all([
      post("/sessions", "tech2", { workOrderId: existingOrder, consent: true }),
      post("/sessions", "tech2", { workOrderId: existingOrder, consent: true }),
    ]);
    expect(result.every((r) => [201, 409].includes(r.status))).toBe(true);
    for (const r of result) if (r.status === 201) activeSessionIds.push(r.body.id);
    expect(result.some((r) => r.status === 201)).toBe(true);
    const count = await db.trackingSession.count({
      where: { organizationId: org, technicianId: id("damascus:tech2:profile"), endedAt: null },
    });
    expect(count).toBe(1);
  });

  it("serializes simultaneous location submissions and a competing stop", async () => {
    const s = await start();
    const submitted = await Promise.all([sample(s.id), sample(s.id)]);
    expect(submitted.filter((x) => x.status === 201)).toHaveLength(1);
    expect(submitted.filter((x) => x.status === 409)).toHaveLength(1);
    // A sample racing Stop may commit before Stop or be denied; never after Stop completes.
    const outcomes = await Promise.all([stop(s.id), sample(s.id)]);
    expect(outcomes[0].status).toBe(204);
    expect([201, 404, 409].includes(outcomes[1].status)).toBe(true);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).not.toBeNull();
    expect(row.latitude).toBeNull();
    await sample(s.id).expect(404);
  });

  it("expires the authenticated user session and revokes location sharing", async () => {
    const s = await start();
    await sample(s.id).expect(201);
    await db.authSession.update({
      where: { id: authSessionIds.tech2 },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).toBeTruthy();
    expect(row.longitude).toBeNull();
    await sample(s.id).expect(401);
    expect((await get("/locations", "admin").expect(200)).body.sessions
      .some((x: {id:string}) => x.id === s.id)).toBe(false);
  });

  it("serializes a concurrent work-order revocation and GPS submission", async () => {
    const order = await newStartedOrder();
    const s = await start(order.id);
    const results = await Promise.all([
      command("patch", `/work-orders/${order.id}/status`, {
        expectedVersion: order.version,
        status: "CANCELLED",
        reason: "Concurrent cancellation integration test",
      }),
      sample(s.id),
    ]);
    expect(results[0].status).toBe(200);
    expect([201, 403, 404, 409].includes(results[1].status)).toBe(true);
    const row = await db.trackingSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.endedAt).toBeTruthy();
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
    await sample(s.id).expect(404);
  });

  it("isolates TrackingSession at PostgreSQL RLS, not only at HTTP", async () => {
    const s = await start();
    const scoped = app.get(PrismaService);
    const other = await scoped.forOrganization(
      { organizationId: otherOrg, actorId: id("aleppo:dispatcher:user") },
      async (tx) => {
        const read = await tx.trackingSession.findMany({ where: { id: s.id } });
        const changed = await tx.trackingSession.updateMany({
          where: { id: s.id },
          data: { endedAt: new Date(), latitude: null, longitude: null, accuracyMeters: null, recordedAt: null, receivedAt: null },
        });
        return { read, changed: changed.count };
      },
    );
    expect(other.read).toHaveLength(0);
    expect(other.changed).toBe(0);
    await expect(scoped.forOrganization(
      { organizationId: otherOrg, actorId: id("damascus:tech2:user") },
      (tx) => tx.trackingSession.findMany(),
    )).rejects.toThrow("Organization access denied");
  });
});
