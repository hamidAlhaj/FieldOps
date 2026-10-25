import {
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

// actorId must come from verified authentication, never a request body/header.
export interface OrganizationContext {
  organizationId: string;
  actorId: string;
}
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client = new PrismaClient();
  async onModuleInit() {
    await this.client.$connect();
  }
  async onModuleDestroy() {
    await this.client.$disconnect();
  }
  async ping() {
    await this.client.$queryRaw`SELECT 1`;
  }

  async forOrganization<T>(
    context: OrganizationContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    z.string().uuid().parse(context.organizationId);
    z.string().uuid().parse(context.actorId);
    try {
      return await this.client.$transaction(
        async (tx) => {
          // Static role name; all context values use parameterized statements.
          await tx.$executeRawUnsafe("SET LOCAL ROLE fieldops_app");
          await tx.$queryRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true), set_config('app.actor_id', ${context.actorId}, true)`;
          const memberships = await tx.membership.findMany({
            where: {
              userId: context.actorId,
              organizationId: context.organizationId,
              status: "ACTIVE",
            },
            take: 1,
          });
          if (!memberships.length)
            throw new ForbiddenException("Organization access denied");
          return operation(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "Concurrent change detected; reload and retry",
        );
      }
      throw error;
    }
  }
}
