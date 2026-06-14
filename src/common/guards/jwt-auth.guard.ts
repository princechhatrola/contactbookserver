import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeysService } from '../../modules/api-keys/api-keys.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token missing');
    }

    // Check if it is a developer API Key
    if (token.startsWith('cf_live_')) {
      const apiKeyDoc = await this.apiKeysService.validateKey(token);
      if (!apiKeyDoc || !apiKeyDoc.isActive) {
        throw new UnauthorizedException('Invalid or inactive developer API Key');
      }

      // Inject simulated organization admin context
      request.user = {
        userId: apiKeyDoc.createdBy.toString(),
        email: 'api-key@contactflow.internal',
        role: 'Organization Admin',
        organizationId: apiKeyDoc.organizationId.toString(),
        isApiKey: true,
      };
      return true;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      
      // Inject user payload into request object
      request.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
      };
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}
