import "reflect-metadata";
import { Reflector } from "@nestjs/core";
import { ExecutionContext } from "@nestjs/common";
import {
  JwtAuthGuard,
  OrganizationGuard,
  OriginGuard,
} from "../src/auth/auth.guards";
import { Public, Roles } from "../src/auth/auth.decorators";
import { JwtStrategy } from "../src/auth/jwt.strategy";
const context = (request: object, handler: Function = () => {}) =>
  ({
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as ExecutionContext;
@Public()
class PublicController {}
class Restricted {
  @Roles("ADMIN") handle() {}
}
describe("Authentication guards and JWT claims", () => {
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = "unit-test-signing-key-only-".repeat(4);
    process.env.DATABASE_URL ??=
      "postgresql://unused:unused@localhost/unused_test";
    process.env.WEB_ORIGIN = "http://localhost:5173";
  });
  it("bypasses Passport only on explicitly public handlers", () => {
    const guard = new JwtAuthGuard(new Reflector());
    const base = Object.getPrototypeOf(JwtAuthGuard.prototype);
    const authenticate = jest.spyOn(base, "canActivate").mockReturnValue(false);
    const publicContext = {
      ...context({}),
      getClass: () => PublicController,
    } as ExecutionContext;
    expect(guard.canActivate(publicContext)).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
    expect(guard.canActivate(context({}))).toBe(false);
    expect(authenticate).toHaveBeenCalledTimes(1);
    authenticate.mockRestore();
  });
  it("requires an organization for role-restricted handlers", async () => {
    const guard = new OrganizationGuard(new Reflector(), {} as never);
    await expect(
      guard.canActivate(context({ params: {} }, Restricted.prototype.handle)),
    ).rejects.toThrow();
  });
  it("rejects a valid member with the wrong role", async () => {
    const prisma = {
      forOrganization: jest
        .fn()
        .mockResolvedValue({ role: { name: "CUSTOMER" } }),
    };
    const guard = new OrganizationGuard(new Reflector(), prisma as never);
    await expect(
      guard.canActivate(
        context(
          {
            params: { organizationId: "00000000-0000-4000-a000-000000000001" },
            user: { id: "actor" },
          },
          Restricted.prototype.handle,
        ),
      ),
    ).rejects.toThrow();
  });
  it("enforces exact Origin on cookie-auth mutations", () => {
    const guard = new OriginGuard();
    expect(() =>
      guard.canActivate(
        context({
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(
      guard.canActivate(
        context({
          method: "POST",
          headers: { origin: "http://localhost:5173" },
        }),
      ),
    ).toBe(true);
  });
  it("JWT validation rejects malformed claims and checks the session for valid claims", async () => {
    const auth = {
      validateSession: jest.fn().mockResolvedValue({ id: "verified" }),
    };
    const strategy = new JwtStrategy(auth as never);
    expect(() =>
      strategy.validate({ sub: "invalid", sid: "invalid" }),
    ).toThrow();
    const uuid = "00000000-0000-4000-a000-000000000001";
    await expect(strategy.validate({ sub: uuid, sid: uuid })).resolves.toEqual({
      id: "verified",
    });
    expect(auth.validateSession).toHaveBeenCalledWith(uuid, uuid);
  });
});
