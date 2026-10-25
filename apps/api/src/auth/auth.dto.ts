import { Transform } from "class-transformer";
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsEnum,
  IsInt,
  Min,
  IsUUID,
  IsOptional,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { MembershipStatus, RoleName, WorkOrderStatus } from "@prisma/client";
export class LoginDto {
  @ApiProperty({ example: "manager@example.test" })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
  @ApiProperty({ writeOnly: true, minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(160) displayName!: string;
  @ApiProperty({
    description:
      "Creates a new organization; cannot join an existing organization or select a role.",
  })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organizationName!: string;
}
export class TeamDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) name!: string;
}
export class MemberDto {
  @ApiProperty({ enum: RoleName }) @IsEnum(RoleName) role!: RoleName;
  @ApiProperty({ enum: MembershipStatus })
  @IsEnum(MembershipStatus)
  status!: MembershipStatus;
}
export class AddMemberDto extends MemberDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email!: string;
}
export class RequestDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(10000)
  description!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500) address!: string;
}
export class OrderDto {
  @ApiProperty() @IsUUID() requestId!: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(10000)
  description!: string;
}
export class VersionDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) expectedVersion!: number;
}
export class AssignmentDto extends VersionDto {
  @ApiProperty() @IsUUID() technicianId!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason?: string;
}
export class TransitionDto extends VersionDto {
  @ApiProperty({ enum: WorkOrderStatus })
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason?: string;
}
export class ReasonDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(1000) reason!: string;
}
