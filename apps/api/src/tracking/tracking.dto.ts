import { ApiProperty } from "@nestjs/swagger";
import { Equals, IsBoolean, IsDateString, IsNumber, IsUUID, Max, Min } from "class-validator";
export class StartTrackingDto {
  @ApiProperty({format:"uuid"}) @IsUUID() workOrderId!: string;
  @ApiProperty({example:true,description:"Explicit technician consent; never inferred"}) @IsBoolean() @Equals(true) consent!: true;
}
export class LocationDto {
  @ApiProperty() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(-180) @Max(180) longitude!: number;
  @ApiProperty() @IsNumber({allowNaN:false,allowInfinity:false}) @Min(0) @Max(10000) accuracyMeters!: number;
  @ApiProperty({format:"date-time"}) @IsDateString({strict:true}) recordedAt!: string;
}
