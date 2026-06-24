import { Controller, Post, Get, Patch, Delete, Body, Param, HttpStatus, HttpCode, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { WhatsappProvidersService } from './services/whatsapp-providers.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('WhatsApp Providers')
@ApiBearerAuth()
@Controller('whatsapp-providers')
@Roles(UserRole.ORG_ADMIN) // Restricted to Organization Admins by default
export class WhatsappProvidersController {
  constructor(private readonly providersService: WhatsappProvidersService) {}

  @Post()
  @ApiOperation({ summary: 'Register a new WhatsApp number container (Org Admin only)' })
  @ApiResponse({ status: 201, description: 'WhatsApp provider container registered successfully' })
  async registerNumber(
    @GetUser('organizationId') orgId: string,
    @Body('name') name: string,
  ) {
    if (!name || !name.trim()) {
      throw new Error('Name is required');
    }
    return this.providersService.createProvider(orgId, name);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'List all organization WhatsApp accounts' })
  async getNumbers(@GetUser('organizationId') orgId: string) {
    return this.providersService.getProviders(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get details of a specific WhatsApp account by ID' })
  async getNumber(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.providersService.getProvider(orgId, id);
  }

  @Post(':id/connect')
  @ApiOperation({ summary: 'Initialize connection and start generating QR' })
  async connectNumber(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.providersService.connectProvider(orgId, id);
    return { success: true, message: 'Initialization started. Fetch QR code next.' };
  }

  @Get(':id/qr')
  @ApiOperation({ summary: 'Get current connection status and QR code text' })
  async getQR(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    const provider = await this.providersService.getProvider(orgId, id);
    return {
      status: provider.status,
      qrCode: provider.qrCode, // raw qr string to render as SVG/SVG-image on client
      error: provider.error,
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a WhatsApp account (Org Admin only)' })
  async deleteNumber(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.providersService.deleteProvider(orgId, id);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Update WhatsApp account rotation priority (Org Admin only)' })
  async updatePriority(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('priority') priority: number,
  ) {
    return this.providersService.updatePriority(orgId, id, priority);
  }
}
