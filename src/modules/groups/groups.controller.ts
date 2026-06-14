import { Controller, Post, Get, Patch, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Groups')
@ApiBearerAuth()
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  @ApiResponse({ status: 201, description: 'Group created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Group already exists' })
  async createGroup(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.createGroup(orgId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all groups in the organization' })
  @ApiResponse({ status: 200, description: 'Groups listed successfully' })
  async getGroups(@GetUser('organizationId') orgId: string) {
    return this.groupsService.getGroups(orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific group' })
  @ApiResponse({ status: 200, description: 'Group details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async getGroup(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.groupsService.getGroup(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update group details' })
  @ApiResponse({ status: 200, description: 'Group updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Group already exists' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async updateGroup(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a group (Org Admin or Manager only)' })
  @ApiResponse({ status: 204, description: 'Group deleted successfully' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async deleteGroup(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.groupsService.deleteGroup(orgId, id);
  }

  @Post(':id/contacts/add')
  @ApiOperation({ summary: 'Bulk add contacts to a group' })
  @ApiResponse({ status: 200, description: 'Contacts added to group successfully' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async addContactsToGroup(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('contactIds') contactIds: string[],
  ) {
    const modifiedCount = await this.groupsService.addContactsToGroup(orgId, id, contactIds);
    return { success: true, modifiedCount };
  }

  @Post(':id/contacts/remove')
  @ApiOperation({ summary: 'Bulk remove contacts from a group' })
  @ApiResponse({ status: 200, description: 'Contacts removed from group successfully' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  async removeContactsFromGroup(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body('contactIds') contactIds: string[],
  ) {
    const modifiedCount = await this.groupsService.removeContactsFromGroup(orgId, id, contactIds);
    return { success: true, modifiedCount };
  }
}
