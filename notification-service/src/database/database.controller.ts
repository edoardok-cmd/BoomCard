
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DatabaseService } from './database.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('database')
@Controller('database')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DatabaseController {
    constructor(private readonly databaseService: DatabaseService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all databases' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.databaseService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new database' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.databaseService.create(data);
    }
    
    // Additional real endpoints...
}
