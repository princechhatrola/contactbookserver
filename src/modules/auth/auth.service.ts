import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { RegisterOrganizationDto } from './dto/register-organization.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus } from '../users/schemas/user.schema';
import { OrganizationStatus } from '../organizations/schemas/organization.schema';
import { AuditLogEmitter } from '../audit-logs/audit-log-emitter';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogEmitter: AuditLogEmitter,
  ) {}

  async registerOrganization(dto: RegisterOrganizationDto, ip?: string, ua?: string) {
    // 1. Create Organization
    const organization = await this.organizationsService.create(dto.organizationName, {
      industry: dto.industry,
      website: dto.website,
      country: dto.country,
      state: dto.state,
      city: dto.city,
      timezone: dto.timezone || 'UTC',
      status: OrganizationStatus.ACTIVE,
    });

    // 2. Create Org Admin User
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      passwordHash: dto.password, // UsersService will hash it
      role: UserRole.ORG_ADMIN,
      status: UserStatus.ACTIVE,
      organizationId: organization._id as any,
    });

    // 3. Generate Tokens
    const tokens = await this.generateTokens(user);
    
    // Save refresh token hash
    await this.usersService.updateRefreshToken((user._id as any).toString(), tokens.refreshToken);

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId: organization._id.toString(),
      userId: user._id.toString(),
      action: 'auth.register',
      description: `User ${user.email} registered organization and administrator account`,
      ipAddress: ip,
      userAgent: ua,
      metadata: {
        organizationName: dto.organizationName,
        email: dto.email,
      },
    });

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
      },
      tokens,
    };
  }

  async login(dto: LoginDto, ip?: string, ua?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === UserStatus.INACTIVE || user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException(`Your account is currently ${user.status.toLowerCase()}`);
    }

    // If there is an organization linked, verify organization status
    if (user.organizationId) {
      const org = await this.organizationsService.findById((user.organizationId as any).toString());
      if (org.status !== OrganizationStatus.ACTIVE) {
        throw new ForbiddenException(`Your organization is currently ${org.status.toLowerCase()}`);
      }
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken((user._id as any).toString(), tokens.refreshToken);

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId: user.organizationId ? (user.organizationId as any).toString() : '',
      userId: user._id.toString(),
      action: 'auth.login',
      description: `User ${user.email} successfully logged in`,
      ipAddress: ip,
      userAgent: ua,
    });

    return {
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        status: user.status,
        organizationId: user.organizationId,
      },
      tokens,
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(`User is currently ${user.status.toLowerCase()}`);
    }

    const isRefreshMatch = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isRefreshMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(user);
    await this.usersService.updateRefreshToken((user._id as any).toString(), tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, ip?: string, ua?: string) {
    const user = await this.usersService.findById(userId);
    const orgId = user?.organizationId ? (user.organizationId as any).toString() : '';

    await this.usersService.updateRefreshToken(userId, null);

    // Emit audit log event
    this.auditLogEmitter.emit('audit.log', {
      orgId,
      userId,
      action: 'auth.logout',
      description: `User ${user?.email || userId} logged out`,
      ipAddress: ip,
      userAgent: ua,
    });

    return { success: true, message: 'Logged out successfully' };
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId ? user.organizationId.toString() : undefined,
    };

    const accessTokenSecret = this.configService.get<string>('JWT_SECRET');
    const refreshTokenSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessTokenSecret,
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: refreshTokenSecret,
        expiresIn: '7d',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
