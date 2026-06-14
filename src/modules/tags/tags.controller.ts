import { Controller, Post, Get, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TagsService } from './tags.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Tags')
@ApiBearerAuth()
@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new tag definition' })
  @ApiResponse({ status: 201, description: 'Tag created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Tag already exists' })
  async createTag(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.createTag(orgId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all tag definitions in the organization' })
  @ApiResponse({ status: 200, description: 'Tags listed successfully' })
  async getTags(@GetUser('organizationId') orgId: string) {
    return this.tagsService.getTags(orgId);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a tag definition and remove it from all contacts' })
  @ApiResponse({ status: 204, description: 'Tag deleted successfully' })
  @ApiResponse({ status: 404, description: 'Tag not found' })
  async deleteTag(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.tagsService.deleteTag(orgId, id);
  }
}
