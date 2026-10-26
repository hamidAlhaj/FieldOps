import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import { MembershipStatus, RoleName } from "@prisma/client";
import { Roles } from "../auth/auth.decorators";
import { AuthRequest } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PrismaModule } from "../prisma/prisma.module";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
class ListDto {
  @IsOptional() @IsString() @MaxLength(100) search = "";
  @IsOptional() @IsEnum(RoleName) role?: RoleName;
  @IsOptional() @IsEnum(MembershipStatus) status?: MembershipStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;
}
class MemberDto {
  @IsUUID() membershipId!: string;
}
class NameDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
}
@ApiTags("Administration")
@ApiBearerAuth()
@Roles("ADMIN")
@Controller("organizations/:organizationId/administration")
class AdministrationController {
  constructor(private readonly prisma: PrismaService) {}
  private scoped<T>(
    r: AuthRequest,
    fn: Parameters<PrismaService["forOrganization"]>[1],
  ) {
    return this.prisma.forOrganization(
      { organizationId: r.params.organizationId as string, actorId: r.user.id },
      fn,
    );
  }
  @Get("members") members(@Req() r: AuthRequest, @Query() q: ListDto) {
    return this.scoped(r, async (tx) => {
      const where = {
        ...(q.role ? { role: { name: q.role } } : {}),
        ...(q.status ? { status: q.status } : {}),
        user: {
          OR: [
            {
              displayName: { contains: q.search, mode: "insensitive" as const },
            },
            { email: { contains: q.search, mode: "insensitive" as const } },
          ],
        },
      };
      return {
        items: await tx.membership.findMany({
          where,
          select: {
            id: true,
            status: true,
            role: { select: { name: true } },
            user: { select: { id: true, displayName: true, email: true } },
          },
          orderBy: { id: "asc" },
          skip: (q.page - 1) * 25,
          take: 25,
        }),
        total: await tx.membership.count({ where }),
        page: q.page,
      };
    });
  }
  @Get("organization") organization(@Req() r: AuthRequest) {
    return this.scoped(r, (tx) => tx.organization.findFirstOrThrow());
  }
  @Patch("organization") update(@Req() r: AuthRequest, @Body() dto: NameDto) {
    if (!dto.name.trim()) throw new BadRequestException();
    return this.scoped(r, async (tx) => {
      await tx.$executeRaw`UPDATE "Organization" SET name=${dto.name.trim()}, "updatedAt"=now() WHERE id=${r.params.organizationId}::uuid`;
      await tx.auditLog.create({
        data: {
          organizationId: r.params.organizationId as string,
          actorId: (
            await tx.membership.findFirstOrThrow({
              where: { userId: r.user.id },
            })
          ).id,
          action: "ORGANIZATION_UPDATED",
          entityType: "Organization",
          entityId: r.params.organizationId as string,
        },
      });
      return { id: r.params.organizationId };
    });
  }
  @Post("teams/:id/members") add(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MemberDto,
  ) {
    return this.scoped(r, async (tx) => {
      const member = await tx.membership.findFirst({
        where: {
          id: dto.membershipId,
          status: "ACTIVE",
          role: { name: { in: ["ADMIN", "DISPATCHER", "TECHNICIAN"] } },
        },
      });
      if (!member || !(await tx.team.findFirst({ where: { id } })))
        throw new BadRequestException(
          "Active organization staff and team required",
        );
      await tx.teamMember.upsert({
        where: {
          organizationId_teamId_membershipId: {
            organizationId: r.params.organizationId as string,
            teamId: id,
            membershipId: member.id,
          },
        },
        create: {
          organizationId: r.params.organizationId as string,
          teamId: id,
          membershipId: member.id,
        },
        update: {},
      });
      return { id };
    });
  }
  @Delete("teams/:id/members/:memberId") @HttpCode(204) remove(
    @Req() r: AuthRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("memberId", ParseUUIDPipe) memberId: string,
  ) {
    return this.scoped(r, async (tx) => {
      await tx.teamMember.deleteMany({
        where: { teamId: id, membershipId: memberId },
      });
    });
  }
}
@Module({ imports: [PrismaModule], controllers: [AdministrationController] })
export class AdministrationModule {}
