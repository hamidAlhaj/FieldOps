import { WorkOrderModule } from './work-orders/work-order.module';
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthController } from './health/health.controller';
@Module({ imports: [PrismaModule, WorkOrderModule], controllers: [HealthController] })
export class AppModule {}
