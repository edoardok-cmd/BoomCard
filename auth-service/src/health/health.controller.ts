
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('health')
@Controller('health')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class HealthController {
    constructor(private readonly healthService: HealthService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all healths' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.healthService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new health' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.healthService.create(data);
    }
    
    // Additional real endpoints...
}
