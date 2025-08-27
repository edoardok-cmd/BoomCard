import { Injectable, NotFoundException } from '@nestjs/common';
import { QrCodesRepository } from './qr-codes.repository';
import { CreateQrCodesDto } from './dto/create-qr-codes.dto';
import { UpdateQrCodesDto } from './dto/update-qr-codes.dto';

@Injectable()
export class QrCodesService {
  constructor(private repository: QrCodesRepository) {}

  async findAll(filters: any) {
    return this.repository.findAll(filters);
  }

  async findById(id: string) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException('QrCodes not found');
    }
    return item;
  }

  async create(dto: CreateQrCodesDto) {
    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateQrCodesDto) {
    await this.findById(id);
    return this.repository.update(id, dto);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(id);
  }
}