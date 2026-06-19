import { IsString, IsNotEmpty, IsOptional, IsMongoId, IsDateString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AudienceSegmentFilterDto } from './audience-segment-filter.dto';

export class CreateCampaignDto {
  @ApiProperty({ description: 'Display name of the campaign', example: 'Q3 Product Newsletter' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Subject line of the campaign emails', example: 'Big updates in Q3!' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'Reference ID of the email template to render', example: '60c72b2f9b1d8e2b8c8d8888' })
  @IsMongoId()
  @IsNotEmpty()
  emailTemplateId: string;

  @ApiProperty({ description: 'Reference ID of the email provider relay connection', example: '60c72b2f9b1d8e2b8c8d8889' })
  @IsMongoId()
  @IsNotEmpty()
  emailProviderId: string;

  @ApiProperty({ description: 'Reference ID of the sender headers identity profile', example: '60c72b2f9b1d8e2b8c8d8890' })
  @IsMongoId()
  @IsNotEmpty()
  senderIdentityId: string;

  @ApiProperty({ description: 'Dynamic segment filtering criteria', type: AudienceSegmentFilterDto })
  @ValidateNested()
  @Type(() => AudienceSegmentFilterDto)
  segmentFilters: AudienceSegmentFilterDto;

  @ApiProperty({ description: 'Time in ISO format to schedule the dispatch (optional)', example: '2026-06-19T10:00:00.000Z', required: false })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;
}
