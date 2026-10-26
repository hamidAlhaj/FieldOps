import { TrackingModule } from "./tracking/tracking.module";
import { AdministrationModule } from "./administration/administration.module";
import { ReportingModule } from "./reporting/reporting.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { AuthModule } from "./auth/auth.module";
import { ResourceModule } from "./resources/resource.module";
import { WorkOrderModule } from "./work-orders/work-order.module";
import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./health/health.controller";
@Module({
  imports: [TrackingModule, AdministrationModule,
    ReportingModule,
    PrismaModule,
    AuthModule,
    WorkOrderModule,
    ResourceModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
