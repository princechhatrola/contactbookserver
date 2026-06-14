import { Controller, Post, Get, Delete, Body, Param, UseGuards, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Custom Fields')
@ApiBearerAuth()
@Controller('contacts/custom-fields')
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Post()
  @Roles(UserRole.ORG_ADMIN)
  @ApiOperation({ summary: 'Create a new custom field definition (Org Admin only)' })
  @ApiResponse({ status: 201, description: 'Custom field definition created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Validation error' })
  @ApiResponse({ status: 409, description: 'Key already exists' })
  async createDefinition(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateCustomFieldDefinitionDto,
  ) {
    return this.customFieldsService.createDefinition(orgId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve all custom field definitions for the active organization' })
  @ApiResponse({ status: 200, description: 'Custom field definitions retrieved successfully' })
  async getDefinitions(@GetUser('organizationId') orgId: string) {
    return this.customFieldsService.getDefinitions(orgId);
  }

  @Delete(':id')
  @Roles(UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom field definition (Org Admin only)' })
  @ApiResponse({ status: 204, description: 'Custom field definition deleted successfully' })
  @ApiResponse({ status: 400, description: 'Definition not found or cross-tenant delete attempt' })
  async deleteDefinition(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.customFieldsService.deleteDefinition(orgId, id);
  }
}
