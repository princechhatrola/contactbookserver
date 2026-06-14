import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: 'The name of the tag', example: 'Newsletter' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
