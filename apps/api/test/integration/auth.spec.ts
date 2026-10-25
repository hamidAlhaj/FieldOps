import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import * as argon2 from "argon2";
import { JwtService } from "@nestjs/jwt";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
const { seedDatabase, id } = require("../../prisma/seed.cjs");
const origin = "http://localhost:5173";
const password = "Integration-only-safe-password-2026!";
const cookie = (r: any): string => r.headers["set-cookie"][0].split(";")[0];
describe("Authentication and resource authorization HTTP/PostgreSQL", () => {
  let app: INestApplication;
  const db = new PrismaClient();
  let registered: any;
  let registeredCookie: string;
  const tokens: Record<string, string> = {};
  const org = id("damascus");
  const other = id("aleppo");
  const path = (suffix: string, organization = org) =>
    `/api/v1/organizations/${organization}/${suffix}`;
  const get = (suffix: string, role: string) =>
    request(app.getHttpServer())
      .get(path(suffix))
      .auth(tokens[role], { type: "bearer" });
  const email = `registration-${randomUUID()}@example.test`;
  beforeAll(async () => {
    if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
      throw new Error("Dedicated database required");
    process.env.JWT_ACCESS_SECRET = randomBytes(64).toString("hex");
    process.env.WEB_ORIGIN = origin;
    await seedDatabase(db);
    const hash = await argon2.hash(password);
    for (const person of ["admin", "dispatcher", "tech1", "tech2", "customer"])
      await db.user.update({
        where: { id: id(`damascus:${person}:user`) },
        data: { passwordHash: hash },
      });
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    for (const person of [
      "admin",
      "dispatcher",
      "tech1",
      "tech2",
      "customer",
    ]) {
      const r = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .set("Origin", origin)
        .send({ email: `${person}.damascus@example.test`, password })
        .expect(200);
      tokens[person] = r.body.accessToken;
    }
  });
  afterAll(async () => {
    if (app) await app.close();
    await db.$disconnect();
  });
  it("registers with Argon2id, private cookie and no hash/token disclosure", async () => {
    const r = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        email: email.toUpperCase(),
        password,
        displayName: "New Manager",
        organizationName: "New Service Company",
      })
      .expect(201);
    registered = r.body;
    registeredCookie = cookie(r);
    expect(r.headers["set-cookie"][0]).toContain("HttpOnly");
    expect(r.headers["set-cookie"][0]).toContain("SameSite=Strict");
    expect(r.headers["set-cookie"][0]).toContain("Path=/api/v1/auth");
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body.refresh).toBeUndefined();
    expect(r.body.user.passwordHash).toBeUndefined();
    const user = await db.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(user.passwordHash!, password)).toBe(true);
    const hash = createHash("sha256")
      .update(registeredCookie.split("=")[1])
      .digest("hex");
    expect(
      await db.refreshToken.findUnique({ where: { tokenHash: hash } }),
    ).not.toBeNull();
  });
  it("rejects registration escalation and invalid DTO fields", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        email: `bad-${email}`,
        password,
        displayName: "Attacker",
        organizationName: "New Org",
        organizationId: org,
        role: "ADMIN",
      })
      .expect(400);
  });
  it("rejects duplicate registration atomically", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        email,
        password,
        displayName: "Duplicate",
        organizationName: "Must not exist",
      })
      .expect(409);
  });
  it("uses generic login failure and rejects CSRF attempts", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email, password: "invalid-password-123" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email, password })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", registeredCookie)
      .expect(403);
  });
  it("protects routes by default and validates current identity", async () => {
    await request(app.getHttpServer()).get("/api/v1/auth/me").expect(401);
    const r = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(tokens.admin, { type: "bearer" })
      .expect(200);
    expect(r.body.email).toBe("admin.damascus@example.test");
    expect(JSON.stringify(r.body)).not.toContain("passwordHash");
    await get("users", "admin").expect(200);
    await get("users", "dispatcher").expect(403);
  });
  it("rejects tampered, expired and wrong-audience JWTs", async () => {
    const jwt = new JwtService();
    const principal = jwt.decode(tokens.admin) as any;
    for (const access of [
      tokens.admin.slice(0, -8) + "tampered",
      jwt.sign(
        { sub: principal.sub, sid: principal.sid },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          issuer: "fieldops-api",
          audience: "fieldops-web",
          expiresIn: -1,
        },
      ),
      jwt.sign(
        { sub: principal.sub, sid: principal.sid },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          issuer: "fieldops-api",
          audience: "other",
          expiresIn: 300,
        },
      ),
    ])
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .auth(access, { type: "bearer" })
        .expect(401);
  });
  it("isolates every organization route and enforces team administration", async () => {
    await request(app.getHttpServer())
      .get(path("users", other))
      .auth(tokens.admin, { type: "bearer" })
      .expect(403);
    await request(app.getHttpServer())
      .post(path("teams"))
      .auth(tokens.dispatcher, { type: "bearer" })
      .send({ name: "Forbidden Team" })
      .expect(403);
    const r = await request(app.getHttpServer())
      .post(path("teams"))
      .auth(tokens.admin, { type: "bearer" })
      .send({ name: randomUUID() })
      .expect(201);
    await request(app.getHttpServer())
      .patch(path(`teams/${r.body.id}`))
      .auth(tokens.admin, { type: "bearer" })
      .send({ name: randomUUID() })
      .expect(200);
    await request(app.getHttpServer())
      .delete(path(`teams/${r.body.id}`))
      .auth(tokens.admin, { type: "bearer" })
      .expect(204);
  });
  it("customers see only their requests and cannot choose an owner", async () => {
    const user = await db.user.create({
      data: {
        email: `other-${randomUUID()}@example.test`,
        displayName: "Other Customer",
      },
    });
    const role = await db.role.findUniqueOrThrow({
      where: { name: "CUSTOMER" },
    });
    const member = await db.membership.create({
      data: { organizationId: org, userId: user.id, roleId: role.id },
    });
    const customer = await db.customerProfile.create({
      data: { organizationId: org, membershipId: member.id },
    });
    const foreign = await db.maintenanceRequest.create({
      data: {
        organizationId: org,
        customerId: customer.id,
        title: "Private request",
        description: "Private description",
        address: "Private address",
      },
    });
    await get(`requests/${foreign.id}`, "customer").expect(404);
    await get(`requests/${id("aleppo:open:request")}`, "customer").expect(404);
    const body = {
      title: "Cooling failure",
      description: "Inspect noisy compressor",
      address: "Clinic service entrance",
    };
    await request(app.getHttpServer())
      .post(path("requests"))
      .auth(tokens.customer, { type: "bearer" })
      .send({ ...body, customerId: customer.id })
      .expect(400);
    const r = await request(app.getHttpServer())
      .post(path("requests"))
      .auth(tokens.customer, { type: "bearer" })
      .send(body)
      .expect(201);
    expect(r.body.customerId).toBe(id("damascus:customer:profile"));
    const ownOrders = await get("work-orders", "customer").expect(200);
    const foreignOrder = await db.workOrder.create({
      data: {
        organizationId: org,
        requestId: foreign.id,
        title: "Private order",
        description: "Other customer",
      },
    });
    expect(
      ownOrders.body.some((o: { id: string }) => o.id === foreignOrder.id),
    ).toBe(false);
    await get(`work-orders/${foreignOrder.id}`, "customer").expect(404);
  });
  it("technicians access only active assigned jobs and cannot dispatch or verify", async () => {
    await get(`work-orders/${id("damascus:reassigned:order")}`, "tech1").expect(
      404,
    );
    await get(`work-orders/${id("damascus:reassigned:order")}`, "tech2").expect(
      200,
    );
    await get(`work-orders/${id("aleppo:reassigned:order")}`, "tech2").expect(
      404,
    );
    await request(app.getHttpServer())
      .post(path("work-orders"))
      .auth(tokens.tech1, { type: "bearer" })
      .send({
        requestId: id("damascus:open:request"),
        title: "Unauthorized",
        description: "Not allowed",
      })
      .expect(403);
    await request(app.getHttpServer())
      .patch(path(`work-orders/${id("damascus:reassigned:order")}/status`))
      .auth(tokens.tech2, { type: "bearer" })
      .send({ status: "VERIFIED", expectedVersion: 4 })
      .expect(403);
  });
  it("dispatcher creates and assigns work orders while cross-tenant resources stay hidden", async () => {
    const r = await request(app.getHttpServer())
      .post(path("work-orders"))
      .auth(tokens.dispatcher, { type: "bearer" })
      .send({
        requestId: id("damascus:open:request"),
        title: "Scheduled inspection",
        description: "Check equipment safely",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(path(`work-orders/${r.body.id}/assignments`))
      .auth(tokens.dispatcher, { type: "bearer" })
      .send({ technicianId: id("damascus:tech1:profile"), expectedVersion: 0 })
      .expect(201);
    await get(`work-orders/${r.body.id}`, "tech1").expect(200);
    await request(app.getHttpServer())
      .post(path("work-orders"))
      .auth(tokens.dispatcher, { type: "bearer" })
      .send({
        requestId: id("aleppo:open:request"),
        title: "Cross tenant",
        description: "Must fail",
      })
      .expect(404);
  });
  it("admin membership changes apply immediately and last admin is protected", async () => {
    await request(app.getHttpServer())
      .patch(path(`users/${id("damascus:admin")}`))
      .auth(tokens.admin, { type: "bearer" })
      .send({ role: "CUSTOMER", status: "SUSPENDED" })
      .expect(409);
    await request(app.getHttpServer())
      .patch(path(`users/${id("aleppo:dispatcher")}`))
      .auth(tokens.admin, { type: "bearer" })
      .send({ role: "DISPATCHER", status: "SUSPENDED" })
      .expect(400);
    await request(app.getHttpServer())
      .patch(path(`users/${id("damascus:dispatcher")}`))
      .auth(tokens.admin, { type: "bearer" })
      .send({ role: "DISPATCHER", status: "SUSPENDED" })
      .expect(200);
    try {
      await get("work-orders", "dispatcher").expect(403);
    } finally {
      await db.membership.update({
        where: { id: id("damascus:dispatcher") },
        data: { status: "ACTIVE" },
      });
    }
  });
  it("admin adds a registered user to only their organization; non-admin cannot grant roles", async () => {
    await request(app.getHttpServer())
      .post(path("users"))
      .auth(tokens.dispatcher, { type: "bearer" })
      .send({ email, role: "ADMIN", status: "ACTIVE" })
      .expect(403);
    const r = await request(app.getHttpServer())
      .post(path("users"))
      .auth(tokens.admin, { type: "bearer" })
      .send({ email, role: "CUSTOMER", status: "ACTIVE" })
      .expect(201);
    expect(r.body.organizationId).toBe(org);
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(registered.accessToken, { type: "bearer" })
      .expect(200);
    expect(me.body.memberships).toHaveLength(2);
    await request(app.getHttpServer())
      .get(path("users"))
      .auth(registered.accessToken, { type: "bearer" })
      .expect(403);
    await request(app.getHttpServer())
      .get(path("users", registered.organizationId))
      .auth(registered.accessToken, { type: "bearer" })
      .expect(200);
  });
  it("denies expired refresh sessions and disabled identities", async () => {
    const raw = randomBytes(48).toString("base64url");
    const session = await db.authSession.create({
      data: {
        userId: registered.user.id,
        expiresAt: new Date(Date.now() - 1000),
        refreshTokens: {
          create: { tokenHash: createHash("sha256").update(raw).digest("hex") },
        },
      },
    });
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", `fieldops_refresh=${raw}`)
      .expect(401);
    await db.user.update({
      where: { id: registered.user.id },
      data: { isActive: false },
    });
    try {
      await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .auth(registered.accessToken, { type: "bearer" })
        .expect(401);
    } finally {
      await db.user.update({
        where: { id: registered.user.id },
        data: { isActive: true },
      });
    }
    expect(session.expiresAt.getTime()).toBeLessThan(Date.now());
  });
  it("rotation consumes old token; replay revokes its family and access token", async () => {
    const rotated = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", registeredCookie)
      .expect(200);
    expect(cookie(rotated)).not.toBe(registeredCookie);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", registeredCookie)
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", cookie(rotated))
      .expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(rotated.body.accessToken, { type: "bearer" })
      .expect(401);
  });
  it("serializes concurrent refresh and commits replay revocation", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email, password })
      .expect(200);
    const results = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .post("/api/v1/auth/refresh")
          .set("Origin", origin)
          .set("Cookie", cookie(login)),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const success = results.find((r) => r.status === 200)!;
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(success.body.accessToken, { type: "bearer" })
      .expect(401);
  });
  it("logout revokes refresh and access immediately and is idempotent", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .set("Origin", origin)
      .send({ email, password })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .set("Cookie", cookie(login))
      .expect(204);
    await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(login.body.accessToken, { type: "bearer" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", cookie(login))
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Origin", origin)
      .expect(204);
  });
  it("Swagger documents bearer authentication, refresh cookie and DTO schemas", async () => {
    const r = await request(app.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(r.body.components.securitySchemes.bearer).toBeDefined();
    expect(r.body.components.securitySchemes.refreshCookie).toBeDefined();
    expect(r.body.components.schemas.RegisterDto).toBeDefined();
  });
  it("rate limits repeated login attempts", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (
        await request(app.getHttpServer())
          .post("/api/v1/auth/login")
          .set("Origin", origin)
          .send({ email, password: "invalid-password-123" })
      ).status;
    expect(last).toBe(429);
  });
});
