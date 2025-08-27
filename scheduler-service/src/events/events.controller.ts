
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('events')
@Controller('events')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EventsController {
    constructor(private readonly eventsService: EventsService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all eventss' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.eventsService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new events' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.eventsService.create(data);
    }
    
    // Additional real endpoints...
}
