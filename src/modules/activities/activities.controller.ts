import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Activities')
@ApiBearerAuth()
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Retrieve activity timeline entries for the organization or a linked entity' })
  @ApiQuery({ name: 'linkedEntityId', required: false, type: String, description: 'Filter by linked entity ObjectId' })
  @ApiQuery({ name: 'linkedEntityType', required: false, enum: ['Contact', 'Lead', 'Task'], description: 'Filter by linked entity type' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Timeline list retrieved successfully' })
  async getActivities(
    @GetUser('organizationId') orgId: string,
    @Query('linkedEntityId') linkedEntityId?: string,
    @Query('linkedEntityType') linkedEntityType?: 'Contact' | 'Lead' | 'Task',
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.activitiesService.findActivities(orgId, {
      linkedEntityId,
      linkedEntityType,
      page,
      limit,
    });
  }
}
