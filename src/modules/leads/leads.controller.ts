import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { LeadStatus, LeadSource } from './schemas/lead.schema';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  @ApiResponse({ status: 201, description: 'Lead created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Validation error' })
  async createLead(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body() dto: CreateLeadDto,
  ) {
    return this.leadsService.createLead(orgId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve and filter leads' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'status', required: false, enum: LeadStatus, description: 'Filter by lead status' })
  @ApiQuery({ name: 'source', required: false, enum: LeadSource, description: 'Filter by lead source' })
  @ApiQuery({ name: 'ownerId', required: false, type: String, description: 'Filter by lead owner user ID' })
  @ApiResponse({ status: 200, description: 'Leads list retrieved successfully' })
  async getLeads(
    @GetUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: LeadStatus,
    @Query('source') source?: LeadSource,
    @Query('ownerId') ownerId?: string,
  ) {
    return this.leadsService.findLeads(orgId, { page, limit, status, source, ownerId });
  }

  @Get('pipeline-stats')
  @ApiOperation({ summary: 'Retrieve pipeline metrics count and total deals values (grouped by status)' })
  @ApiResponse({ status: 200, description: 'Pipeline stats retrieved successfully' })
  async getPipelineStats(@GetUser('organizationId') orgId: string) {
    return this.leadsService.getPipelineStats(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a lead by ID with status transition history log' })
  @ApiResponse({ status: 200, description: 'Lead details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async getLead(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.getLead(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a lead or trigger status transition' })
  @ApiResponse({ status: 200, description: 'Lead updated successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async updateLead(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leadsService.updateLead(orgId, userId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lead (Org Admin or Manager only)' })
  @ApiResponse({ status: 204, description: 'Lead deleted successfully' })
  @ApiResponse({ status: 404, description: 'Lead not found' })
  async deleteLead(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.leadsService.removeLead(orgId, userId, id);
  }
}
