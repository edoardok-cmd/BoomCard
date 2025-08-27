
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('sessions')
@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class SessionsController {
    constructor(private readonly sessionsService: SessionsService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all sessionss' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.sessionsService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new sessions' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.sessionsService.create(data);
    }
    
    // Additional real endpoints...
}
