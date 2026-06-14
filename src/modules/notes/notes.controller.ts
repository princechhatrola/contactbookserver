import { 
  Controller, 
  Post, 
  Get, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseInterceptors, 
  UploadedFiles, 
  Res, 
  NotFoundException, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import * as express from 'express';
import * as fs from 'fs';
import { NotesService } from './notes.service';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Notes')
@ApiBearerAuth()
@Controller()
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Post('notes')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: (req: any, file: any, cb: any) => {
          // req.user contains JWT user details from auth guard
          const orgId = req.user?.organizationId || 'unassigned';
          const baseUploadPath = process.env.VERCEL === '1' ? '/tmp/uploads' : './uploads';
          const uploadPath = `${baseUploadPath}/${orgId}`;
          fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (req: any, file: any, cb: any) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}-${file.originalname.replace(/\s+/g, '_')}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file limit
      },
    }),
  )
  @ApiOperation({ summary: 'Add a new rich note with optional file attachments' })
  @ApiResponse({ status: 201, description: 'Note added successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async createNote(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body('content') content: string,
    @Body('linkedEntityId') linkedEntityId: string,
    @Body('linkedEntityType') linkedEntityType: 'Contact' | 'Lead' | 'Task',
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.notesService.createNote(orgId, userId, content, linkedEntityId, linkedEntityType, files);
  }

  @Get('notes')
  @ApiOperation({ summary: 'Retrieve all notes linked to a specific entity' })
  @ApiResponse({ status: 200, description: 'Notes list retrieved successfully' })
  async getNotes(
    @GetUser('organizationId') orgId: string,
    @Query('linkedEntityId') linkedEntityId: string,
    @Query('linkedEntityType') linkedEntityType: 'Contact' | 'Lead' | 'Task',
  ) {
    return this.notesService.getNotesForEntity(orgId, linkedEntityId, linkedEntityType);
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a note and purge its associated disk files' })
  @ApiResponse({ status: 204, description: 'Note deleted successfully' })
  @ApiResponse({ status: 404, description: 'Note not found' })
  async deleteNote(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.notesService.deleteNote(orgId, userId, id);
  }

  @Get('attachments/:filename')
  @ApiOperation({ summary: 'Retrieve a note attachment securely, isolated by organization boundary' })
  @ApiResponse({ status: 200, description: 'Attachment file stream' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async downloadAttachment(
    @GetUser('organizationId') orgId: string,
    @Param('filename') filename: string,
    @Res() res: express.Response,
  ) {
    // Find note under org boundary that contains the attachment
    const note = await this.notesService.findOne(orgId, { 'attachments.filename': filename } as any);
    if (!note) {
      throw new NotFoundException('Attachment not found or access denied');
    }

    const attachment = note.attachments.find((a) => a.filename === filename);
    if (!attachment) {
      throw new NotFoundException('Attachment metadata missing');
    }

    if (!fs.existsSync(attachment.path)) {
      throw new NotFoundException('Attachment file missing on disk storage');
    }

    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${attachment.originalName}"`);
    
    const fileStream = fs.createReadStream(attachment.path);
    fileStream.pipe(res);
  }
}
