
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('queue')
@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class QueueController {
    constructor(private readonly queueService: QueueService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all queues' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.queueService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new queue' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.queueService.create(data);
    }
    
    // Additional real endpoints...
}
