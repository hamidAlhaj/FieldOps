import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import sharp from "sharp";
import { io, Socket } from "socket.io-client";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
const { seedDatabase, id } = require("../../prisma/seed.cjs");
const origin = "http://localhost:5173";
describe("Business workflow REST, transactions and authenticated real-time delivery", () => {
  const db = new PrismaClient();
  let app: INestApplication;
  let base: string;
  let image: Buffer;
  let jwt: JwtService;
  const org = id("damascus");
  const tokens: Record<string, string> = {};
  const sockets: Socket[] = [];
  const endpoint = (path: string, tenant = org) =>
    `/api/v1/organizations/${tenant}${path}`;
  const get = (path: string, person = "dispatcher") =>
    request(app.getHttpServer())
      .get(endpoint(path))
      .auth(tokens[person], { type: "bearer" });
  const post = (path: string, body: object, person = "dispatcher") =>
    request(app.getHttpServer())
      .post(endpoint(path))
      .auth(tokens[person], { type: "bearer" })
      .send(body);
  const status = (
    order: string,
    value: string,
    expectedVersion: number,
    person = "tech1",
    reason?: string,
  ) =>
    request(app.getHttpServer())
      .patch(endpoint(`/work-orders/${order}/status`))
      .auth(tokens[person], { type: "bearer" })
      .send({ status: value, expectedVersion, ...(reason ? { reason } : {}) });
  const upload = (
    order: string,
    version: number,
    kind: string,
    person = "tech1",
    bytes = image,
  ) =>
    request(app.getHttpServer())
      .post(endpoint(`/work-orders/${order}/photos`))
      .auth(tokens[person], { type: "bearer" })
      .field("expectedVersion", version)
      .field("kind", kind)
      .attach("file", bytes, "evidence.png");
  async function makeRequest() {
    return (
      await post(
        "/requests",
        {
          title: "Cooling unit vibration",
          description: "Loud vibration after startup in the clinic",
          address: "North clinic, plant room",
        },
        "customer",
      ).expect(201)
    ).body;
  }
  async function makeOrder() {
    const r = await makeRequest();
    await post(`/requests/${r.id}/review`, {
      expectedVersion: 0,
      note: "Confirmed with the clinic manager",
    }).expect(201);
    return (
      await post("/work-orders", {
        requestId: r.id,
        title: r.title,
        description: r.description,
      }).expect(201)
    ).body;
  }
  async function assigned() {
    const o = await makeOrder();
    await post(`/work-orders/${o.id}/assignments`, {
      expectedVersion: 0,
      technicianId: id("damascus:tech1:profile"),
    }).expect(201);
    return o;
  }
  async function token(person: string, tenant = "damascus", expiresIn = 900) {
    const userId = id(`${tenant}:${person}:user`);
    const session = await db.authSession.create({
      data: { userId, expiresAt: new Date(Date.now() + 3600000) },
    });
    return {
      value: await jwt.signAsync(
        { sub: userId, sid: session.id },
        { expiresIn },
      ),
      session,
    };
  }
  function connect(
    value: string,
    organizationId = org,
    requestOrigin = origin,
  ) {
    const socket = io(`${base}/operations`, {
      path: "/api/socket.io",
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: { token: value, organizationId },
      extraHeaders: { Origin: requestOrigin },
    });
    sockets.push(socket);
    return socket;
  }
  function connected(socket: Socket) {
    return new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
  }
  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
      throw new Error("Dedicated test database required");
    process.env.JWT_ACCESS_SECRET = randomBytes(64).toString("hex");
    process.env.WEB_ORIGIN = origin;
    await seedDatabase(db);
    jwt = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET,
      signOptions: {
        issuer: "fieldops-api",
        audience: "fieldops-web",
        algorithm: "HS256",
      },
    });
    for (const person of ["dispatcher", "admin", "tech1", "tech2", "customer"])
      tokens[person] = (await token(person)).value;
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
    image = await sharp({
      create: { width: 16, height: 12, channels: 3, background: "#21dda2" },
    })
      .png()
      .toBuffer();
  });
  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });
  afterAll(async () => {
    await app?.close();
    await db.$disconnect();
  });

  it("executes the complete reviewed, accepted, photographed, verified and closed workflow over HTTP", async () => {
    const o = await assigned();
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    const before = await upload(o.id, 2, "BEFORE").expect(201);
    await status(o.id, "IN_PROGRESS", 3).expect(200);
    await post(
      `/work-orders/${o.id}/progress`,
      {
        expectedVersion: 4,
        percent: 60,
        note: "Mounts replaced; testing vibration",
      },
      "tech1",
    ).expect(201);
    await upload(o.id, 5, "AFTER").expect(201);
    await status(
      o.id,
      "COMPLETED",
      6,
      "tech1",
      "Tested under load; vibration resolved",
    ).expect(200);
    await status(o.id, "VERIFIED", 7, "dispatcher").expect(200);
    const closed = await status(o.id, "CLOSED", 8, "dispatcher").expect(200);
    expect(closed.body).toMatchObject({
      status: "CLOSED",
      progress: 100,
      version: 9,
    });
    const detail = await get(`/work-orders/${o.id}`, "customer").expect(200);
    expect(detail.body.activity).toHaveLength(10);
    expect(detail.body.assignments[0]).toMatchObject({
      status: "COMPLETED",
      acceptedAt: expect.any(String),
    });
    expect(detail.body.progressUpdates[0].percent).toBe(60);
    expect(
      (await get(`/requests/${o.requestId}`, "customer")).body.status,
    ).toBe("RESOLVED");
    const photo = await get(`/photos/${before.body.id}/content`, "customer")
      .expect(200)
      .expect("Content-Type", /image\/webp/);
    expect(photo.headers["cache-control"]).toContain("no-store");
    expect((await sharp(photo.body).metadata()).format).toBe("webp");
    await get(`/work-orders/${o.id}`, "tech1").expect(200);
    await status(o.id, "ASSIGNED", 9, "dispatcher").expect(409);
  });
  it("requires request review, assignment acceptance, evidence and completion notes", async () => {
    const r = await makeRequest();
    await post("/work-orders", {
      requestId: r.id,
      title: r.title,
      description: r.description,
    }).expect(409);
    const o = await assigned();
    await status(o.id, "IN_PROGRESS", 1).expect(409);
    await upload(o.id, 1, "BEFORE").expect(409);
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 2 },
      "tech1",
    ).expect(409);
    await upload(o.id, 2, "AFTER").expect(409);
    await status(o.id, "COMPLETED", 2, "tech1", "Too early").expect(409);
    await status(o.id, "IN_PROGRESS", 2).expect(200);
    await status(o.id, "COMPLETED", 3).expect(400);
    await status(o.id, "COMPLETED", 3, "tech1", "Missing evidence").expect(409);
    await status(o.id, "CLOSED", 3, "dispatcher").expect(409);
  });
  it("enforces ownership, technician responsibilities and organization isolation", async () => {
    const o = await assigned();
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech2",
    ).expect(403);
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "customer",
    ).expect(403);
    await status(o.id, "IN_PROGRESS", 1, "dispatcher").expect(403);
    await status(o.id, "VERIFIED", 1, "tech1").expect(403);
    await post(
      `/requests/${o.requestId}/review`,
      { expectedVersion: 0, note: "Forbidden review" },
      "customer",
    ).expect(403);
    await get(`/work-orders/${o.id}`, "tech2").expect(404);
    await request(app.getHttpServer())
      .get(endpoint(`/work-orders/${o.id}`, id("aleppo")))
      .auth(tokens.dispatcher, { type: "bearer" })
      .expect(403);
    await post(`/work-orders/${o.id}/assignments`, {
      expectedVersion: 1,
      technicianId: id("aleppo:tech1:profile"),
      reason: "Wrong organization",
    }).expect(400);
  });
  it("rejects malformed DTOs and invalid images without creating evidence or changing version", async () => {
    const o = await assigned();
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    await upload(
      o.id,
      2,
      "BEFORE",
      "tech1",
      Buffer.from("<svg><script>bad()</script></svg>"),
    ).expect(400);
    await upload(o.id, 2, "INVALID").expect(400);
    await post(
      `/work-orders/${o.id}/progress`,
      {
        expectedVersion: 2,
        percent: 101,
        note: "Invalid",
        organizationId: org,
      },
      "tech1",
    ).expect(400);
    expect((await get(`/work-orders/${o.id}`)).body.version).toBe(2);
    expect(await db.attachment.count({ where: { workOrderId: o.id } })).toBe(0);
  });
  it("serializes concurrent review and acceptance commands", async () => {
    const r = await makeRequest();
    const reviews = await Promise.all([
      post(`/requests/${r.id}/review`, {
        expectedVersion: 0,
        note: "Review A",
      }),
      post(`/requests/${r.id}/review`, {
        expectedVersion: 0,
        note: "Review B",
      }),
    ]);
    expect(reviews.map((r) => r.status).sort()).toEqual([201, 409]);
    const o = await assigned();
    const accepts = await Promise.all([
      post(`/work-orders/${o.id}/accept`, { expectedVersion: 1 }, "tech1"),
      post(`/work-orders/${o.id}/accept`, { expectedVersion: 1 }, "tech1"),
    ]);
    expect(accepts.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("rejects duplicate assignment and stale progress, rolling back outbox and history", async () => {
    const o = await assigned();
    await post(`/work-orders/${o.id}/assignments`, {
      expectedVersion: 1,
      technicianId: id("damascus:tech1:profile"),
      reason: "Duplicate assignment",
    }).expect(409);
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    await status(o.id, "IN_PROGRESS", 2).expect(200);
    const updates = await Promise.all([
      post(
        `/work-orders/${o.id}/progress`,
        { expectedVersion: 3, percent: 20, note: "Inspection A" },
        "tech1",
      ),
      post(
        `/work-orders/${o.id}/progress`,
        { expectedVersion: 3, percent: 30, note: "Inspection B" },
        "tech1",
      ),
    ]);
    expect(updates.map((r) => r.status).sort()).toEqual([201, 409]);
    const before = await db.outboxEvent.count({ where: { aggregateId: o.id } });
    await post(
      `/work-orders/${o.id}/progress`,
      { expectedVersion: 0, percent: 50, note: "Stale update" },
      "tech1",
    ).expect(409);
    expect(await db.outboxEvent.count({ where: { aggregateId: o.id } })).toBe(
      before,
    );
    expect(
      await db.progressUpdate.count({ where: { workOrderId: o.id } }),
    ).toBe(1);
    await post(
      `/work-orders/${o.id}/progress`,
      { expectedVersion: 4, percent: 0, note: "Decrease progress" },
      "tech1",
    ).expect(409);
  });
  it("reassignment revokes previous technician access, resets progress and requires new evidence", async () => {
    const o = await assigned();
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    const photo = await upload(o.id, 2, "BEFORE").expect(201);
    await status(o.id, "IN_PROGRESS", 3).expect(200);
    await upload(o.id, 4, "AFTER").expect(201);
    await post(`/work-orders/${o.id}/assignments`, {
      expectedVersion: 5,
      technicianId: id("damascus:tech2:profile"),
      reason: "Specialist requested",
    }).expect(201);
    await get(`/photos/${photo.body.id}/content`, "tech1").expect(404);
    await get(`/work-orders/${o.id}`, "tech1").expect(404);
    const detail = (await get(`/work-orders/${o.id}`, "tech2")).body;
    expect(detail).toMatchObject({
      status: "ASSIGNED",
      progress: 0,
      version: 6,
    });
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 6 },
      "tech2",
    ).expect(201);
    await status(o.id, "IN_PROGRESS", 7, "tech2").expect(200);
    await status(
      o.id,
      "COMPLETED",
      8,
      "tech2",
      "Cannot reuse old evidence",
    ).expect(409);
    expect(
      (await get("/notifications", "tech1")).body.some(
        (n: any) => n.title === "Assignment changed",
      ),
    ).toBe(true);
  });
  it("cancels unfinished work atomically and rejects subsequent progress", async () => {
    const o = await assigned();
    await post(`/requests/${o.requestId}/cancel`, {
      reason: "Customer withdrew request",
    }).expect(201);
    expect((await get(`/work-orders/${o.id}`)).body).toMatchObject({
      status: "CANCELLED",
      version: 2,
    });
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 2 },
      "tech1",
    ).expect(403);
    expect(
      await db.assignment.count({
        where: { workOrderId: o.id, status: "ACTIVE" },
      }),
    ).toBe(0);
  });
  it("requires a valid origin, access token and active organization for WebSocket connections", async () => {
    await expect(connected(connect("forged"))).rejects.toThrow("AUTH_REQUIRED");
    await expect(
      connected(connect(tokens.tech1, id("aleppo"))),
    ).rejects.toThrow("ORGANIZATION_FORBIDDEN");
    await expect(
      connected(connect(tokens.tech1, org, "https://evil.example")),
    ).rejects.toThrow("AUTH_REQUIRED");
    const expired = await token("tech1", "damascus", -1);
    await expect(connected(connect(expired.value))).rejects.toThrow(
      "AUTH_REQUIRED",
    );
  });
  it("delivers committed assignment events only to authorized users and supports reconnect synchronization", async () => {
    const o = await makeOrder();
    const tech = connect(tokens.tech1);
    const unrelated = connect(tokens.tech2);
    const foreign = connect(
      (await token("dispatcher", "aleppo")).value,
      id("aleppo"),
    );
    await Promise.all([
      connected(tech),
      connected(unrelated),
      connected(foreign),
    ]);
    const received: any[] = [];
    const denied: any[] = [];
    tech.on("operations.changed", (e) => received.push(e));
    unrelated.on("operations.changed", (e) => denied.push(e));
    foreign.on("operations.changed", (e) => denied.push(e));
    await post(`/work-orders/${o.id}/assignments`, {
      expectedVersion: 0,
      technicianId: id("damascus:tech1:profile"),
    }).expect(201);
    for (
      let i = 0;
      i < 40 && !received.some((e) => e.aggregateId === o.id);
      i++
    )
      await wait(100);
    expect(received.some((e) => e.aggregateId === o.id)).toBe(true);
    expect(denied.some((e) => e.aggregateId === o.id)).toBe(false);
    expect(received.find((e) => e.aggregateId === o.id)).not.toHaveProperty(
      "description",
    );
    tech.disconnect();
    await post(
      `/work-orders/${o.id}/accept`,
      { expectedVersion: 1 },
      "tech1",
    ).expect(201);
    const reconnected = connect(tokens.tech1);
    const sync = new Promise<void>((resolve) =>
      reconnected.once("sync.required", resolve),
    );
    await connected(reconnected);
    await sync;
    expect((await get(`/work-orders/${o.id}`, "tech1")).body.version).toBe(2);
  });
  it("disconnects a revoked session before delivering further events", async () => {
    const identity = await token("tech1");
    const socket = connect(identity.value);
    await connected(socket);
    await db.authSession.update({
      where: { id: identity.session.id },
      data: { revokedAt: new Date() },
    });
    const disconnected = new Promise<void>((resolve) =>
      socket.once("disconnect", () => resolve()),
    );
    await assigned();
    await disconnected;
    await expect(connected(connect(identity.value))).rejects.toThrow(
      "AUTH_REQUIRED",
    );
  });
  it("notification ownership and new tenant tables remain isolated", async () => {
    const o = await assigned();
    const list = (await get("/notifications", "tech1")).body;
    const notification = list[0];
    await request(app.getHttpServer())
      .patch(endpoint(`/notifications/${notification.id}/read`))
      .auth(tokens.tech2, { type: "bearer" })
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .patch(endpoint(`/notifications/${notification.id}/read`))
      .auth(tokens.tech1, { type: "bearer" })
      .send({})
      .expect(200);
    expect(
      await db.outboxEvent.count({ where: { aggregateId: o.id } }),
    ).toBeGreaterThan(0);
  });
});
