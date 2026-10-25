import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/auth.decorators";
import { AuthRequest } from "../auth/auth.types";
import { AuthService } from "../auth/auth.service";
import {
  AddMemberDto,
  AssignmentDto,
  MemberDto,
  OrderDto,
  ReasonDto,
  RequestDto,
  TeamDto,
  TransitionDto,
} from "../auth/auth.dto";
import { WorkOrderService } from "../work-orders/work-order.service";
import { ResourceService } from "./resource.service";
@ApiTags("Organization resources")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
export class ResourceController {
  constructor(
    private readonly resources: ResourceService,
    private readonly auth: AuthService,
    private readonly orders: WorkOrderService,
  ) {}
  private context(request: AuthRequest) {
    return {
      organizationId: request.params.organizationId as string,
      actorId: request.user.id,
    };
  }
  @Get("users") @Roles("ADMIN") members(@Req() r: AuthRequest) {
    return this.resources.members(this.context(r));
  }
  @Post("users") @Roles("ADMIN") add(
    @Req() r: AuthRequest,
    @Body() dto: AddMemberDto,
  ) {
    return this.auth.manageMember(this.context(r), dto, { email: dto.email });
  }
  @Patch("users/:id") @Roles("ADMIN") member(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MemberDto,
  ) {
    return this.auth.manageMember(this.context(r), dto, { id });
  }
  @Get("teams") @Roles("ADMIN") teams(@Req() r: AuthRequest) {
    return this.resources.teams(this.context(r));
  }
  @Post("teams") @Roles("ADMIN") team(
    @Req() r: AuthRequest,
    @Body() dto: TeamDto,
  ) {
    return this.resources.createTeam(this.context(r), dto);
  }
  @Patch("teams/:id") @Roles("ADMIN") updateTeam(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TeamDto,
  ) {
    return this.resources.updateTeam(this.context(r), id, dto);
  }
  @Delete("teams/:id") @HttpCode(204) @Roles("ADMIN") deleteTeam(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.resources.deleteTeam(this.context(r), id);
  }
  @Get("requests") @Roles("ADMIN", "DISPATCHER", "CUSTOMER") requests(
    @Req() r: AuthRequest,
  ) {
    return this.resources.requests(this.context(r));
  }
  @Get("requests/:id") @Roles("ADMIN", "DISPATCHER", "CUSTOMER") request(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.resources.requests(this.context(r), id);
  }
  @Post("requests") @Roles("CUSTOMER") createRequest(
    @Req() r: AuthRequest,
    @Body() dto: RequestDto,
  ) {
    return this.resources.createRequest(this.context(r), dto);
  }
  @Post("requests/:id/cancel") @Roles("ADMIN", "DISPATCHER", "CUSTOMER") cancel(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.orders.cancelRequest(this.context(r), id, dto.reason);
  }
  @Get("work-orders") @Roles("ADMIN", "DISPATCHER", "TECHNICIAN") workOrders(
    @Req() r: AuthRequest,
  ) {
    return this.resources.orders(this.context(r));
  }
  @Get("work-orders/:id") @Roles("ADMIN", "DISPATCHER", "TECHNICIAN") order(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.resources.orders(this.context(r), id);
  }
  @Post("work-orders") @Roles("ADMIN", "DISPATCHER") createOrder(
    @Req() r: AuthRequest,
    @Body() dto: OrderDto,
  ) {
    return this.orders.create(
      this.context(r),
      dto.requestId,
      dto.title,
      dto.description,
    );
  }
  @Post("work-orders/:id/assignments") @Roles("ADMIN", "DISPATCHER") assign(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignmentDto,
  ) {
    return this.orders.assign(
      this.context(r),
      id,
      dto.technicianId,
      dto.expectedVersion,
      dto.reason,
    );
  }
  @Patch("work-orders/:id/status")
  @Roles("ADMIN", "DISPATCHER", "TECHNICIAN")
  transition(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionDto,
  ) {
    return this.orders.transition(
      this.context(r),
      id,
      dto.status,
      dto.expectedVersion,
      dto.reason,
    );
  }
}
