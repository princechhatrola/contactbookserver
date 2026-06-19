import { IsArray, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AudienceSegmentFilterDto {
  @ApiProperty({ description: 'Filter by CRM contact groups', type: [String], required: false })
  @IsArray()
  @IsOptional()
  groupIds?: string[];

  @ApiProperty({ description: 'Filter by CRM contact tags', type: [String], required: false })
  @IsArray()
  @IsOptional()
  tags?: string[];

  @ApiProperty({ description: 'Filter by CRM lead statuses', type: [String], required: false })
  @IsArray()
  @IsOptional()
  leadStatuses?: string[];

  @ApiProperty({ description: 'Filter by CRM custom fields (exact key-value)', type: Object, required: false })
  @IsObject()
  @IsOptional()
  customFields?: Record<string, any>;
}
