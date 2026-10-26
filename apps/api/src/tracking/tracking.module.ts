import { Module } from "@nestjs/common";
import { OriginGuard } from "../auth/auth.guards";
import { PrismaModule } from "../prisma/prisma.module";
import { TrackingController } from "./tracking.controller";
import { TrackingService } from "./tracking.service";

@Module({
  imports: [PrismaModule],
  controllers: [TrackingController],
  providers: [TrackingService, OriginGuard],
})
export class TrackingModule {}
