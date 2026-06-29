import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWhatsappTemplateDto {
  @ApiProperty({ description: 'Template Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Template Description', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'WhatsApp Message Body with template variables and spintax' })
  @IsString()
  @IsNotEmpty()
  body: string;
}
