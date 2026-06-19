import { Controller, Post, Get, Patch, Delete, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EmailProvidersService } from './services/email-providers.service';
import { CreateEmailProviderDto } from './dto/create-email-provider.dto';
import { UpdateEmailProviderDto } from './dto/update-email-provider.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Email Providers')
@ApiBearerAuth()
@Controller('email-providers')
@Roles(UserRole.ORG_ADMIN) // Provider setup is restricted to Org Admins by default
export class EmailProvidersController {
  constructor(private readonly emailProvidersService: EmailProvidersService) {}

  @Post()
  @ApiOperation({ summary: 'Connect a new email provider (Org Admin only)' })
  @ApiResponse({ status: 201, description: 'Email provider connected successfully' })
  async createProvider(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateEmailProviderDto,
  ) {
    return this.emailProvidersService.createProvider(orgId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List all email providers' })
  @ApiResponse({ status: 200, description: 'Providers list retrieved' })
  async getProviders(@GetUser('organizationId') orgId: string) {
    return this.emailProvidersService.getProviders(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get email provider details by ID' })
  async getProvider(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.emailProvidersService.getProvider(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update email provider details (Org Admin only)' })
  async updateProvider(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmailProviderDto,
  ) {
    return this.emailProvidersService.updateProvider(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an email provider (Org Admin only)' })
  async deleteProvider(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.emailProvidersService.deleteProvider(orgId, id);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test email provider connection' })
  async testConnection(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    const success = await this.emailProvidersService.testProviderConnection(orgId, id);
    return { success, message: success ? 'Connection test successful' : 'Connection test failed' };
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Update email provider rotation priority (Org Admin only)' })
  async updatePriority(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('priority') priority: number,
  ) {
    return this.emailProvidersService.updatePriority(orgId, id, priority);
  }
}
