import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('audit-logs')
@Roles(UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN)
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve paginated organization audit logs' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by user ID' })
  @ApiQuery({ name: 'action', required: false, type: String, description: 'Filter by action name' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'Filter by start date (ISO string)' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'Filter by end date (ISO string)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved successfully' })
  async getAuditLogs(
    @GetUser('organizationId') orgId: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogsService.queryLogs(orgId, {
      userId,
      action,
      startDate,
      endDate,
      page,
      limit,
    });
  }
}
