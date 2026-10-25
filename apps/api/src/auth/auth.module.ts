import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { readEnvironment } from "../config/environment";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { AuthController } from "./auth.controller";
import { JwtAuthGuard, OrganizationGuard, OriginGuard } from "./auth.guards";
@Global()
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: readEnvironment().JWT_ACCESS_SECRET,
        signOptions: {
          expiresIn: "15m",
          issuer: "fieldops-api",
          audience: "fieldops-web",
          algorithm: "HS256",
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    OriginGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: OrganizationGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
