
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class AuthController {
    constructor(private readonly authService: AuthService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all auths' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.authService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new auth' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.authService.create(data);
    }
    
    // Additional real endpoints...
}
