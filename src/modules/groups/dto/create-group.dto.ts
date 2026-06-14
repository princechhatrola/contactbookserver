import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'The name of the group', example: 'VIP Customers' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'A description of the group', example: 'High-value clients and regular buyers', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
