
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('metrics')
@Controller('metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MetricsController {
    constructor(private readonly metricsService: MetricsService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all metricss' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.metricsService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new metrics' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.metricsService.create(data);
    }
    
    // Additional real endpoints...
}
