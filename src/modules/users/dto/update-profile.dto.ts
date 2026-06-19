import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiProperty({ description: 'First name', example: 'John', required: false })
  @IsString()
  @IsOptional()
  firstName?: string;

  @ApiProperty({ description: 'Last name', example: 'Doe', required: false })
  @IsString()
  @IsOptional()
  lastName?: string;

  @ApiProperty({ description: 'Current password (required if updating password)', example: 'OldPassword123!', required: false })
  @IsString()
  @IsOptional()
  currentPassword?: string;

  @ApiProperty({ description: 'New password', example: 'NewPassword123!', required: false })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;
}
