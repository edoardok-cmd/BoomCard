
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all permissionss' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.permissionsService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new permissions' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.permissionsService.create(data);
    }
    
    // Additional real endpoints...
}
