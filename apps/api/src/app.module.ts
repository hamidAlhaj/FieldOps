import { AuthModule } from "./auth/auth.module";
import { ResourceModule } from "./resources/resource.module";
import { WorkOrderModule } from "./work-orders/work-order.module";
import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
@Module({
  imports: [PrismaModule, AuthModule, WorkOrderModule, ResourceModule],
  controllers: [HealthController],
})
export class AppModule {}
