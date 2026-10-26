import { ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { LocationDto, StartTrackingDto } from "./tracking.dto";

const LEASE_MS = 120_000;
const SAMPLE_INTERVAL_MS = 15_000;
const fresh = (now: Date) => new Date(now.getTime()+LEASE_MS);
const redacted = { latitude:null, longitude:null, accuracyMeters:null, recordedAt:null, receivedAt:null } as const;

@Injectable()
export class TrackingService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  // Only a scheduled worker uses the owner connection; no request/coordinate reads through it.
  private readonly cleanupDb = new PrismaClient();
  private sweeping=false;
  constructor(private readonly prisma: PrismaService) {}
  onModuleInit() {
    this.timer=setInterval(()=>{void this.sweep();},15000);
    this.timer.unref?.();
  }
  private async sweep(){
    if(this.sweeping)return;
    this.sweeping=true;
    try {
      await this.cleanupDb.trackingSession.updateMany({
        where:{endedAt:null,expiresAt:{lte:new Date()}},
        data:{endedAt:new Date(),...redacted}
      });
    }catch {
      // Avoid sensitive record contents in operational logs.
    }finally{this.sweeping=false;}
  }
  async onModuleDestroy(){
    if(this.timer)clearInterval(this.timer);
    await this.cleanupDb.$disconnect();
  }
  private async technician(tx:Prisma.TransactionClient,c:OrganizationContext){
    const m=await tx.membership.findUnique({
      where:{organizationId_userId:{organizationId:c.organizationId,userId:c.actorId}},
      include:{role:true,technician:true,user:{select:{isActive:true}}}
    });
    if(!m || m.status!=="ACTIVE" || !m.user.isActive || m.role.name!=="TECHNICIAN" || !m.technician) throw new ForbiddenException();
    return m.technician;
  }
  private async validAssignment(tx:Prisma.TransactionClient,c:OrganizationContext,technicianId:string,workOrderId:string){
    const a=await tx.assignment.findFirst({
      where:{
        organizationId:c.organizationId,technicianId,workOrderId,status:"ACTIVE",
        acceptedAt:{not:null},
        workOrder:{status:"IN_PROGRESS"}
      }
    });
    if(!a)throw new ForbiddenException("Active, accepted and started assignment required");
    return a;
  }
  private session(s:{id:string;workOrderId:string;expiresAt:Date;recordedAt:Date|null;receivedAt:Date|null}){
    return {id:s.id,workOrderId:s.workOrderId,expiresAt:s.expiresAt.toISOString(),recordedAt:s.recordedAt?.toISOString()??null,receivedAt:s.receivedAt?.toISOString()??null};
  }
  async start(c:OrganizationContext,dto:StartTrackingDto){
    if(dto.consent!==true)throw new ForbiddenException("Explicit consent required");
    return this.prisma.forOrganization(c,async tx=>{
      const tech=await this.technician(tx,c);
      const assignment=await this.validAssignment(tx,c,tech.id,dto.workOrderId);
      const now=new Date();
      // Serialize starts and stop/reassignment against the parent assignment row.
      await tx.$queryRaw`SELECT id FROM "Assignment" WHERE id=${assignment.id}::uuid FOR UPDATE`;
      const old=await tx.trackingSession.findMany({
        where:{organizationId:c.organizationId,technicianId:tech.id,endedAt:null}
      });
      for(const s of old){
        await tx.trackingSession.update({where:{id:s.id},data:{endedAt:now,...redacted}});
      }
      const s=await tx.trackingSession.create({data:{
        organizationId:c.organizationId,assignmentId:assignment.id,
        workOrderId:assignment.workOrderId,technicianId:tech.id,
        consentedAt:now,expiresAt:fresh(now)
      }});
      return this.session(s);
    });
  }
  async stop(c:OrganizationContext,id:string){
    return this.prisma.forOrganization(c,async tx=>{
      const tech=await this.technician(tx,c);
      await tx.trackingSession.updateMany({
        where:{id,organizationId:c.organizationId,technicianId:tech.id,endedAt:null},
        data:{endedAt:new Date(),...redacted}
      });
      // Idempotent for own sessions; other IDs are deliberately indistinguishable.
    });
  }
  async sample(c:OrganizationContext,id:string,dto:LocationDto){
    return this.prisma.forOrganization(c,async tx=>{
      const tech=await this.technician(tx,c);
      const now=new Date();
      const s=await tx.trackingSession.findFirst({where:{
        id,organizationId:c.organizationId,technicianId:tech.id,endedAt:null
      }});
      if(!s)throw new NotFoundException("Tracking session unavailable");
      // Synchronize against assignment mutations, including lifecycle updates.
      await tx.$queryRaw`SELECT id FROM "Assignment" WHERE id=${s.assignmentId}::uuid FOR UPDATE`;
      await this.validAssignment(tx,c,tech.id,s.workOrderId);
      if(s.expiresAt<=now){
        await tx.trackingSession.update({where:{id},data:{endedAt:now,...redacted}});
        throw new ConflictException("Tracking session expired");
      }
      const recorded=new Date(dto.recordedAt);
      if(!Number.isFinite(recorded.getTime())||recorded.getTime()>now.getTime()+5000||now.getTime()-recorded.getTime()>30000)
        throw new ConflictException("Stale or future location");
      if(s.receivedAt && now.getTime()-s.receivedAt.getTime()<SAMPLE_INTERVAL_MS)
        throw new ConflictException("Location rate exceeded");
      if(s.recordedAt && recorded<=s.recordedAt) throw new ConflictException("Nonmonotonic location");
      const changed=await tx.trackingSession.updateMany({where:{
        id,organizationId:c.organizationId,technicianId:tech.id,endedAt:null,expiresAt:{gt:now}
      },data:{
        latitude:dto.latitude,longitude:dto.longitude,accuracyMeters:dto.accuracyMeters,
        recordedAt:recorded,receivedAt:now,expiresAt:fresh(now)
      }});
      if(!changed.count)throw new ConflictException("Tracking no longer available");
      const updated=await tx.trackingSession.findUniqueOrThrow({where:{id}});
      return this.session(updated);
    });
  }
  async mine(c:OrganizationContext){
    return this.prisma.forOrganization(c,async tx=>{
      const tech=await this.technician(tx,c);
      const now=new Date();
      const sessions=await tx.trackingSession.findMany({where:{
        organizationId:c.organizationId,technicianId:tech.id,endedAt:null,expiresAt:{gt:now},
        assignment:{status:"ACTIVE",acceptedAt:{not:null},workOrder:{status:"IN_PROGRESS"}}
      },orderBy:{consentedAt:"desc"},take:1});
      return {session:sessions[0]?this.session(sessions[0]):null,serverTime:now.toISOString()};
    });
  }
  async locations(c:OrganizationContext){
    return this.prisma.forOrganization(c,async tx=>{
      const member=await tx.membership.findUniqueOrThrow({
        where:{organizationId_userId:{organizationId:c.organizationId,userId:c.actorId}},
        include:{role:true}
      });
      if(!["ADMIN","DISPATCHER"].includes(member.role.name))throw new ForbiddenException();
      const now=new Date();
      const sessions=await tx.trackingSession.findMany({
        where:{organizationId:c.organizationId,endedAt:null,expiresAt:{gt:now},
          assignment:{status:"ACTIVE",acceptedAt:{not:null},workOrder:{status:"IN_PROGRESS"},
            technician:{membership:{status:"ACTIVE",role:{name:"TECHNICIAN"},user:{isActive:true}}}
          }
        },include:{technician:{include:{membership:{include:{user:{select:{displayName:true}}}}}},workOrder:{select:{title:true}}},
        orderBy:{consentedAt:"desc"},take:100
      });
      return {serverTime:now.toISOString(),sessions:sessions.map(s=>({
        id:s.id,workOrderId:s.workOrderId,technicianId:s.technicianId,
        technicianName:s.technician.membership.user.displayName,workOrderTitle:s.workOrder.title,
        latitude:s.latitude,longitude:s.longitude,accuracyMeters:s.accuracyMeters,
        recordedAt:s.recordedAt?.toISOString()??null,receivedAt:s.receivedAt?.toISOString()??null,
        expiresAt:s.expiresAt.toISOString(),
        stale:!s.receivedAt || now.getTime()-s.receivedAt.getTime()>30000
      }))};
    });
  }
}
