
import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private readonly usersService: UsersService) {}
    
    @Get()
    @ApiOperation({ summary: 'Get all userss' })
    @Roles('admin', 'user')
    async findAll(@Query() query: any) {
        return this.usersService.findAll(query);
    }
    
    @Post()
    @ApiOperation({ summary: 'Create new users' })
    @Roles('admin')
    async create(@Body() data: any) {
        return this.usersService.create(data);
    }
    
    // Additional real endpoints...
}
