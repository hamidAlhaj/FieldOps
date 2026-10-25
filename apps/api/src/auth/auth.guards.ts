import { z } from "zod";
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { RoleName } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { readEnvironment } from "../config/environment";
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }
  canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("auth:public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    return super.canActivate(context);
  }
}
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>("auth:public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest();
    const roles = this.reflector.getAllAndOverride<RoleName[]>("auth:roles", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!request.params.organizationId) {
      if (roles) throw new ForbiddenException();
      return true;
    }
    if (!z.string().uuid().safeParse(request.params.organizationId).success)
      throw new ForbiddenException();
    const member = await this.prisma.forOrganization(
      {
        organizationId: request.params.organizationId,
        actorId: request.user.id,
      },
      (tx) =>
        tx.membership.findFirstOrThrow({
          where: { userId: request.user.id },
          include: { role: true },
        }),
    );
    if (roles && !roles.includes(member.role.name))
      throw new ForbiddenException();
    return true;
  }
}
@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
    if (request.headers.origin !== readEnvironment().WEB_ORIGIN)
      throw new ForbiddenException("Invalid Origin");
    return true;
  }
}
