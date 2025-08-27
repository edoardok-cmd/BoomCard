import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';

@Injectable()
export class AuthService {
  constructor(private repository: AuthRepository) {}

  async findAll(filters: any) {
    return this.repository.findAll(filters);
  }

  async findById(id: string) {
    const item = await this.repository.findById(id);
    if (!item) {
      throw new NotFoundException('Auth not found');
    }
    return item;
  }

  async create(dto: CreateAuthDto) {
    return this.repository.create(dto);
  }

  async update(id: string, dto: UpdateAuthDto) {
    await this.findById(id);
    return this.repository.update(id, dto);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(id);
  }
}