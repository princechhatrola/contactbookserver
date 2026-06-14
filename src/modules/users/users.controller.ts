import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users in the active organization' })
  @ApiResponse({ status: 200, description: 'List of organization users retrieved successfully' })
  async getOrganizationUsers(@GetUser('organizationId') orgId: string) {
    const users = await this.usersService.findByOrganization(orgId);
    // Sanitize user objects before returning
    return users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      status: user.status,
    }));
  }
}
