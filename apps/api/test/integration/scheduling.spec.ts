import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/config/configure-app";
import { PrismaService } from "../../src/prisma/prisma.service";
const { seedDatabase,id }=require("../../prisma/seed.cjs");
const origin="http://localhost:5173";
describe("Stage 6B scheduling: PostgreSQL exclusion, RLS, roles, time-off",()=>{
  const db=new PrismaClient();
  let app:INestApplication;
  let jwt:JwtService;
  const org=id("damascus");
  const tech1=id("damascus:tech1:profile");
  const tech2=id("damascus:tech2:profile");
  const token:Record<string,string>={};
  const url=(suffix:string,tenant=org)=>`/api/v1/organizations/${tenant}${suffix}`;
  const send=(method:"post"|"patch"|"put"|"delete",path:string,body:object,role="dispatcher",tenant=org)=>
    request(app.getHttpServer())[method](url(path,tenant)).set("Origin",origin)
      .auth(token[role],{type:"bearer"}).send(body);
  const get=(path:string,role="dispatcher",tenant=org)=>request(app.getHttpServer()).get(url(path,tenant)).auth(token[role],{type:"bearer"});
  async function makeOrder(){
    const r=(await send("post","/requests",{
      title:"Scheduling API fixture",description:"A planned visit for conflict validation",address:"Service building"
    },"customer").expect(201)).body;
    await send("post",`/requests/${r.id}/review`,{expectedVersion:r.version,note:"Accepted for scheduling tests"}).expect(201);
    const order=(await send("post","/work-orders",{requestId:r.id,title:"Test service visit",description:"Schedule securely"}).expect(201)).body;
    return order.id as string;
  }
  const windowAt=(hoursAhead:number)=>{
    const start=new Date(Date.now()+hoursAhead*3600000);
    start.setUTCSeconds(0,0);
    const end=new Date(start.getTime()+3600000);
    return {plannedStartAt:start.toISOString(),plannedEndAt:end.toISOString(),estimatedDurationMinutes:60};
  };
  async function schedule(orderId:string,at:ReturnType<typeof windowAt>,version=0,role="dispatcher"){
    return send("patch",`/scheduling/work-orders/${orderId}/schedule`,{expectedVersion:version,...at},role);
  }
  beforeAll(async()=>{
    if(!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))throw new Error("_test database required");
    process.env.JWT_ACCESS_SECRET=randomBytes(64).toString("hex");
    process.env.WEB_ORIGIN=origin;
    await db.$connect();await seedDatabase(db);
    jwt=new JwtService({secret:process.env.JWT_ACCESS_SECRET,
      signOptions:{issuer:"fieldops-api",audience:"fieldops-web",algorithm:"HS256"}});
    for(const person of ["admin","dispatcher","tech1","tech2","customer"]){
      const session=await db.authSession.create({data:{
        userId:id(`damascus:${person}:user`),expiresAt:new Date(Date.now()+3600000)
      }});
      token[person]=await jwt.signAsync({sub:id(`damascus:${person}:user`),sid:session.id},{expiresIn:900});
    }
    const mod=await Test.createTestingModule({imports:[AppModule]}).compile();
    app=mod.createNestApplication();configureApp(app);await app.init();
  });
  afterAll(async()=>{await app?.close();await db.$disconnect();});
  it("requires roles, correct tenant and expected work-order versions",async()=>{
    const order=await makeOrder(),slot=windowAt(48);
    await schedule(order,slot,0,"customer").expect(403);
    await schedule(order,slot,0,"tech1").expect(403);
    await send("patch",`/scheduling/work-orders/${order}/schedule`,{expectedVersion:0,...slot},"dispatcher",id("aleppo")).expect(403);
    await schedule(order,slot).expect(200);
    await schedule(order,slot).expect(409);
    await get("/scheduling/technicians","customer").expect(403);
    await get("/scheduling/me","tech1").expect(200);
    await send("post","/scheduling/skills",{name:"Electrical"},"dispatcher").expect(403);
  });
  it("enforces skills before accepting assignment and preserves assignment history",async()=>{
    const skill=(await send("post","/scheduling/skills",{name:"Scheduling HVAC certified"},"admin").expect(201)).body;
    const order=await makeOrder();
    await send("put",`/scheduling/work-orders/${order}/skills`,{expectedVersion:0,skillIds:[skill.id]}).expect(200);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:1,technicianId:tech1}).expect(409);
    await send("put",`/scheduling/technicians/${tech1}/skills`,{skillIds:[skill.id]},"admin").expect(200);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:1,technicianId:tech1}).expect(201);
    await send("put",`/scheduling/technicians/${tech1}/skills`,{skillIds:[]},"admin").expect(409);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:2,technicianId:tech2,reason:"Schedule reassignment"}).expect(409);
    await send("put",`/scheduling/technicians/${tech2}/skills`,{skillIds:[skill.id]},"admin").expect(200);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:2,technicianId:tech2,reason:"Schedule reassignment"}).expect(201);
    const assignments=await db.assignment.findMany({where:{workOrderId:order},orderBy:{createdAt:"asc"}});
    expect(assignments).toHaveLength(2);
    expect(assignments.some(a=>a.status==="REASSIGNED")).toBe(true);
  });
  it("prevents conflicting time off and supports timezone-aware weekly shifts",async()=>{
    const order=await makeOrder();
    const slot=windowAt(72);
    await schedule(order,slot).expect(200);
    await send("put",`/scheduling/technicians/${tech1}/availability`,{
      status:"AVAILABLE",timeZone:"UTC",
      weeklyHours:Array.from({length:7},(_,day)=>({day,startMinute:0,endMinute:1440}))
    },"admin").expect(200);
    await send("post",`/scheduling/technicians/${tech1}/time-off`,{
      startAt:slot.plannedStartAt,endAt:slot.plannedEndAt,reason:"Vacation"
    },"admin").expect(201);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:1,technicianId:tech1}).expect(409);
    const changed=await db.technicianTimeOff.findFirstOrThrow({where:{technicianId:tech1,startAt:new Date(slot.plannedStartAt)}});
    await send("delete",`/scheduling/time-off/${changed.id}`,{},"admin").expect(204);
    await send("post",`/work-orders/${order}/assignments`,{expectedVersion:1,technicianId:tech1}).expect(201);
    await send("post",`/scheduling/technicians/${tech1}/time-off`,{
      startAt:slot.plannedStartAt,endAt:slot.plannedEndAt
    },"admin").expect(409);
    await send("put",`/scheduling/technicians/${tech1}/availability`,{
      status:"UNAVAILABLE",timeZone:"UTC",weeklyHours:[]
    },"admin").expect(409);
  });
  it("rejects overlapping active assignments and permits back-to-back reservations",async()=>{
    const first=await makeOrder(),second=await makeOrder(),third=await makeOrder();
    const slot=windowAt(96);
    await schedule(first,slot).expect(200);
    await schedule(second,slot).expect(200);
    const next={...slot,plannedStartAt:slot.plannedEndAt,
      plannedEndAt:new Date(new Date(slot.plannedEndAt).getTime()+3600000).toISOString()};
    await schedule(third,next).expect(200);
    await send("post",`/work-orders/${first}/assignments`,{expectedVersion:1,technicianId:tech2}).expect(201);
    await send("post",`/work-orders/${second}/assignments`,{expectedVersion:1,technicianId:tech2}).expect(409);
    await send("post",`/work-orders/${third}/assignments`,{expectedVersion:1,technicianId:tech2}).expect(201);
    // Database constraint, not only application preflight.
    const other=await db.workOrder.findUniqueOrThrow({where:{id:second}});
    await expect(db.assignment.create({data:{
      organizationId:org,workOrderId:other.id,technicianId:tech2,
      assignedById:id("damascus:dispatcher"),status:"ACTIVE"
    }})).rejects.toThrow();
  });
  it("conflicting concurrent requests cannot both reserve same technician",async()=>{
    const first=await makeOrder(),second=await makeOrder(),slot=windowAt(120);
    await schedule(first,slot).expect(200);await schedule(second,slot).expect(200);
    const outcomes=await Promise.all([
      send("post",`/work-orders/${first}/assignments`,{expectedVersion:1,technicianId:tech2}),
      send("post",`/work-orders/${second}/assignments`,{expectedVersion:1,technicianId:tech2}),
    ]);
    expect(outcomes.filter(x=>x.status===201)).toHaveLength(1);
    expect(outcomes.filter(x=>x.status===409)).toHaveLength(1);
    const active=await db.assignment.count({where:{technicianId:tech2,status:"ACTIVE",
      windowStartAt:new Date(slot.plannedStartAt)}});
    expect(active).toBe(1);
  });
  it("PostgreSQL tenant RLS prevents foreign reads and writes",async()=>{
    const scoped=app.get(PrismaService);
    const adminSkill=(await send("post","/scheduling/skills",{name:"RLS scheduling skill"},"admin").expect(201)).body;
    const other=await scoped.forOrganization({organizationId:id("aleppo"),actorId:id("aleppo:dispatcher:user")},async tx=>{
      const rows=await tx.skill.findMany({where:{id:adminSkill.id}});
      const updated=await tx.skill.updateMany({where:{id:adminSkill.id},data:{name:"tampered"}});
      return {rows,count:updated.count};
    });
    expect(other.rows).toHaveLength(0);
    expect(other.count).toBe(0);
    await send("put",`/scheduling/technicians/${tech1}/availability`,{
      status:"AVAILABLE",timeZone:"Fake/Zone",weeklyHours:[]
    },"admin").expect(400);
  });
});
