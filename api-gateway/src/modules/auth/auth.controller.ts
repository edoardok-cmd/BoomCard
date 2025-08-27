import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  @ApiOperation({ summary: 'Get all auth' })
  async findAll(@Query() query: any) {
    return this.authService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get auth by id' })
  async findOne(@Param('id') id: string) {
    return this.authService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new auth' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateAuthDto) {
    return this.authService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update auth' })
  async update(@Param('id') id: string, @Body() dto: UpdateAuthDto) {
    return this.authService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete auth' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.authService.delete(id);
  }
}