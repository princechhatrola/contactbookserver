import { Controller, Post, Get, Body, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ImportsService } from './imports.service';
import { StorageService } from '../storage/storage.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { getFilePreview } from './utils/preview.util';

// Ensure upload directory exists
const UPLOAD_DIR = process.env.VERCEL === '1'
  ? path.join('/tmp', 'uploads', 'imports')
  : path.join(process.cwd(), 'uploads', 'imports');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

@ApiTags('Imports')
@ApiBearerAuth()
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a CSV or XLSX contacts file for mapping preview' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, uniqueSuffix + path.extname(file.originalname));
        },
      }),
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.csv' && ext !== '.xlsx' && ext !== '.xls') {
          return cb(new BadRequestException('Only CSV and Excel files are allowed!'), false);
        }
        cb(null, true);
      },
      limits: {
        fileSize: 20 * 1024 * 1024, // 20MB
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      const { headers, previewRows } = await getFilePreview(file.path, file.originalname);
      
      // Upload file to S3/Local Storage
      const s3Key = `imports/${file.filename}`;
      await this.storageService.uploadFile(file.path, s3Key);

      // Cleanup local temp file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        fileId: file.filename,
        fileName: file.originalname,
        headers,
        previewRows,
      };
    } catch (err: any) {
      // Cleanup local temp file on error
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      throw new BadRequestException(`Failed to parse and store file: ${err.message}`);
    }
  }

  @Post('start')
  @ApiOperation({ summary: 'Start a contacts bulk import background worker job' })
  async startImport(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body() dto: {
      fileName: string;
      fileId: string;
      columnMapping: Record<string, string>;
      duplicateStrategy: 'skip' | 'overwrite';
      groupId?: string;
    },
  ) {
    if (!dto.fileId || !dto.columnMapping || !dto.duplicateStrategy || !dto.fileName) {
      throw new BadRequestException('Missing required body fields');
    }

    // Verify file exists in S3/Local Storage
    const s3Key = `imports/${dto.fileId}`;
    const fileExists = await this.storageService.exists(s3Key);
    if (!fileExists) {
      throw new BadRequestException('Uploaded file does not exist or has expired');
    }

    return this.importsService.createJob(
      orgId,
      userId,
      dto.fileName,
      dto.fileId,
      dto.columnMapping,
      dto.duplicateStrategy,
      dto.groupId,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get paginated history of bulk import jobs' })
  async getImportHistory(
    @GetUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const p = page ? Number(page) : 1;
    const l = limit ? Number(limit) : 10;
    return this.importsService.getHistory(orgId, p, l);
  }
}
