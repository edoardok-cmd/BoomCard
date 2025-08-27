
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class RolesController {
    constructor(private readonly rolesService: RolesService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all roless' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.rolesService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new roles' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.rolesService.create(data);
    }
    
    // Additional real endpoints...
}
