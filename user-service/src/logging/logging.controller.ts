
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LoggingService } from './logging.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('logging')
@Controller('logging')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LoggingController {
    constructor(private readonly loggingService: LoggingService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all loggings' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.loggingService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new logging' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.loggingService.create(data);
    }
    
    // Additional real endpoints...
}
