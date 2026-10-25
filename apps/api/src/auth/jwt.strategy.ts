import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { readEnvironment } from "../config/environment";
const claims = z.object({ sub: z.string().uuid(), sid: z.string().uuid() });
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: readEnvironment().JWT_ACCESS_SECRET,
      algorithms: ["HS256"],
      issuer: "fieldops-api",
      audience: "fieldops-web",
      ignoreExpiration: false,
    });
  }
  validate(payload: unknown) {
    const result = claims.safeParse(payload);
    if (!result.success) throw new UnauthorizedException();
    return this.auth.validateSession(result.data.sub, result.data.sid);
  }
}
