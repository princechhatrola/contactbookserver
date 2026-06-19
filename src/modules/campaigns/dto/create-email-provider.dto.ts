import { IsString, IsNotEmpty, IsEnum, IsObject, IsOptional, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ProviderType } from '../schemas/email-provider.schema';

export class CreateEmailProviderDto {
  @ApiProperty({ description: 'Display name for the email provider configuration', example: 'SendGrid Marketing Key' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'The provider service type', enum: ProviderType, example: ProviderType.SENDGRID })
  @IsEnum(ProviderType)
  @IsNotEmpty()
  type: ProviderType;

  @ApiProperty({ description: 'Credentials required for authentication. SMTP: host, port, secure, auth: { user, pass }. API (SendGrid/Resend/Mailgun): apiKey, and optional domain/host. AWS SES: accessKeyId, secretAccessKey, region. Gmail/Outlook OAuth: clientId, clientSecret, accessToken, refreshToken.', example: { apiKey: 'SG.xxx' } })
  @IsObject()
  @IsNotEmpty()
  credentials: Record<string, any>;

  @ApiProperty({ description: 'Maximum emails allowed to be sent daily', example: 5000, required: false })
  @IsNumber()
  @IsOptional()
  dailyLimit?: number;

  @ApiProperty({ description: 'Maximum emails allowed to be sent hourly', example: 500, required: false })
  @IsNumber()
  @IsOptional()
  hourlyLimit?: number;

  @ApiProperty({ description: 'Maximum emails allowed to be sent per minute', example: 10, required: false })
  @IsNumber()
  @IsOptional()
  rateLimitPerMin?: number;

  @ApiProperty({ description: 'Gradually increase limits daily to warm up the domain', example: false, required: false })
  @IsBoolean()
  @IsOptional()
  warmupMode?: boolean;

  @ApiProperty({ description: 'Critical bounce rate threshold to auto-pause sending', example: 5.0, required: false })
  @IsNumber()
  @IsOptional()
  bounceThreshold?: number;

  @ApiProperty({ description: 'Lower priorities run first during rotation', example: 1, required: false })
  @IsNumber()
  @IsOptional()
  priority?: number;
}
