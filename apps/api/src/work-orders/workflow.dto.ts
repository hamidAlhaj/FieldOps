import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsString,
  Min,
  Max,
  MinLength,
  MaxLength,
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { PhotoKind } from "@prisma/client";
import { VersionDto } from "../auth/auth.dto";
export class ReviewDto extends VersionDto {
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(1000) note!: string;
}
export class ProgressDto extends ReviewDto {
  @ApiProperty({ minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  percent!: number;
}
export class PhotoDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty({ enum: PhotoKind }) @IsEnum(PhotoKind) kind!: PhotoKind;
}
