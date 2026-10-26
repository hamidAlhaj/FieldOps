import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleName, TechnicianAvailabilityStatus } from "@prisma/client";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { event } from "../realtime/events";
import { AvailabilityDto, OrderSkillsDto, ScheduleDto, SkillIdsDto, SkillNameDto, TimeOffDto } from "./scheduling.dto";
import { assertAvailableWindow, parseUtcInstant, scheduleWindow, validTimeZone, validatedHours, type WorkingHour } from "./scheduling.policy";

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma:PrismaService){}
  private async actor(tx:Prisma.TransactionClient,c:OrganizationContext,roles:RoleName[]){
    const member=await tx.membership.findUnique({
      where:{organizationId_userId:{organizationId:c.organizationId,userId:c.actorId}},
      include:{role:true,user:{select:{isActive:true}}}
    });
    if(!member||member.status!=="ACTIVE"||!member.user.isActive||!roles.includes(member.role.name))throw new ForbiddenException();
    return member;
  }
  private async self(tx:Prisma.TransactionClient,c:OrganizationContext){
    const member=await this.actor(tx,c,["TECHNICIAN"]);
    const tech=await tx.technicianProfile.findFirst({where:{organizationId:c.organizationId,membershipId:member.id}});
    if(!tech)throw new ForbiddenException();
    return tech.id;
  }
  async lockTechnician(tx:Prisma.TransactionClient,c:OrganizationContext,id:string){
    const rows=await tx.$queryRaw<Array<{id:string}>>`
      SELECT id FROM "TechnicianProfile" WHERE "organizationId"=${c.organizationId}::uuid AND id=${id}::uuid FOR UPDATE
    `;
    if(!rows.length)throw new NotFoundException("Technician unavailable");
  }
  private async profile(tx:Prisma.TransactionClient,c:OrganizationContext,id:string){
    const tech=await tx.technicianProfile.findFirst({
      where:{id,organizationId:c.organizationId,
        membership:{status:"ACTIVE",role:{name:"TECHNICIAN"},user:{isActive:true}}},
      include:{availability:true}
    });
    if(!tech)throw new ConflictException("Active technician required");
    return tech;
  }
  async assertAssignable(tx:Prisma.TransactionClient,c:OrganizationContext,technicianId:string,
    start:Date|null,end:Date|null,orderId:string,skillsOverride?:string[]){
    const tech=await this.profile(tx,c,technicianId);
    if(tech.availability && tech.availability.status!=="AVAILABLE")
      throw new ConflictException("Technician is unavailable or off duty");
    const required=skillsOverride??(await tx.workOrderSkill.findMany({where:{organizationId:c.organizationId,workOrderId:orderId},select:{skillId:true}})).map(s=>s.skillId);
    if(required.length){
      const owned=await tx.technicianSkill.count({
        where:{organizationId:c.organizationId,technicianId,skillId:{in:required}},
      });
      if(owned!==required.length)throw new ConflictException("Technician is missing required skills");
    }
    if(start&&end){
      const timeOff=await tx.technicianTimeOff.count({where:{
        organizationId:c.organizationId,technicianId,
        startAt:{lt:end},endAt:{gt:start},
      }});
      if(timeOff)throw new ConflictException("Schedule overlaps technician time off");
      assertAvailableWindow(start,end,validTimeZone(tech.timeZone),
        (tech.availability?.weeklyHours??[]) as WorkingHour[]);
      const conflict=await tx.assignment.findFirst({
        where:{organizationId:c.organizationId,technicianId,status:"ACTIVE",
          workOrderId:{not:orderId},
          windowStartAt:{lt:end},windowEndAt:{gt:start}},
        select:{workOrderId:true},
      });
      if(conflict)throw new ConflictException("Technician already has an overlapping assignment");
    }
  }
  async list(c:OrganizationContext){
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN","DISPATCHER"]);
      const now=new Date();
      const technicians=await tx.technicianProfile.findMany({
        where:{organizationId:c.organizationId,membership:{status:"ACTIVE",role:{name:"TECHNICIAN"},user:{isActive:true}}},
        include:{
          membership:{include:{user:{select:{displayName:true}}}},
          availability:true,timeOff:{where:{endAt:{gt:now}},orderBy:{startAt:"asc"},take:100},
          skills:{include:{skill:true}},
          assignments:{where:{status:"ACTIVE"},include:{workOrder:{select:{title:true,status:true,scheduledAt:true,plannedEndAt:true}}}},
        },take:100,
      });
      return technicians.map(t=>this.summary(t,now));
    });
  }
  private summary(t:Awaited<ReturnType<typeof this.profile>> & {
    membership?:{user:{displayName:string}},timeOff?:{id:string;startAt:Date;endAt:Date;reason:string|null}[],
    skills?:{skill:{id:string;name:string}}[], assignments?:{workOrder:{title:string;status:string;scheduledAt:Date|null;plannedEndAt:Date|null}}[]
  },now:Date){
    const busy=t.assignments?.some(a=>a.workOrder.status==="IN_PROGRESS"||
      (!!a.workOrder.scheduledAt&&!!a.workOrder.plannedEndAt&&a.workOrder.scheduledAt<=now&&a.workOrder.plannedEndAt>now));
    const currentlyOff=t.timeOff?.some(t=>t.startAt<=now&&t.endAt>now);
    return {
      id:t.id,employeeCode:t.employeeCode,name:t.membership?.user.displayName??"",
      timeZone:t.timeZone,
      status:busy?"BUSY":currentlyOff?"OFF_DUTY":t.availability?.status??"AVAILABLE",
      declaredStatus:t.availability?.status??"AVAILABLE",
      weeklyHours:t.availability?.weeklyHours??[],
      timeOff:t.timeOff??[],skills:t.skills?.map(s=>s.skill)??[],
      assignments:t.assignments??[],
    };
  }
  async mine(c:OrganizationContext){
    return this.prisma.forOrganization(c,async tx=>{
      const id=await this.self(tx,c);
      const now=new Date();
      const t=await tx.technicianProfile.findFirstOrThrow({
        where:{id,organizationId:c.organizationId},
        include:{availability:true,membership:{include:{user:{select:{displayName:true}}}},
          timeOff:{where:{endAt:{gt:now}},orderBy:{startAt:"asc"}},
          skills:{include:{skill:true}},
          assignments:{where:{status:"ACTIVE"},include:{workOrder:{select:{title:true,status:true,scheduledAt:true,plannedEndAt:true}}}},
        }
      });
      return this.summary(t,now);
    });
  }
  private async updateAvailability(tx:Prisma.TransactionClient,c:OrganizationContext,id:string,dto:AvailabilityDto){
    await this.lockTechnician(tx,c,id);
    await this.profile(tx,c,id);
    const weekly=validatedHours(dto.weeklyHours);
    const zone=validTimeZone(dto.timeZone);
    const now=new Date();
    const future=await tx.assignment.findMany({where:{organizationId:c.organizationId,technicianId:id,status:"ACTIVE",
      windowEndAt:{gt:now},windowStartAt:{not:null}},select:{windowStartAt:true,windowEndAt:true}});
    if(dto.status!=="AVAILABLE"&&future.length)throw new ConflictException("Active reservations prevent becoming unavailable");
    if(dto.status==="AVAILABLE"){
      for(const a of future){
        if(a.windowStartAt&&a.windowEndAt)
          assertAvailableWindow(a.windowStartAt,a.windowEndAt,zone,weekly);
      }
    }
    await tx.technicianProfile.update({where:{id},data:{timeZone:zone}});
    await tx.technicianAvailability.upsert({
      where:{organizationId_technicianId:{organizationId:c.organizationId,technicianId:id}},
      create:{organizationId:c.organizationId,technicianId:id,status:dto.status,weeklyHours:weekly as unknown as Prisma.InputJsonValue},
      update:{status:dto.status,weeklyHours:weekly as unknown as Prisma.InputJsonValue},
    });
    await event(tx,c.organizationId,"TechnicianProfile",id,"technician.availability.changed");
    return {id,status:dto.status,timeZone:zone,weeklyHours:weekly};
  }
  async availability(c:OrganizationContext,id:string,dto:AvailabilityDto,admin:boolean){
    return this.prisma.forOrganization(c,async tx=>{
      if(admin)await this.actor(tx,c,["ADMIN"]);
      else if(await this.self(tx,c)!==id)throw new ForbiddenException();
      return this.updateAvailability(tx,c,id,dto);
    });
  }
  async myAvailability(c:OrganizationContext,dto:AvailabilityDto){
    return this.prisma.forOrganization(c,async tx=>{
      const id=await this.self(tx,c);
      return this.updateAvailability(tx,c,id,dto);
    });
  }
  async addTimeOff(c:OrganizationContext,dto:TimeOffDto,id?:string){
    const start=parseUtcInstant(dto.startAt),end=parseUtcInstant(dto.endAt);
    if(end<=start||end.getTime()-start.getTime()>366*86400000)throw new BadRequestException("Invalid time off interval");
    return this.prisma.forOrganization(c,async tx=>{
      const technicianId=id??await this.self(tx,c);
      if(id)await this.actor(tx,c,["ADMIN"]);
      await this.lockTechnician(tx,c,technicianId);
      await this.profile(tx,c,technicianId);
      const overlap=await tx.assignment.count({where:{organizationId:c.organizationId,technicianId,status:"ACTIVE",
        windowStartAt:{lt:end},windowEndAt:{gt:start}}});
      if(overlap)throw new ConflictException("Time off overlaps an assigned work order");
      const row=await tx.technicianTimeOff.create({data:{organizationId:c.organizationId,technicianId,startAt:start,endAt:end,reason:dto.reason?.trim()}});
      await event(tx,c.organizationId,"TechnicianProfile",technicianId,"technician.time-off.changed");
      return row;
    });
  }
  async removeTimeOff(c:OrganizationContext,id:string,admin:boolean){
    return this.prisma.forOrganization(c,async tx=>{
      const member=await this.actor(tx,c,admin?["ADMIN"]:["TECHNICIAN"]);
      const row=await tx.technicianTimeOff.findFirst({where:{id,organizationId:c.organizationId}});
      if(!row)throw new NotFoundException();
      if(!admin){
        const profile=await tx.technicianProfile.findFirst({where:{id:row.technicianId,membershipId:member.id}});
        if(!profile)throw new ForbiddenException();
      }
      await this.lockTechnician(tx,c,row.technicianId);
      await tx.technicianTimeOff.delete({where:{id}});
      await event(tx,c.organizationId,"TechnicianProfile",row.technicianId,"technician.time-off.changed");
    });
  }
  async skills(c:OrganizationContext){
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN","DISPATCHER","TECHNICIAN"]);
      return tx.skill.findMany({where:{organizationId:c.organizationId},orderBy:{name:"asc"},take:200});
    });
  }
  async createSkill(c:OrganizationContext,dto:SkillNameDto){
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN"]);
      const name=dto.name.trim();
      if(name.length<2)throw new BadRequestException("Skill name required");
      const exists=await tx.skill.findFirst({where:{organizationId:c.organizationId,name:{equals:name,mode:"insensitive"}}});
      if(exists)throw new ConflictException("Skill already exists");
      const created=await tx.skill.create({data:{organizationId:c.organizationId,name}});
      await event(tx,c.organizationId,"Skill",created.id,"skill.created");
      return created;
    });
  }
  private async checkSkillsExist(tx:Prisma.TransactionClient,c:OrganizationContext,ids:string[]){
    if((await tx.skill.count({where:{organizationId:c.organizationId,id:{in:ids}}}))!==ids.length)
      throw new BadRequestException("Skill identifiers must belong to this organization");
  }
  async technicianSkills(c:OrganizationContext,id:string,dto:SkillIdsDto){
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN"]);
      await this.lockTechnician(tx,c,id);
      await this.profile(tx,c,id);
      await this.checkSkillsExist(tx,c,dto.skillIds);
      const assignments=await tx.assignment.findMany({where:{organizationId:c.organizationId,technicianId:id,status:"ACTIVE"},
        include:{workOrder:{include:{requiredSkills:true}}}});
      for(const a of assignments){
        if(a.workOrder.requiredSkills.some(s=>!dto.skillIds.includes(s.skillId)))
          throw new ConflictException("Cannot remove skills required by active assignments");
      }
      await tx.technicianSkill.deleteMany({where:{organizationId:c.organizationId,technicianId:id}});
      if(dto.skillIds.length)await tx.technicianSkill.createMany({data:dto.skillIds.map(skillId=>({organizationId:c.organizationId,technicianId:id,skillId}))});
      await event(tx,c.organizationId,"TechnicianProfile",id,"technician.skills.changed");
      return {technicianId:id,skillIds:dto.skillIds};
    });
  }
  async orderSkills(c:OrganizationContext,id:string,dto:OrderSkillsDto){
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN","DISPATCHER"]);
      // Follow the same lock order as assigning and scheduling.
      const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "WorkOrder" WHERE id=${id}::uuid AND "organizationId"=${c.organizationId}::uuid FOR UPDATE`;
      if(!rows.length)throw new NotFoundException();
      const order=await tx.workOrder.findUniqueOrThrow({where:{id}});
      if(order.version!==dto.expectedVersion||!["OPEN","ASSIGNED","IN_PROGRESS"].includes(order.status))
        throw new ConflictException("Work order changed or is terminal");
      await this.checkSkillsExist(tx,c,dto.skillIds);
      const active=await tx.assignment.findFirst({where:{organizationId:c.organizationId,workOrderId:id,status:"ACTIVE"}});
      if(active){
        await this.lockTechnician(tx,c,active.technicianId);
        await this.assertAssignable(tx,c,active.technicianId,order.plannedEndAt?order.scheduledAt:null,order.plannedEndAt,id,dto.skillIds);
      }
      await tx.workOrderSkill.deleteMany({where:{organizationId:c.organizationId,workOrderId:id}});
      if(dto.skillIds.length)await tx.workOrderSkill.createMany({data:dto.skillIds.map(skillId=>({organizationId:c.organizationId,workOrderId:id,skillId}))});
      await tx.workOrder.update({where:{id},data:{version:{increment:1}}});
      await event(tx,c.organizationId,"WorkOrder",id,"work-order.skills.changed",order.version+1);
      return {id,skillIds:dto.skillIds,version:order.version+1};
    });
  }
  async schedule(c:OrganizationContext,id:string,dto:ScheduleDto){
    const {start,end}=scheduleWindow(dto.plannedStartAt,dto.plannedEndAt,dto.estimatedDurationMinutes);
    return this.prisma.forOrganization(c,async tx=>{
      await this.actor(tx,c,["ADMIN","DISPATCHER"]);
      const locked=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM "WorkOrder" WHERE id=${id}::uuid AND "organizationId"=${c.organizationId}::uuid FOR UPDATE`;
      if(!locked.length)throw new NotFoundException();
      const order=await tx.workOrder.findUniqueOrThrow({where:{id}});
      if(order.version!==dto.expectedVersion||!["OPEN","ASSIGNED","IN_PROGRESS"].includes(order.status))
        throw new ConflictException("Work order version stale or status terminal");
      const active=await tx.assignment.findFirst({where:{organizationId:c.organizationId,workOrderId:id,status:"ACTIVE"}});
      if(active){
        await this.lockTechnician(tx,c,active.technicianId);
        await this.assertAssignable(tx,c,active.technicianId,start,end,id);
      }
      // DB trigger syncs reservation snapshot, GiST exclusion prevents races.
      const updated=await tx.workOrder.update({where:{id},data:{
        scheduledAt:start,plannedEndAt:end,estimatedDurationMinutes:dto.estimatedDurationMinutes,
        version:{increment:1}
      }});
      await tx.auditLog.create({data:{organizationId:c.organizationId,
        actorId:(await tx.membership.findUniqueOrThrow({where:{organizationId_userId:{organizationId:c.organizationId,userId:c.actorId}}})).id,
        entityType:"WorkOrder",entityId:id,action:"WORK_ORDER_SCHEDULED",
        metadata:{plannedStartAt:start.toISOString(),plannedEndAt:end.toISOString(),estimatedDurationMinutes:dto.estimatedDurationMinutes}}});
      await event(tx,c.organizationId,"WorkOrder",id,"work-order.scheduled",updated.version);
      return updated;
    });
  }
}
