import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Email address', example: 'admin@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Password', example: 'SecureP@ss123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;
}
