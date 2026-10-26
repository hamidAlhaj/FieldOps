import {
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";
export class ProfileDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayName!: string;
  @IsIn(["light", "dark"]) theme!: string;
  @IsBoolean() notifyAssignments!: boolean;
  @IsBoolean() notifyStatusUpdates!: boolean;
}
export class PasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(128) newPassword!: string;
}
