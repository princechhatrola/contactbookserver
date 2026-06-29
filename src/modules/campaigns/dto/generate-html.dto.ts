import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GenerateHtmlDto {
  @ApiProperty({
    description: 'AI prompt describing how the HTML body should be structured/designed',
    example: 'Create a modern minimalist onboarding email with a CTA button',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'The subject of the email to provide additional context for the generation',
    example: 'Welcome to our platform!',
    required: false,
  })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({
    description: 'Existing HTML template content to refine or use as a starting point',
    required: false,
  })
  @IsString()
  @IsOptional()
  currentHtml?: string;
}
