import { Controller, Post, Body, UseGuards, HttpCode, HttpStatus, UnauthorizedException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { Public } from '../../common/decorators/public.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new organization and administrator account' })
  @ApiResponse({ status: 201, description: 'Organization and administrator successfully created' })
  @ApiResponse({ status: 400, description: 'Bad Request / Validation Error' })
  @ApiResponse({ status: 409, description: 'Email address already registered' })
  async register(@Body() dto: RegisterOrganizationDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.authService.registerOrganization(dto, ip, ua);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user credentials and retrieve access/refresh tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Forbidden - Account or organization suspended' })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.authService.login(dto, ip, ua);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate access and refresh tokens using a valid refresh token' })
  @ApiResponse({ status: 200, description: 'Token rotation successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    try {
      // Decode and verify the refresh token securely
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      return this.authService.refreshTokens(payload.sub, dto.refreshToken);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate refresh token and log out the user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@GetUser('userId') userId: string, @Req() req: any) {
    const ip = req.ip || req.connection?.remoteAddress;
    const ua = req.headers['user-agent'];
    return this.authService.logout(userId, ip, ua);
  }
}
