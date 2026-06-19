import { IsString, IsNotEmpty, IsEmail, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSenderIdentityDto {
  @ApiProperty({ description: 'Sender email address', example: 'sales@company.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Sender display name', example: 'Company Sales' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'The associated Email Provider ID to send from', example: '60c72b2f9b1d8b2a3c8d1055' })
  @IsString()
  @IsNotEmpty()
  emailProviderId: string;

  @ApiProperty({ description: 'Set as the default sender identity for campaigns', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
