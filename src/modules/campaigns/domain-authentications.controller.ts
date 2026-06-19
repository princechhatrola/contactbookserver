import { Controller, Post, Get, Delete, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DomainAuthenticationsService } from './services/domain-authentications.service';
import { CreateDomainDto } from './dto/create-domain.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Domain Authentication')
@ApiBearerAuth()
@Controller('domains')
@Roles(UserRole.ORG_ADMIN) // Domain setups are restricted to Org Admins by default
export class DomainAuthenticationsController {
  constructor(private readonly domainService: DomainAuthenticationsService) {}

  @Post()
  @ApiOperation({ summary: 'Register a sending domain for authentication (Org Admin only)' })
  @ApiResponse({ status: 201, description: 'Domain registered successfully with generated DKIM keys' })
  async createDomain(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateDomainDto,
  ) {
    return this.domainService.createDomain(orgId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List all registered sending domains' })
  async getDomains(@GetUser('organizationId') orgId: string) {
    return this.domainService.getDomains(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get sending domain details by ID' })
  async getDomain(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.domainService.getDomain(orgId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a registered domain (Org Admin only)' })
  async deleteDomain(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.domainService.deleteDomain(orgId, id);
  }

  @Post(':id/verify')
  @ApiOperation({ summary: 'Trigger a manual DNS lookup SPF/DKIM/DMARC check (Org Admin only)' })
  async verifyDomain(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.domainService.verifyDomain(orgId, id);
  }
}
