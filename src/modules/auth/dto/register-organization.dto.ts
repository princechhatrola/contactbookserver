import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterOrganizationDto {
  @ApiProperty({ description: 'The name of the organization', example: 'Acme Corp' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  organizationName: string;

  @ApiProperty({ description: 'First name of the administrator', example: 'John' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  firstName: string;

  @ApiProperty({ description: 'Last name of the administrator', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  lastName: string;

  @ApiProperty({ description: 'Email address for the administrator login', example: 'admin@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password for the account (minimum 8 characters)', example: 'SecureP@ss123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({ description: 'Industry type', example: 'Technology', required: false })
  @IsString()
  @IsOptional()
  industry?: string;

  @ApiProperty({ description: 'Company website URL', example: 'https://acme.com', required: false })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiProperty({ description: 'Country location', example: 'United States', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ description: 'State/Province', example: 'California', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ description: 'City location', example: 'San Francisco', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ description: 'Default timezone for organization', example: 'America/Los_Angeles', required: false })
  @IsString()
  @IsOptional()
  timezone?: string;
}
