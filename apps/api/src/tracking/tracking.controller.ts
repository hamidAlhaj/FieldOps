import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Header } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../auth/auth.decorators";
import { AuthRequest } from "../auth/auth.types";
import { LocationDto, StartTrackingDto } from "./tracking.dto";
import { TrackingService } from "./tracking.service";
@ApiTags("Tracking") @ApiBearerAuth()
@Controller("organizations/:organizationId/tracking")
export class TrackingController {
  constructor(private readonly service:TrackingService){}
  private context(r:AuthRequest){return {organizationId:r.params.organizationId as string,actorId:r.user.id};}
  @Post("sessions") @Roles("TECHNICIAN") @Throttle({default:{limit:5,ttl:60000}})
  start(@Req() r:AuthRequest,@Body() dto:StartTrackingDto){return this.service.start(this.context(r),dto);}
  @Delete("sessions/:id") @HttpCode(204) @Roles("TECHNICIAN")
  stop(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string){return this.service.stop(this.context(r),id);}
  @Post("sessions/:id/location") @Roles("TECHNICIAN") @Throttle({default:{limit:5,ttl:60000}})
  sample(@Req() r:AuthRequest,@Param("id",ParseUUIDPipe) id:string,@Body() dto:LocationDto){return this.service.sample(this.context(r),id,dto);}
  @Get("mine") @Roles("TECHNICIAN") @Header("Cache-Control","private, no-store")
  mine(@Req() r:AuthRequest){return this.service.mine(this.context(r));}
  @Get("locations") @Roles("ADMIN","DISPATCHER") @Header("Cache-Control","private, no-store")
  locations(@Req() r:AuthRequest){return this.service.locations(this.context(r));}
}
