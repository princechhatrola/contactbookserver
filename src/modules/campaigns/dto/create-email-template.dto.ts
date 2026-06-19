import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEmailTemplateDto {
  @ApiProperty({ description: 'Display name of the email template', example: 'Welcome Onboarding Email' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Description of when to use this template', example: 'Sent automatically when a contact is created', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Subject line of the email, supporting variables', example: 'Welcome to ContactFlow, {{firstName}}!' })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({ description: 'The HTML payload of the template, containing handlebars variables', example: '<p>Hi {{firstName}},</p><p>We are glad to have you at {{company}}!</p>' })
  @IsString()
  @IsNotEmpty()
  htmlContent: string;

  @ApiProperty({ description: 'Optional plain text backup alternative', example: 'Hi {{firstName}},\n\nWelcome to ContactFlow!', required: false })
  @IsString()
  @IsOptional()
  textContent?: string;
}
