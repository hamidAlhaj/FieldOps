import {
  Body, Controller, Delete, Get, Header, HttpCode, Param,
  ParseUUIDPipe, Post, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../auth/auth.decorators";
import { OriginGuard } from "../auth/auth.guards";
import { AuthRequest } from "../auth/auth.types";
import { LocationDto, StartTrackingDto } from "./tracking.dto";
import { TrackingService } from "./tracking.service";

@ApiTags("Tracking")
@ApiBearerAuth()
@UseGuards(OriginGuard)
@Controller("organizations/:organizationId/tracking")
export class TrackingController {
  constructor(private readonly service: TrackingService) {}

  private context(r: AuthRequest) {
    return {
      organizationId: r.params.organizationId as string,
      actorId: r.user.id,
      authSessionId: r.user.sessionId,
    };
  }

  @Header("Cache-Control", "private, no-store")
  @Post("sessions")
  @Roles("TECHNICIAN")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@Req() r: AuthRequest, @Body() dto: StartTrackingDto) {
    return this.service.start(this.context(r), dto);
  }

  @Header("Cache-Control", "private, no-store")
  @Delete("sessions/:id")
  @HttpCode(204)
  @Roles("TECHNICIAN")
  stop(@Req() r: AuthRequest, @Param("id", ParseUUIDPipe) id: string) {
    return this.service.stop(this.context(r), id);
  }

  @Header("Cache-Control", "private, no-store")
  @Post("sessions/:id/location")
  @Roles("TECHNICIAN")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  sample(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: LocationDto,
  ) {
    return this.service.sample(this.context(r), id, dto);
  }

  @Header("Cache-Control", "private, no-store")
  @Get("mine")
  @Roles("TECHNICIAN")
  mine(@Req() r: AuthRequest) {
    return this.service.mine(this.context(r));
  }

  @Header("Cache-Control", "private, no-store")
  @Get("locations")
  @Roles("ADMIN", "DISPATCHER")
  locations(@Req() r: AuthRequest) {
    return this.service.locations(this.context(r));
  }
}
