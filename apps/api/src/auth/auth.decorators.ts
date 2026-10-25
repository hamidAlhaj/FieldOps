import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { RoleName } from "@prisma/client";
export const Public = () => SetMetadata("auth:public", true);
export const Roles = (...roles: RoleName[]) => SetMetadata("auth:roles", roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest().user,
);
