import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '../schemas/task.schema';

export class CreateTaskDto {
  @ApiProperty({ description: 'Title of the task', example: 'Follow up call' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Detailed description of task', example: 'Discuss proposal and budget adjustments', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Task status', enum: TaskStatus, example: TaskStatus.PENDING, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @ApiProperty({ description: 'Task priority', enum: TaskPriority, example: TaskPriority.MEDIUM, required: false })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority;

  @ApiProperty({ description: 'Optional due date', example: '2026-06-20T12:00:00.000Z', required: false })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiProperty({ description: 'Assigned User ID', example: '60c72b2f9b1d8b2a3c8d1034', required: false })
  @IsString()
  @IsOptional()
  assignedToId?: string;

  @ApiProperty({ description: 'Linked entity ObjectId (Contact or Lead)', example: '60c72b2f9b1d8b2a3c8d1033', required: false })
  @IsString()
  @IsOptional()
  linkedEntityId?: string;

  @ApiProperty({ description: 'Type of linked entity', enum: ['Contact', 'Lead'], example: 'Contact', required: false })
  @IsIn(['Contact', 'Lead'])
  @IsOptional()
  linkedEntityType?: 'Contact' | 'Lead';
}
