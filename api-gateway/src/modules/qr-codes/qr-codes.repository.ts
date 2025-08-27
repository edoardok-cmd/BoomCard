import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QrCodesRepository {
  constructor(private prisma: PrismaService) {}
  
  async findAll(filters: any) {
    return this.prisma.qrcodes.findMany({
      where: filters,
      include: {
        // Add relations here
      }
    });
  }
  
  async findById(id: string) {
    return this.prisma.qrcodes.findUnique({
      where: { id }
    });
  }
  
  async create(data: any) {
    return this.prisma.qrcodes.create({
      data
    });
  }
  
  async update(id: string, data: any) {
    return this.prisma.qrcodes.update({
      where: { id },
      data
    });
  }
  
  async delete(id: string) {
    return this.prisma.qrcodes.delete({
      where: { id }
    });
  }
}