import { IsString, IsNotEmpty, IsEmail, IsOptional, IsDateString, IsArray, IsObject, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({ description: 'First name', example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  firstName: string;

  @ApiProperty({ description: 'Last name', example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  lastName: string;

  @ApiProperty({ description: 'Email address', example: 'jane.doe@gmail.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ description: 'Mobile phone number', example: '+15550199', required: false })
  @IsString()
  @IsOptional()
  mobile?: string;

  @ApiProperty({ description: 'Alternate phone number', example: '+15550198', required: false })
  @IsString()
  @IsOptional()
  alternateMobile?: string;

  @ApiProperty({ description: 'Date of birth', example: '1990-05-15', required: false })
  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiProperty({ description: 'Gender', example: 'Female', required: false })
  @IsString()
  @IsOptional()
  gender?: string;

  // Business info
  @ApiProperty({ description: 'Company name', example: 'Google Inc.', required: false })
  @IsString()
  @IsOptional()
  company?: string;

  @ApiProperty({ description: 'Job title', example: 'Senior Product Manager', required: false })
  @IsString()
  @IsOptional()
  jobTitle?: string;

  @ApiProperty({ description: 'Department', example: 'Product Engineering', required: false })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ description: 'Industry', example: 'Technology', required: false })
  @IsString()
  @IsOptional()
  industry?: string;

  // Address info
  @ApiProperty({ description: 'Country', example: 'United States', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ description: 'State / Province', example: 'California', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ description: 'City', example: 'Mountain View', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ description: 'Zip/Postal code', example: '94043', required: false })
  @IsString()
  @IsOptional()
  zipCode?: string;

  @ApiProperty({ description: 'Street address', example: '1600 Amphitheatre Pkwy', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  // Social info
  @ApiProperty({ description: 'LinkedIn URL', example: 'linkedin.com/in/janedoe', required: false })
  @IsString()
  @IsOptional()
  linkedIn?: string;

  @ApiProperty({ description: 'Personal or business website', example: 'https://janedoe.com', required: false })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiProperty({ description: 'Twitter profile handle', example: 'janedoe_prod', required: false })
  @IsString()
  @IsOptional()
  twitter?: string;

  @ApiProperty({ description: 'Facebook profile link', example: 'facebook.com/janedoe', required: false })
  @IsString()
  @IsOptional()
  facebook?: string;

  @ApiProperty({ description: 'Instagram handle', example: 'janedoe_life', required: false })
  @IsString()
  @IsOptional()
  instagram?: string;

  // Ownership
  @ApiProperty({ description: 'User ID of assigned contact owner (Manager or Employee)', example: '60c72b2f9b1d8b2a3c8d1033', required: false })
  @IsString()
  @IsOptional()
  ownerId?: string;

  // Dynamic Custom Fields
  @ApiProperty({ description: 'Dynamic custom key-value pairs matching organization definitions', example: { vip_client: true }, required: false })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;

  // Groups and Tags
  @ApiProperty({ description: 'List of tags', example: ['VIP', 'Lead'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiProperty({ description: 'List of Group IDs the contact belongs to', example: ['60c72b2f9b1d8b2a3c8d1044'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  groups?: string[];
}
