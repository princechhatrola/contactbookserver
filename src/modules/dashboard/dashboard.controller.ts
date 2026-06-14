import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Retrieve core dashboard metrics (counts, values, and task stats)' })
  @ApiResponse({ status: 200, description: 'Core metrics retrieved successfully' })
  async getMetrics(@GetUser('organizationId') orgId: string) {
    return this.dashboardService.getMetrics(orgId);
  }

  @Get('team-performance')
  @ApiOperation({ summary: 'Retrieve contact and deal ownership stats for all team members' })
  @ApiResponse({ status: 200, description: 'Team performance stats retrieved successfully' })
  async getTeamPerformance(@GetUser('organizationId') orgId: string) {
    return this.dashboardService.getTeamPerformance(orgId);
  }

  @Get('leads-by-stage')
  @ApiOperation({ summary: 'Retrieve active leads count and total value grouped by stages' })
  @ApiResponse({ status: 200, description: 'Leads by stage retrieved successfully' })
  async getLeadsByStage(@GetUser('organizationId') orgId: string) {
    return this.dashboardService.getLeadsByStage(orgId);
  }
}
