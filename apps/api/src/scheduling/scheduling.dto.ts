import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ArrayMaxSize, ArrayUnique, IsArray, IsEnum, IsInt, IsISO8601, IsOptional,
  IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested,
} from "class-validator";
import { TechnicianAvailabilityStatus } from "@prisma/client";
import { VersionDto } from "../auth/auth.dto";

export class WorkingHourDto {
  @ApiProperty({minimum:0,maximum:6,description:"Sunday=0 through Saturday=6 in technician timezone"})
  @IsInt() @Min(0) @Max(6) day!:number;
  @ApiProperty({minimum:0,maximum:1439}) @IsInt() @Min(0) @Max(1439) startMinute!:number;
  @ApiProperty({minimum:1,maximum:1440}) @IsInt() @Min(1) @Max(1440) endMinute!:number;
}
export class AvailabilityDto {
  @ApiProperty({enum:TechnicianAvailabilityStatus})
  @IsEnum(TechnicianAvailabilityStatus) status!:TechnicianAvailabilityStatus;
  @ApiProperty({example:"Asia/Damascus"})
  @IsString() @MinLength(1) @MaxLength(64) timeZone!:string;
  @ApiProperty({type:[WorkingHourDto],description:"Empty means no configured weekly restriction"})
  @IsArray() @ArrayMaxSize(28) @ValidateNested({each:true}) @Type(()=>WorkingHourDto) weeklyHours!:WorkingHourDto[];
}
export class TimeOffDto {
  @ApiProperty({example:"2026-10-27T08:00:00.000Z"})
  @IsISO8601({strict:true}) startAt!:string;
  @ApiProperty({example:"2026-10-27T10:00:00.000Z"})
  @IsISO8601({strict:true}) endAt!:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?:string;
}
export class SkillNameDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(80) name!:string;
}
export class SkillIdsDto {
  @ApiProperty({type:[String],format:"uuid"})
  @IsArray() @ArrayMaxSize(40) @ArrayUnique() @IsUUID("all",{each:true}) skillIds!:string[];
}
export class OrderSkillsDto extends VersionDto {
  @ApiProperty({type:[String],format:"uuid"})
  @IsArray() @ArrayMaxSize(40) @ArrayUnique() @IsUUID("all",{each:true}) skillIds!:string[];
}
export class ScheduleDto extends VersionDto {
  @ApiProperty({example:"2026-10-27T09:00:00.000Z"})
  @IsISO8601({strict:true}) plannedStartAt!:string;
  @ApiProperty({example:"2026-10-27T11:00:00.000Z"})
  @IsISO8601({strict:true}) plannedEndAt!:string;
  @ApiProperty({minimum:15,maximum:720}) @IsInt() @Min(15) @Max(720) estimatedDurationMinutes!:number;
}
