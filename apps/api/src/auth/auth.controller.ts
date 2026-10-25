import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./auth.dto";
import { CurrentUser, Public } from "./auth.decorators";
import { OriginGuard } from "./auth.guards";
import { Principal } from "./auth.types";
import { readEnvironment } from "../config/environment";
export const refreshCookie = "fieldops_refresh";
@ApiTags("Authentication")
@Controller("auth")
@UseGuards(OriginGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  private options() {
    return {
      httpOnly: true,
      secure: readEnvironment().NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/api/v1/auth",
    };
  }
  private send<T extends { refresh: string }>(response: Response, result: T) {
    const { refresh, ...body } = result;
    response.cookie(refreshCookie, refresh, {
      ...this.options(),
      maxAge: 14 * 24 * 3600 * 1000,
    });
    return body;
  }
  @Public()
  @Post("register")
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary:
      "Create an account and new organization. Requires exact WEB_ORIGIN Origin header.",
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.send(response, await this.auth.register(dto));
  }
  @Public()
  @Post("login")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: "Login with email/password; refresh token is an HttpOnly cookie",
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.send(response, await this.auth.login(dto));
  }
  @Public()
  @Post("refresh")
  @HttpCode(200)
  @ApiCookieAuth("refreshCookie")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary:
      "Rotate refresh cookie; replay revokes the complete session. Requires Origin.",
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    try {
      return this.send(
        response,
        await this.auth.refresh(request.cookies?.[refreshCookie]),
      );
    } catch (error) {
      response.clearCookie(refreshCookie, this.options());
      throw error;
    }
  }
  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiCookieAuth("refreshCookie")
  @ApiOperation({
    summary:
      "Revoke current session including issued access tokens; requires Origin",
  })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.cookies?.[refreshCookie]);
    response.clearCookie(refreshCookie, this.options());
    response.setHeader("Cache-Control", "no-store");
  }
  @Get("me")
  @ApiBearerAuth()
  me(
    @CurrentUser() user: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.auth.current(user.id);
  }
}
