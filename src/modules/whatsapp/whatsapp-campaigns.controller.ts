import { Controller, Post, Get, Patch, Delete, Body, Param, Query, HttpStatus, HttpCode, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { WhatsappCampaignsService } from './services/whatsapp-campaigns.service';
import { WhatsappAudienceCompilerService } from './services/whatsapp-audience-compiler.service';
import { CreateWhatsappCampaignDto } from './dto/create-whatsapp-campaign.dto';
import { UpdateWhatsappCampaignDto } from './dto/update-whatsapp-campaign.dto';
import { AudienceSegmentFilterDto } from '../campaigns/dto/audience-segment-filter.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

// Ensure temporary upload directory exists
const ATTACHMENT_UPLOAD_DIR = process.env.VERCEL === '1'
  ? path.join('/tmp', 'uploads', 'whatsapp-attachments')
  : path.join(process.cwd(), 'uploads', 'whatsapp-attachments');
if (!fs.existsSync(ATTACHMENT_UPLOAD_DIR)) {
  fs.mkdirSync(ATTACHMENT_UPLOAD_DIR, { recursive: true });
}

@ApiTags('WhatsApp Campaigns')
@ApiBearerAuth()
@Controller('whatsapp-campaigns')
@Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
export class WhatsappCampaignsController {
  constructor(
    private readonly campaignsService: WhatsappCampaignsService,
    private readonly audienceService: WhatsappAudienceCompilerService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new WhatsApp campaign draft' })
  @ApiResponse({ status: 201, description: 'WhatsApp campaign created successfully' })
  async createCampaign(
    @GetUser('organizationId') orgId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateWhatsappCampaignDto,
  ) {
    return this.campaignsService.createCampaign(orgId, userId, dto);
  }

  @Post('audience/preview')
  @ApiOperation({ summary: 'Preview contact matching statistics for a WhatsApp segment filter' })
  async preview(
    @GetUser('organizationId') orgId: string,
    @Body() dto: AudienceSegmentFilterDto,
  ) {
    return this.audienceService.getSegmentPreview(orgId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List WhatsApp campaigns with pagination and search' })
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
  @ApiOperation({ summary: 'Get details of a specific WhatsApp campaign by ID' })
  async getCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.getCampaign(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a WhatsApp campaign draft or paused configuration' })
  async updateCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappCampaignDto,
  ) {
    return this.campaignsService.updateCampaign(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a WhatsApp campaign' })
  async deleteCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.campaignsService.deleteCampaign(orgId, id);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate a WhatsApp campaign' })
  async duplicateCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.duplicateCampaign(orgId, id);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule a WhatsApp campaign for sending' })
  async scheduleCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('scheduledAt') scheduledAt?: string,
  ) {
    return this.campaignsService.scheduleCampaign(orgId, id, scheduledAt);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause a scheduled or sending WhatsApp campaign' })
  async pauseCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.pauseCampaign(orgId, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume a paused WhatsApp campaign' })
  async resumeCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.resumeCampaign(orgId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a WhatsApp campaign' })
  async cancelCampaign(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.campaignsService.cancelCampaign(orgId, id);
  }

  @Get(':id/recipients')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get paginated list of recipients for a WhatsApp campaign' })
  async getCampaignRecipients(
    @GetUser('organizationId') orgId: string,
    @Param('id') campaignId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.campaignsService.getCampaignRecipients(orgId, campaignId, page, limit, status);
  }

  @Post(':id/resend')
  @ApiOperation({ summary: 'Create a follow-up WhatsApp campaign targeting recipients with a specific status' })
  async resendCampaign(
    @GetUser('organizationId') orgId: string,
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Body('status') status: string,
    @Body('name') name?: string,
  ) {
    if (!status) {
      throw new BadRequestException('Status is required for resending');
    }
    return this.campaignsService.createFollowUpCampaign(orgId, userId, id, status, name);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: ATTACHMENT_UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + path.extname(file.originalname));
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB Limit
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a WhatsApp campaign attachment (image, file, video)' })
  async addAttachment(
    @GetUser('organizationId') orgId: string,
    @Param('id') campaignId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.campaignsService.addAttachment(orgId, campaignId, file);
  }

  @Delete(':id/attachments/:filename')
  @ApiOperation({ summary: 'Remove a WhatsApp campaign attachment' })
  async removeAttachment(
    @GetUser('organizationId') orgId: string,
    @Param('id') campaignId: string,
    @Param('filename') filename: string,
  ) {
    return this.campaignsService.removeAttachment(orgId, campaignId, filename);
  }
}
