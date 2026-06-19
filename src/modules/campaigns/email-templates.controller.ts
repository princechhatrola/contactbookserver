import { Controller, Post, Get, Patch, Delete, Body, Param, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EmailTemplatesService } from './services/email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { SendTestEmailDto } from './dto/send-test-email.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Email Templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly templatesService: EmailTemplatesService) {}

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new email template (Admin/Manager only)' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(
    @GetUser('organizationId') orgId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateEmailTemplateDto,
  ) {
    return this.templatesService.createTemplate(orgId, userId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List all email templates' })
  @ApiResponse({ status: 200, description: 'Templates list retrieved' })
  async getTemplates(@GetUser('organizationId') orgId: string) {
    return this.templatesService.getTemplates(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get email template details by ID' })
  async getTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.templatesService.getTemplate(orgId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update an email template (Admin/Manager only)' })
  async updateTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.templatesService.updateTemplate(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Soft-delete an email template (Admin/Manager only)' })
  async deleteTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.templatesService.deleteTemplate(orgId, id);
  }

  @Post(':id/test-send')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Send a rendered test email immediately (Admin/Manager only)' })
  async sendTestEmail(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: SendTestEmailDto,
  ) {
    await this.templatesService.sendTestEmail(orgId, id, dto);
    return { success: true, message: 'Test email dispatched successfully' };
  }
}
