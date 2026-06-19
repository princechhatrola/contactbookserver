import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AudienceCompilerService } from './services/audience-compiler.service';
import { AudienceSegmentFilterDto } from './dto/audience-segment-filter.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';

@ApiTags('Audience Segments')
@ApiBearerAuth()
@Controller('audience')
@Roles(UserRole.ORG_ADMIN, UserRole.MANAGER)
export class AudienceController {
  constructor(private readonly audienceService: AudienceCompilerService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview contact matching statistics for a segment filter' })
  @ApiResponse({ status: 200, description: 'Segment stats calculated successfully' })
  async preview(
    @GetUser('organizationId') orgId: string,
    @Body() dto: AudienceSegmentFilterDto,
  ) {
    return this.audienceService.getSegmentPreview(orgId, dto);
  }

  @Post('contacts')
  @ApiOperation({ summary: 'Retrieve list of non-suppressed contacts matching segment filters' })
  @ApiResponse({ status: 200, description: 'Matching contacts list retrieved' })
  async contacts(
    @GetUser('organizationId') orgId: string,
    @Body() dto: AudienceSegmentFilterDto,
  ) {
    return this.audienceService.compileSegment(orgId, dto);
  }
}
