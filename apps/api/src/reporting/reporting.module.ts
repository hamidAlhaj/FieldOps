import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  Query,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Roles } from "../auth/auth.decorators";
import { AuthRequest } from "../auth/auth.types";
import { OrganizationContext, PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";
class RangeDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}
class AuditDto extends RangeDto {
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsUUID() resourceId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page: number =
    1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}
export function reportingRange(dto: RangeDto, now = new Date()) {
  const to = dto.to ? new Date(dto.to) : now;
  const from = dto.from
    ? new Date(dto.from)
    : new Date(to.getTime() - 30 * 86400000);
  if (
    !Number.isFinite(+from) ||
    !Number.isFinite(+to) ||
    from >= to ||
    +to - +from > 366 * 86400000 ||
    (dto.from && !/^\d{4}-\d\d-\d\dT.*Z$/.test(dto.from)) ||
    (dto.to && !/^\d{4}-\d\d-\d\dT.*Z$/.test(dto.to))
  )
    throw new BadRequestException(
      "Use a UTC ISO range of at most 366 days, from inclusive and to exclusive",
    );
  return { from, to };
}
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}
  analytics(context: OrganizationContext, dto: RangeDto) {
    const { from, to } = reportingRange(dto);
    return this.prisma.forOrganization(context, async (tx) => {
      const [summary] = await tx.$queryRaw<
        {
          completed: number;
          closed: number;
          averageResolutionHours: number | null;
          overdue: number;
        }[]
      >`
        SELECT (SELECT count(*)::int FROM "WorkOrder" WHERE "completedAt" >= ${from} AND "completedAt" < ${to}) AS completed,
        (SELECT count(*)::int FROM "WorkOrder" WHERE "closedAt" >= ${from} AND "closedAt" < ${to}) AS closed,
        (SELECT avg(extract(epoch FROM ("closedAt" - "createdAt"))/3600)::float8 FROM "WorkOrder" WHERE "closedAt" >= ${from} AND "closedAt" < ${to}) AS "averageResolutionHours",
        (SELECT count(*)::int FROM "WorkOrder" WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS') AND "scheduledAt" < now()) AS overdue`;
      const trends = await tx.$queryRaw<
        { day: string; completed: number }[]
      >`SELECT to_char("completedAt", 'YYYY-MM-DD') AS day, count(*)::int AS completed FROM "WorkOrder" WHERE "completedAt" >= ${from} AND "completedAt" < ${to} GROUP BY day ORDER BY day`;
      const workload = await tx.technicianProfile.findMany({
        select: {
          id: true,
          membership: { select: { user: { select: { displayName: true } } } },
          _count: { select: { assignments: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { employeeCode: "asc" },
        take: 100,
      });
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        timezone: "UTC",
        ...summary,
        trends,
        workload: workload.map((t) => ({
          id: t.id,
          name: t.membership.user.displayName,
          activeAssignments: t._count.assignments,
        })),
        workloadLimit: 100,
      };
    });
  }
  audit(context: OrganizationContext, dto: AuditDto) {
    const { from, to } = reportingRange(dto);
    return this.prisma.forOrganization(context, async (tx) => {
      const where = {
        createdAt: { gte: from, lt: to },
        ...(dto.action ? { action: dto.action } : {}),
        ...(dto.resourceId ? { entityId: dto.resourceId } : {}),
      };
      const total = await tx.auditLog.count({ where });
      const items = await tx.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          createdAt: true,
          actor: { select: { user: { select: { displayName: true } } } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
      });
      return {
        items,
        total,
        page: dto.page,
        pageSize: dto.pageSize,
        from: from.toISOString(),
        to: to.toISOString(),
      };
    });
  }
}
@ApiTags("Reporting")
@ApiBearerAuth()
@Controller("organizations/:organizationId")
class ReportingController {
  constructor(private readonly reports: ReportingService) {}
  private context(r: AuthRequest) {
    return {
      organizationId: r.params.organizationId as string,
      actorId: r.user.id,
    };
  }
  @Get("analytics") @Roles("ADMIN", "DISPATCHER") analytics(
    @Req() r: AuthRequest,
    @Query() dto: RangeDto,
  ) {
    return this.reports.analytics(this.context(r), dto);
  }
  @Get("audit-logs") @Roles("ADMIN") audit(
    @Req() r: AuthRequest,
    @Query() dto: AuditDto,
  ) {
    return this.reports.audit(this.context(r), dto);
  }
}
@Module({
  imports: [PrismaModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
