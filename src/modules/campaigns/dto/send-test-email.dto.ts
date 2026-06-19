import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendTestEmailDto {
  @ApiProperty({ description: 'The recipient email address for the test render', example: 'recipient@example.com' })
  @IsEmail()
  @IsNotEmpty()
  recipientEmail: string;

  @ApiProperty({ description: 'The connected email provider ID to use for dispatch', example: '60c72b2f9b1d8b2a3c8d1055' })
  @IsString()
  @IsNotEmpty()
  emailProviderId: string;

  @ApiProperty({ description: 'The sender identity profile ID containing sender email and name headers', example: '60c72b2f9b1d8b2a3c8d1077' })
  @IsString()
  @IsNotEmpty()
  senderIdentityId: string;
}
