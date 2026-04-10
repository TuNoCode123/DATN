import { Injectable } from '@nestjs/common';
import { Prisma, CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';

interface CreditFilters {
  search?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AdminCreditsService {
  constructor(
    private prisma: PrismaService,
    private credits: CreditsService,
  ) {}

  async findAllUsersWithCredits(filters: CreditFilters = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};
    if (filters.search) {
      where.OR = [
        { displayName: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          role: true,
          isActive: true,
          credit: {
            select: { balance: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const mapped = data.map((u) => ({
      ...u,
      balance: u.credit?.balance ?? 0,
      credit: undefined,
    }));

    return { data: mapped, total, page, limit };
  }

  async getUserTransactions(
    userId: string,
    page = 1,
    limit = 20,
  ) {
    return this.credits.getTransactions(userId, limit, (page - 1) * limit);
  }

  async grantCredits(userId: string, amount: number) {
    // Initialize if needed
    await this.credits.initializeCredits(userId);
    return this.credits.grant(userId, amount, CreditReason.ADMIN_TOPUP);
  }

  async deductCredits(userId: string, amount: number) {
    return this.credits.deduct(userId, amount, CreditReason.ADMIN_DEDUCT);
  }
}
