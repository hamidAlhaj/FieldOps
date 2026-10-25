import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { OperationsGateway } from "./operations.gateway";
@Module({ imports: [PrismaModule], providers: [OperationsGateway] })
export class RealtimeModule {}
