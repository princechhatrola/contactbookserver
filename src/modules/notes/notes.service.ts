import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { BaseTenantRepository } from '../../common/repositories/base-tenant.repository';
import { Note, NoteDocument, NoteAttachment } from './schemas/note.schema';
import { ActivityEmitter } from '../activities/activity-emitter';

@Injectable()
export class NotesService extends BaseTenantRepository<NoteDocument> {
  constructor(
    @InjectModel(Note.name)
    private readonly noteModel: Model<NoteDocument>,
    private readonly activityEmitter: ActivityEmitter,
  ) {
    super(noteModel);
  }

  async createNote(
    orgId: string,
    userId: string,
    content: string,
    linkedEntityId: string,
    linkedEntityType: 'Contact' | 'Lead' | 'Task',
    files: Express.Multer.File[],
  ): Promise<NoteDocument> {
    const attachments: NoteAttachment[] = (files || []).map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
    }));

    const note = await this.create(orgId, {
      organizationId: new Types.ObjectId(orgId),
      content: content.trim(),
      linkedEntityId: new Types.ObjectId(linkedEntityId),
      linkedEntityType,
      createdBy: new Types.ObjectId(userId),
      updatedBy: new Types.ObjectId(userId),
      attachments,
    } as any);

    // Emit timeline activity event
    this.activityEmitter.emit('activity.logged', {
      orgId,
      userId,
      eventType: 'note_added',
      description: `Added a note to ${linkedEntityType}`,
      linkedEntityId,
      linkedEntityType,
    });

    return this.getNote(orgId, note._id.toString());
  }

  async getNote(orgId: string, id: string): Promise<NoteDocument> {
    const note = await this.noteModel
      .findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(orgId) })
      .populate('createdBy', 'firstName lastName email')
      .exec();

    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }
    return note;
  }

  async getNotesForEntity(
    orgId: string,
    linkedEntityId: string,
    linkedEntityType: 'Contact' | 'Lead' | 'Task',
  ): Promise<NoteDocument[]> {
    return this.noteModel
      .find({
        organizationId: new Types.ObjectId(orgId),
        linkedEntityId: new Types.ObjectId(linkedEntityId),
        linkedEntityType,
      })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'firstName lastName email')
      .exec();
  }

  async deleteNote(orgId: string, userId: string, id: string): Promise<void> {
    const note = await this.findById(orgId, id);
    if (!note) {
      throw new NotFoundException(`Note with ID ${id} not found`);
    }

    // 1. Delete physical files from disk if they exist
    for (const attachment of note.attachments || []) {
      try {
        if (fs.existsSync(attachment.path)) {
          fs.unlinkSync(attachment.path);
        }
      } catch (err: any) {
        console.error(`Failed to delete physically stored file at ${attachment.path}: ${err.message}`);
      }
    }

    // 2. Delete note from DB
    await this.delete(orgId, id);

    // Emit timeline logging event
    this.activityEmitter.emit('activity.logged', {
      orgId,
      userId,
      eventType: 'note_deleted',
      description: `Deleted a note from ${note.linkedEntityType}`,
      linkedEntityId: note.linkedEntityId.toString(),
      linkedEntityType: note.linkedEntityType,
    });
  }
}
