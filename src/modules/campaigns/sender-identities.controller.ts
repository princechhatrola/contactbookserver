import { Controller, Post, Get, Patch, Delete, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SenderIdentitiesService } from './services/sender-identities.service';
import { CreateSenderIdentityDto } from './dto/create-sender-identity.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Sender Identities')
@ApiBearerAuth()
@Controller('sender-identities')
@Roles(UserRole.ORG_ADMIN) // Sender setups are restricted to Org Admins by default
export class SenderIdentitiesController {
  constructor(private readonly senderIdentitiesService: SenderIdentitiesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new sender identity (Org Admin only)' })
  async createSender(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateSenderIdentityDto,
  ) {
    return this.senderIdentitiesService.createSender(orgId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List all sender identities' })
  async getSenders(@GetUser('organizationId') orgId: string) {
    return this.senderIdentitiesService.getSenders(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get sender identity details by ID' })
  async getSender(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.senderIdentitiesService.getSender(orgId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sender identity (Org Admin only)' })
  async deleteSender(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.senderIdentitiesService.deleteSender(orgId, id);
  }

  @Patch(':id/default')
  @ApiOperation({ summary: 'Set a sender identity as organization default (Org Admin only)' })
  async setDefaultSender(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.senderIdentitiesService.setDefaultSender(orgId, id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Verify a sender identity email (Org Admin only)' })
  async verifySender(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.senderIdentitiesService.verifySender(orgId, id);
  }
}
