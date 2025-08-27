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
import { QrCodesService } from './qr-codes.service';
import { CreateQrCodesDto } from './dto/create-qr-codes.dto';
import { UpdateQrCodesDto } from './dto/update-qr-codes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('qr-codes')
@Controller('qr-codes')
@UseGuards(JwtAuthGuard)
export class QrCodesController {
  constructor(private readonly qrcodesService: QrCodesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all qr-codes' })
  async findAll(@Query() query: any) {
    return this.qrcodesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get qr-codes by id' })
  async findOne(@Param('id') id: string) {
    return this.qrcodesService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new qr-codes' })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateQrCodesDto) {
    return this.qrcodesService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update qr-codes' })
  async update(@Param('id') id: string, @Body() dto: UpdateQrCodesDto) {
    return this.qrcodesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete qr-codes' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.qrcodesService.delete(id);
  }
}