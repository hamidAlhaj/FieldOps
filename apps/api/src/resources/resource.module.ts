import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkOrderModule } from "../work-orders/work-order.module";
import { ResourceController } from "./resource.controller";
import { ResourceService } from "./resource.service";
@Module({
  imports: [PrismaModule, WorkOrderModule],
  controllers: [ResourceController],
  providers: [ResourceService],
})
export class ResourceModule {}
