import { Controller, Post, Get, Patch, Delete, Body, Param, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './services/campaigns.service';
import { CampaignAnalyticsService } from './services/campaign-analytics.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Campaigns')
@ApiBearerAuth()
@Controller('campaigns')
@Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly analyticsService: CampaignAnalyticsService,
  ) {}

  @Get('analytics')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get campaign overview analytics & visualizations' })
  async getCampaignAnalytics(
    @GetUser('organizationId') orgId: string,
    @Query('campaignId') campaignId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.analyticsService.getAnalytics(orgId, campaignId, startDate, endDate);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new campaign draft' })
  @ApiResponse({ status: 201, description: 'Campaign created successfully' })
  async createCampaign(
    @GetUser('organizationId') orgId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.createCampaign(orgId, userId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List campaigns with pagination and search' })
  async getCampaigns(
    @GetUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.campaignsService.getCampaigns(orgId, page, limit, search);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get campaign detail by ID' })
  async getCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.getCampaign(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a campaign draft or paused configuration' })
  async updateCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.updateCampaign(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a campaign' })
  async deleteCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.campaignsService.deleteCampaign(orgId, id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a campaign configuration into a new draft' })
  async duplicateCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.duplicateCampaign(orgId, id);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a campaign for sending' })
  async scheduleCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('scheduledAt') scheduledAt?: string,
  ) {
    return this.campaignsService.scheduleCampaign(orgId, id, scheduledAt);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a scheduled or sending campaign' })
  async pauseCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.pauseCampaign(orgId, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused campaign' })
  async resumeCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.resumeCampaign(orgId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a scheduled, paused, or sending campaign' })
  async cancelCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.cancelCampaign(orgId, id);
  }
}
