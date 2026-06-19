import { Controller, Post, Get, Delete, Body, Param, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SuppressionListService } from './services/suppression-list.service';
import { CreateSuppressionDto } from './dto/create-suppression.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Suppression List')
@ApiBearerAuth()
@Controller('suppression-list')
@Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
export class SuppressionListController {
  constructor(private readonly suppressionService: SuppressionListService) {}

  @Post()
  @ApiOperation({ summary: 'Add an email to the suppression list' })
  @ApiResponse({ status: 201, description: 'Email added to suppression list successfully' })
  async add(
    @GetUser('organizationId') orgId: string,
    @Body() dto: CreateSuppressionDto,
  ) {
    return this.suppressionService.add(orgId, dto);
  }

  @Get()
  @Roles(UserRole.ORG_ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE)
  @ApiOperation({ summary: 'Get a paginated list of suppressed emails' })
  async getSuppressed(
    @GetUser('organizationId') orgId: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.suppressionService.getSuppressed(orgId, { search, page, limit });
  }

  @Delete(':email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an email from the suppression list' })
  async remove(
    @GetUser('organizationId') orgId: string,
    @Param('email') email: string,
  ) {
    await this.suppressionService.removeEmail(orgId, email);
  }
}
