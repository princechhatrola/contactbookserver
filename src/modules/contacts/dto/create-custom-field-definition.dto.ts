import { IsString, IsNotEmpty, IsEnum, IsArray, IsBoolean, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CustomFieldType } from '../schemas/custom-field-definition.schema';

export class CreateCustomFieldDefinitionDto {
  @ApiProperty({ description: 'The machine key slug', example: 'referred_by_vip' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_]+$/, { message: 'Key must contain only lowercase alphanumeric characters and underscores' })
  key: string;

  @ApiProperty({ description: 'The human-readable label', example: 'Referred by VIP?' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ description: 'The custom field type', enum: CustomFieldType, example: CustomFieldType.BOOLEAN })
  @IsEnum(CustomFieldType)
  @IsNotEmpty()
  type: CustomFieldType;

  @ApiProperty({ description: 'Dropdown options', example: ['Option A', 'Option B'], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @ApiProperty({ description: 'Whether the field is required on contacts', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  required?: boolean;
}
