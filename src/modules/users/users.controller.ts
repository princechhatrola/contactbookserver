import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Types } from 'mongoose';
import { UsersService } from './users.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, UserStatus } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
      phone: user.phone,
      role: user.role,
      status: user.status,
    }));
  }

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new user in the organization' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  async createUser(
    @GetUser('organizationId') orgId: string,
    @GetUser('role') creatorRole: string,
    @Body() dto: CreateUserDto,
  ) {
    if (dto.role === UserRole.SUPER_ADMIN && creatorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create a Super Admin user');
    }
    const defaultPassword = dto.password || 'Password123!';
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      passwordHash: defaultPassword,
      role: dto.role,
      status: dto.status || UserStatus.ACTIVE,
      organizationId: new Types.ObjectId(orgId) as any,
    });
    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
    };
  }

  @Patch('me/profile')
  @ApiOperation({ summary: 'Update current user\'s profile name and/or password' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  async updateProfile(
    @GetUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    const updated = await this.usersService.updateProfile(userId, dto);
    return {
      id: updated._id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      status: updated.status,
    };
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update an existing user' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  async updateUser(
    @GetUser('organizationId') orgId: string,
    @GetUser('role') creatorRole: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const targetUser = await this.usersService.findById(id);
    if (!targetUser.organizationId || targetUser.organizationId.toString() !== orgId) {
      throw new ForbiddenException('You do not have permission to manage this user');
    }
    if (dto.role === UserRole.SUPER_ADMIN && creatorRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign Super Admin role');
    }
    const updatePayload: any = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      role: dto.role,
      status: dto.status,
    };
    if (dto.password) {
      updatePayload.passwordHash = dto.password;
    }
    const updated = await this.usersService.update(id, updatePayload);
    return {
      id: updated._id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      status: updated.status,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 204, description: 'User deleted successfully' })
  async deleteUser(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') currentUserId: string,
    @Param('id') id: string,
  ) {
    if (id === currentUserId) {
      throw new ForbiddenException('Self-deletion is not allowed');
    }
    const targetUser = await this.usersService.findById(id);
    if (!targetUser.organizationId || targetUser.organizationId.toString() !== orgId) {
      throw new ForbiddenException('You do not have permission to manage this user');
    }
    await this.usersService.delete(id);
  }
}
