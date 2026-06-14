import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserRole } from '../../modules/users/schemas/user.schema';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User context is missing');
    }

    // Super Admins do not require organization context
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization context is missing. Action not allowed.');
    }

    return true;
  }
}
