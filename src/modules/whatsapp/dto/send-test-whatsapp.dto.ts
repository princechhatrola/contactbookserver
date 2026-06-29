import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendTestWhatsappDto {
  @ApiProperty({ description: 'Target Phone Number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ description: 'WhatsApp Sending Provider ID' })
  @IsString()
  @IsNotEmpty()
  whatsappProviderId: string;
}
