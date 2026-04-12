import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(private prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    const credit = await this.prisma.userCredit.findUnique({
      where: { userId },
    });
    return credit?.balance ?? 0;
  }

  async hasSufficientCredits(
    userId: string,
    required: number,
  ): Promise<boolean> {
    const balance = await this.getBalance(userId);
    return balance >= required;
  }

  async deduct(
    userId: string,
    amount: number,
    reason: CreditReason,
    referenceId?: string,
    metadata?: object,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const credit = await tx.userCredit.findUnique({
        where: { userId },
      });

      if (!credit || credit.balance < amount) {
        throw new BadRequestException('Insufficient credits');
      }

      const newBalance = credit.balance - amount;

      await tx.userCredit.update({
        where: { userId },
        data: { balance: newBalance },
      });

      await tx.creditTransaction.create({
        data: {
          creditId: credit.id,
          amount: -amount,
          balanceAfter: newBalance,
          reason,
          referenceId,
          metadata: metadata ?? undefined,
        },
      });

      return newBalance;
    });
  }

  async grant(
    userId: string,
    amount: number,
    reason: CreditReason,
    referenceId?: string,
    metadata?: object,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const credit = await tx.userCredit.findUnique({
        where: { userId },
      });

      if (!credit) {
        throw new BadRequestException('User has no credit account');
      }

      const newBalance = credit.balance + amount;

      await tx.userCredit.update({
        where: { userId },
        data: { balance: newBalance },
      });

      await tx.creditTransaction.create({
        data: {
          creditId: credit.id,
          amount,
          balanceAfter: newBalance,
          reason,
          referenceId,
          metadata: metadata ?? undefined,
        },
      });

      return newBalance;
    });
  }

  async initializeCredits(userId: string): Promise<void> {
    const existing = await this.prisma.userCredit.findUnique({
      where: { userId },
    });
    if (existing) return;

    const credit = await this.prisma.userCredit.create({
      data: { userId, balance: 100 },
    });

    await this.prisma.creditTransaction.create({
      data: {
        creditId: credit.id,
        amount: 100,
        balanceAfter: 100,
        reason: CreditReason.SIGNUP_BONUS,
      },
    });

    this.logger.log(`Initialized 100 credits for user ${userId}`);
  }

  async grantDailyBonus(userId: string): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const credit = await this.prisma.userCredit.findUnique({
      where: { userId },
      include: {
        transactions: {
          where: {
            reason: CreditReason.DAILY_BONUS,
            createdAt: { gte: today },
          },
          take: 1,
        },
      },
    });

    if (!credit) {
      await this.initializeCredits(userId);
      return false;
    }

    if (credit.transactions.length > 0) return false;

    await this.grant(userId, 5, CreditReason.DAILY_BONUS);
    return true;
  }

  async getTransactions(
    userId: string,
    limit = 20,
    offset = 0,
  ) {
    const credit = await this.prisma.userCredit.findUnique({
      where: { userId },
    });
    if (!credit) return [];

    return this.prisma.creditTransaction.findMany({
      where: { creditId: credit.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }
}
