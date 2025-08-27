import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private prisma: PrismaService) {}
  
  async findAll(filters: any) {
    return this.prisma.auth.findMany({
      where: filters,
      include: {
        // Add relations here
      }
    });
  }
  
  async findById(id: string) {
    return this.prisma.auth.findUnique({
      where: { id }
    });
  }
  
  async create(data: any) {
    return this.prisma.auth.create({
      data
    });
  }
  
  async update(id: string, data: any) {
    return this.prisma.auth.update({
      where: { id },
      data
    });
  }
  
  async delete(id: string) {
    return this.prisma.auth.delete({
      where: { id }
    });
  }
}