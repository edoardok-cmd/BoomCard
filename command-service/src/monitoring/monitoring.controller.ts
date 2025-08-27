
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MonitoringService } from './monitoring.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('monitoring')
@Controller('monitoring')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MonitoringController {
    constructor(private readonly monitoringService: MonitoringService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all monitorings' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.monitoringService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new monitoring' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.monitoringService.create(data);
    }
    
    // Additional real endpoints...
}
