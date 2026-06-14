import { Controller, Post, Get, Body, Query, Param, Res, NotFoundException, BadRequestException } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExportsService } from './exports.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ExportEntityType, ExportFormat } from './schemas/export-job.schema';

@ApiTags('Exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('start')
  @ApiOperation({ summary: 'Request a background data export' })
  async startExport(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body() dto: {
      entityType: ExportEntityType;
      format: ExportFormat;
      groupId?: string;
    },
  ) {
    if (!dto.entityType || !dto.format) {
      throw new BadRequestException('entityType and format are required');
    }

    return this.exportsService.createJob(orgId, userId, dto.entityType, dto.format, dto.groupId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get paginated export history' })
  async getExportHistory(
    @GetUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 10;
    return this.exportsService.getHistory(orgId, p, l);
  }

  @Get('download/:filename')
  @ApiOperation({ summary: 'Download a completed export file securely' })
  async downloadFile(
    @GetUser('organizationId') orgId: string,
    @Param('filename') filename: string,
    @Res() res: any,
  ) {
    // 1. Verify this file belongs to the user's organization
    const job = await this.exportsService.findJobByFilename(orgId, filename);
    if (!job || job.status !== 'Completed' || !job.filePath) {
      throw new NotFoundException('Export file not found or unauthorized');
    }

    // 2. Resolve path
    const filePath = path.resolve(job.filePath);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Export file does not exist on disk');
    }

    // 3. Set response headers & download
    res.download(filePath, job.fileName || filename);
  }
}
