
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CacheService } from './cache.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('cache')
@Controller('cache')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class CacheController {
    constructor(private readonly cacheService: CacheService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all caches' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.cacheService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new cache' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.cacheService.create(data);
    }
    
    // Additional real endpoints...
}
