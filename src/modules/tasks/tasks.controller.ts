import { Controller, Post, Get, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { TaskStatus } from './schemas/task.schema';

@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({ status: 201, description: 'Task created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request / Validation error' })
  async createTask(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.createTask(orgId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Query and filter tasks' })
  @ApiQuery({ name: 'status', required: false, enum: TaskStatus, description: 'Filter by task status' })
  @ApiQuery({ name: 'assignedToId', required: false, type: String, description: 'Filter by assigned user ID' })
  @ApiQuery({ name: 'linkedEntityId', required: false, type: String, description: 'Filter by linked Contact or Lead ID' })
  @ApiQuery({ name: 'linkedEntityType', required: false, enum: ['Contact', 'Lead'], description: 'Filter by linked entity type' })
  @ApiResponse({ status: 200, description: 'Tasks list retrieved successfully' })
  async getTasks(
    @GetUser('organizationId') orgId: string,
    @Query('status') status?: TaskStatus,
    @Query('assignedToId') assignedToId?: string,
    @Query('linkedEntityId') linkedEntityId?: string,
    @Query('linkedEntityType') linkedEntityType?: 'Contact' | 'Lead',
  ) {
    return this.tasksService.findTasks(orgId, { status, assignedToId, linkedEntityId, linkedEntityType });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific task' })
  @ApiResponse({ status: 200, description: 'Task details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async getTask(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.getTask(orgId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task details or transition status' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async updateTask(
    @GetUser('organizationId') orgId: string,
    @GetUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(orgId, userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a task' })
  @ApiResponse({ status: 204, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async deleteTask(
    @GetUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.tasksService.removeTask(orgId, id);
  }
}
