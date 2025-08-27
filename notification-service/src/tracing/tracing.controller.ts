
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TracingService } from './tracing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('tracing')
@Controller('tracing')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class TracingController {
    constructor(private readonly tracingService: TracingService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all tracings' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.tracingService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new tracing' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.tracingService.create(data);
    }
    
    // Additional real endpoints...
}
