import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SuppressionReason } from '../schemas/suppression-list.schema';

export class CreateSuppressionDto {
  @ApiProperty({ description: 'The email address to suppress', example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'The reason for suppression', enum: SuppressionReason, example: SuppressionReason.MANUAL })
  @IsEnum(SuppressionReason)
  @IsNotEmpty()
  reason: SuppressionReason;
}
