import { IsString, IsNotEmpty, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeadSource, LeadStatus } from '../schemas/lead.schema';

export class CreateLeadDto {
  @ApiProperty({ description: 'The Contact ID associated with the lead', example: '60c72b2f9b1d8b2a3c8d1033' })
  @IsString()
  @IsNotEmpty()
  contactId: string;

  @ApiProperty({ description: 'Lead acquisition source', enum: LeadSource, example: LeadSource.MANUAL, required: false })
  @IsEnum(LeadSource)
  @IsOptional()
  source?: LeadSource;

  @ApiProperty({ description: 'Lead current status', enum: LeadStatus, example: LeadStatus.NEW, required: false })
  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @ApiProperty({ description: 'Estimated financial value of deal', example: 5000, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  value?: number;

  @ApiProperty({ description: 'User ID of assigned owner', example: '60c72b2f9b1d8b2a3c8d1034', required: false })
  @IsString()
  @IsOptional()
  ownerId?: string;

  @ApiProperty({ description: 'Initial notes for the status history tracking', example: 'Lead captured via referral program', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}
