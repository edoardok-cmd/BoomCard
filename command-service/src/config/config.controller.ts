
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from './config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('config')
@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ConfigController {
    constructor(private readonly configService: ConfigService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all configs' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.configService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new config' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.configService.create(data);
    }
    
    // Additional real endpoints...
}
