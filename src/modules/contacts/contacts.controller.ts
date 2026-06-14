import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Contacts')
@ApiBearerAuth()
@Controller('contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  @ApiResponse({ status: 201, description: 'Contact created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Validation error' })
  async createContact(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.createContact(orgId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter contacts' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Matches name, email, company, tags' })
  @ApiQuery({ name: 'tags', required: false, type: [String], description: 'Filter by tags' })
  @ApiQuery({ name: 'groups', required: false, type: [String], description: 'Filter by group IDs' })
  @ApiQuery({ name: 'company', required: false, type: String, description: 'Filter by company name' })
  @ApiQuery({ name: 'ownerId', required: false, type: String, description: 'Filter by contact owner user ID' })
  @ApiResponse({ status: 200, description: 'Contacts list retrieved successfully' })
  async getContacts(
    @GetUser('organizationId') orgId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('tags') tags?: string | string[],
    @Query('groups') groups?: string | string[],
    @Query('company') company?: string,
    @Query('ownerId') ownerId?: string,
  ) {
    // Normalize query params that could be strings or arrays
    const normalizedTags = typeof tags === 'string' ? [tags] : tags;
    const normalizedGroups = typeof groups === 'string' ? [groups] : groups;

    return this.contactsService.findContacts(orgId, {
      page,
      limit,
      search,
      tags: normalizedTags,
      groups: normalizedGroups,
      company,
      ownerId,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a contact by ID' })
  @ApiResponse({ status: 200, description: 'Contact details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async getContact(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.contactsService.getContact(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a contact by ID' })
  @ApiResponse({ status: 200, description: 'Contact updated successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async updateContact(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.updateContact(orgId, userId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a contact (Org Admin or Manager only)' })
  @ApiResponse({ status: 204, description: 'Contact deleted successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async deleteContact(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.contactsService.removeContact(orgId, userId, id);
  }

  @Post('bulk-tag')
  @ApiOperation({ summary: 'Bulk add tags to contacts' })
  @ApiResponse({ status: 200, description: 'Tags added successfully' })
  async bulkAddTags(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body('contactIds') contactIds: string[],
    @Body('tags') tags: string[],
  ) {
    const modifiedCount = await this.contactsService.addTagsToContacts(orgId, userId, contactIds, tags);
    return { success: true, modifiedCount };
  }

  @Post('bulk-untag')
  @ApiOperation({ summary: 'Bulk remove tags from contacts' })
  @ApiResponse({ status: 200, description: 'Tags removed successfully' })
  async bulkRemoveTags(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body('contactIds') contactIds: string[],
    @Body('tags') tags: string[],
  ) {
    const modifiedCount = await this.contactsService.removeTagsFromContacts(orgId, userId, contactIds, tags);
    return { success: true, modifiedCount };
  }
}
