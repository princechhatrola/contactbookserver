import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AudienceSegmentFilterDto } from '../../campaigns/dto/audience-segment-filter.dto';

export class CreateWhatsappCampaignDto {
  @ApiProperty({ description: 'Campaign Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'WhatsApp Message Body with template variables and spintax' })
  @IsString()
  @IsNotEmpty()
  messageBody: string;

  @ApiProperty({ description: 'Specific Whatsapp Provider ID (optional if auto-rotate is true)' })
  @IsString()
  @IsOptional()
  whatsappProviderId?: string;

  @ApiProperty({ description: 'Enable auto-rotation across organization active numbers', default: true })
  @IsBoolean()
  @IsOptional()
  autoRotate?: boolean;

  @ApiProperty({ description: 'Audience segment filter settings' })
  @IsObject()
  @IsNotEmpty()
  segmentFilters: AudienceSegmentFilterDto;
}
