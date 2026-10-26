import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/auth.decorators";
import { AuthRequest } from "../auth/auth.types";
import { AvailabilityDto, OrderSkillsDto, ScheduleDto, SkillIdsDto, SkillNameDto, TimeOffDto } from "./scheduling.dto";
import { SchedulingService } from "./scheduling.service";

@ApiTags("Scheduling") @ApiBearerAuth()
@Controller("organizations/:organizationId/scheduling")
export class SchedulingController {
  constructor(private readonly service:SchedulingService){}
  private context(r:AuthRequest){return {organizationId:r.params.organizationId as string,actorId:r.user.id};}
  @Get("technicians") @Roles("ADMIN","DISPATCHER")
  technicians(@Req() r:AuthRequest){return this.service.list(this.context(r));}
  @Get("me") @Roles("TECHNICIAN")
  me(@Req() r:AuthRequest){return this.service.mine(this.context(r));}

  @Put("me/availability") @Roles("TECHNICIAN")
  myAvailability(@Req() r:AuthRequest,@Body() dto:AvailabilityDto){
    return this.service.myAvailability(this.context(r),dto);
  }
  @Put("technicians/:id/availability") @Roles("ADMIN")
  availability(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:AvailabilityDto){
    return this.service.availability(this.context(r),id,dto,true);
  }
  @Post("me/time-off") @Roles("TECHNICIAN")
  myTimeOff(@Req() r:AuthRequest,@Body() dto:TimeOffDto){
    return this.service.addTimeOff(this.context(r),dto);
  }
  @Post("technicians/:id/time-off") @Roles("ADMIN")
  timeOff(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:TimeOffDto){
    return this.service.addTimeOff(this.context(r),dto,id);
  }
  @Delete("me/time-off/:id") @HttpCode(204) @Roles("TECHNICIAN")
  removeOwnTimeOff(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string){
    return this.service.removeTimeOff(this.context(r),id,false);
  }
  @Delete("time-off/:id") @HttpCode(204) @Roles("ADMIN")
  removeTimeOff(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string){
    return this.service.removeTimeOff(this.context(r),id,true);
  }
  @Get("skills") @Roles("ADMIN","DISPATCHER","TECHNICIAN")
  skills(@Req() r:AuthRequest){return this.service.skills(this.context(r));}
  @Post("skills") @Roles("ADMIN")
  createSkill(@Req() r:AuthRequest,@Body() dto:SkillNameDto){
    return this.service.createSkill(this.context(r),dto);
  }
  @Put("technicians/:id/skills") @Roles("ADMIN")
  technicianSkills(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:SkillIdsDto){
    return this.service.technicianSkills(this.context(r),id,dto);
  }
  @Put("work-orders/:id/skills") @Roles("ADMIN","DISPATCHER")
  orderSkills(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:OrderSkillsDto){
    return this.service.orderSkills(this.context(r),id,dto);
  }
  @Patch("work-orders/:id/schedule") @Roles("ADMIN","DISPATCHER")
  schedule(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:ScheduleDto){
    return this.service.schedule(this.context(r),id,dto);
  }
}
