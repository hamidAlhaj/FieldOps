import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
const { seedDatabase, id } = require("../../prisma/seed.cjs");
const origin="http://localhost:5173";

describe("Tracking backend privacy, authorization and lifecycle",()=>{
  const db=new PrismaClient();
  let app:INestApplication;
  const org=id("damascus");
  const orderId=id("damascus:reassigned:order");
  const tokens:Record<string,string>={};
  const endpoint=(suffix:string,organization=org)=>`/api/v1/organizations/${organization}/tracking${suffix}`;
  const post=(p:string,person:string,body:object)=>request(app.getHttpServer()).post(endpoint(p))
    .set("Origin",origin).auth(tokens[person],{type:"bearer"}).send(body);
  const get=(p:string,person:string)=>request(app.getHttpServer()).get(endpoint(p)).auth(tokens[person],{type:"bearer"});
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Dedicated _test database required");
    process.env.JWT_ACCESS_SECRET=randomBytes(64).toString("hex");
    process.env.WEB_ORIGIN=origin;
    await seedDatabase(db);
    const jwt=new JwtService({secret:process.env.JWT_ACCESS_SECRET,
      signOptions:{issuer:"fieldops-api",audience:"fieldops-web",algorithm:"HS256"}});
    for(const person of ["admin","dispatcher","tech1","tech2","customer"]){
      const session=await db.authSession.create({data:{
        userId:id(`damascus:${person}:user`),expiresAt:new Date(Date.now()+3600000)
      }});
      tokens[person]=await jwt.signAsync({sub:id(`damascus:${person}:user`),sid:session.id},{expiresIn:900});
    }
    const module=await Test.createTestingModule({imports:[AppModule]}).compile();
    app=module.createNestApplication();configureApp(app);await app.init();
  });
  afterAll(async()=>{await app?.close();await db.$disconnect()});
  it("requires opt-in, active assignment, and authenticated organization",async()=>{
    await post("/sessions","tech2",{workOrderId:orderId,consent:false}).expect(400);
    await post("/sessions","tech1",{workOrderId:orderId,consent:true}).expect(403);
    await post("/sessions","customer",{workOrderId:orderId,consent:true}).expect(403);
    await request(app.getHttpServer()).post(endpoint("/sessions",id("aleppo")))
      .set("Origin",origin).auth(tokens.tech2,{type:"bearer"})
      .send({workOrderId:orderId,consent:true}).expect(403);
  });
  it("stores a single latest fix, hides coordinates from technician, restricts staff and redacts on stop",async()=>{
    const started=await post("/sessions","tech2",{workOrderId:orderId,consent:true}).expect(201);
    const sessionId=started.body.id as string;
    const recordedAt=new Date().toISOString();
    const first=await post(`/sessions/${sessionId}/location`,"tech2",{
      latitude:35.11,longitude:36.22,accuracyMeters:14,recordedAt
    }).expect(201);
    expect(first.body).not.toHaveProperty("latitude");
    await post(`/sessions/${sessionId}/location`,"tech2",{
      latitude:35.12,longitude:36.23,accuracyMeters:14,recordedAt
    }).expect(409);
    const own=await get("/mine","tech2").expect(200);
    expect(own.body.session.id).toBe(sessionId);
    expect(JSON.stringify(own.body)).not.toContain("35.11");
    await get("/locations","customer").expect(403);
    await get("/locations","tech1").expect(403);
    const staff=await get("/locations","dispatcher").expect(200);
    expect(staff.body.sessions.find((s:{id:string})=>s.id===sessionId).latitude).toBe(35.11);
    await request(app.getHttpServer()).delete(endpoint(`/sessions/${sessionId}`))
      .set("Origin",origin).auth(tokens.tech2,{type:"bearer"}).expect(204);
    const stored=await db.trackingSession.findUniqueOrThrow({where:{id:sessionId}});
    expect(stored.latitude).toBeNull();
    expect(stored.longitude).toBeNull();
    expect(stored.endedAt).toBeTruthy();
    expect(await db.technicianLocationUpdate.count({where:{organizationId:org,technicianId:id("damascus:tech2:profile")}})).toBeGreaterThanOrEqual(1);
    await get("/mine","tech2").expect(200);
    await post(`/sessions/${sessionId}/location`,"tech2",{
      latitude:35.11,longitude:36.22,accuracyMeters:14,recordedAt:new Date().toISOString()
    }).expect(404);
  });
});
