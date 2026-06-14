import { Controller, Post, Get, Delete, Body, Param, HttpStatus, HttpCode, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('API Keys')
@ApiBearerAuth()
@Controller('api-keys')
@Roles(UserRole.ORG_ADMIN) // API key management is restricted to Org Admins
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new developer API key (Org Admin only)' })
  @ApiResponse({ status: 201, description: 'API Key generated successfully' })
  async generateKey(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body('name') name: string,
  ) {
    if (!name || name.trim() === '') {
      throw new BadRequestException('API key name is required');
    }
    const result = await this.apiKeysService.generateKey(orgId, userId, name.trim());
    return {
      message: 'API Key generated successfully. Save this key somewhere safe as it will not be shown again.',
      id: result.apiKey._id,
      name: result.apiKey.name,
      keyPreview: result.apiKey.keyPreview,
      rawKey: result.rawKey,
      createdAt: (result.apiKey as any).createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all active API key definitions (Org Admin only)' })
  @ApiResponse({ status: 200, description: 'API keys list retrieved successfully' })
  async getKeys(@GetUser('organizationId') orgId: string) {
    const keys = await this.apiKeysService.getKeys(orgId);
    return keys.map(key => ({
      id: key._id,
      name: key.name,
      keyPreview: key.keyPreview,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      createdAt: (key as any).createdAt,
      createdBy: key.createdBy ? {
        id: (key.createdBy as any)._id,
        firstName: (key.createdBy as any).firstName,
        lastName: (key.createdBy as any).lastName,
        email: (key.createdBy as any).email,
      } : null,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke and delete a developer API key (Org Admin only)' })
  @ApiResponse({ status: 204, description: 'API key successfully revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeKey(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.apiKeysService.revokeKey(orgId, id);
  }
}
