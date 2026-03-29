import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async search(query: string, limit = 10) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { displayName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: { id: true, displayName: true, email: true, avatarUrl: true },
      take: limit,
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
  }) {
    return this.prisma.user.create({ data });
  }
}
