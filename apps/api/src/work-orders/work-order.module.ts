import { Module } from "@nestjs/common";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkOrderService } from "./work-order.service";
@Module({
  imports: [PrismaModule, SchedulingModule],
  providers: [WorkOrderService],
  exports: [WorkOrderService],
})
export class WorkOrderModule {}
