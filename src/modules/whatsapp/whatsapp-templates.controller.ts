import { Controller, Post, Get, Patch, Delete, Body, Param, HttpStatus, HttpCode, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { WhatsappTemplatesService } from './services/whatsapp-templates.service';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { SendTestWhatsappDto } from './dto/send-test-whatsapp.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

const WHATSAPP_TEMPLATE_ATTACHMENT_UPLOAD_DIR = process.env.NODE_ENV === 'test' || process.env.VERCEL === '1'
  ? path.join('/tmp', 'uploads', 'whatsapp-template-attachments')
  : path.join(process.cwd(), 'uploads', 'whatsapp-template-attachments');

if (!fs.existsSync(WHATSAPP_TEMPLATE_ATTACHMENT_UPLOAD_DIR)) {
  fs.mkdirSync(WHATSAPP_TEMPLATE_ATTACHMENT_UPLOAD_DIR, { recursive: true });
}

@ApiTags('WhatsApp Templates')
@ApiBearerAuth()
@Controller('whatsapp-templates')
export class WhatsappTemplatesController {
  constructor(private readonly templatesService: WhatsappTemplatesService) {}

  @Post()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Create a new WhatsApp template (Admin/Manager only)' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(
    @GetUser('organizationId') orgId: string,
    @GetUser('id') userId: string,
    @Body() dto: CreateWhatsappTemplateDto,
  ) {
    return this.templatesService.createTemplate(orgId, userId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'List all WhatsApp templates' })
  @ApiResponse({ status: 200, description: 'Templates list retrieved' })
  async getTemplates(@GetUser('organizationId') orgId: string) {
    return this.templatesService.getTemplates(orgId);
  }

  @Get(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get WhatsApp template details by ID' })
  async getTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.templatesService.getTemplate(orgId, id);
  }

  @Patch(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Update a WhatsApp template (Admin/Manager only)' })
  async updateTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappTemplateDto,
  ) {
    return this.templatesService.updateTemplate(orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Soft-delete a WhatsApp template (Admin/Manager only)' })
  async deleteTemplate(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    await this.templatesService.deleteTemplate(orgId, id);
  }

  @Post(':id/test-send')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Send a rendered test WhatsApp message immediately (Admin/Manager only)' })
  async sendTestMessage(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: SendTestWhatsappDto,
  ) {
    await this.templatesService.sendTestMessage(orgId, id, dto);
    return { success: true, message: 'Test WhatsApp message dispatched successfully' };
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: WHATSAPP_TEMPLATE_ATTACHMENT_UPLOAD_DIR,
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
  @ApiOperation({ summary: 'Upload a template attachment (image, file, video)' })
  async addAttachment(
    @GetUser('organizationId') orgId: string,
    @Param('id') templateId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.templatesService.addAttachment(orgId, templateId, file);
  }

  @Delete(':id/attachments/:filename')
  @ApiOperation({ summary: 'Remove a template attachment' })
  async removeAttachment(
    @GetUser('organizationId') orgId: string,
    @Param('id') templateId: string,
    @Param('filename') filename: string,
  ) {
    return this.templatesService.removeAttachment(orgId, templateId, filename);
  }
}
