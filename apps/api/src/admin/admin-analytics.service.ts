import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminAnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, totalTests, totalAttempts, scoreAgg] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.test.count(),
        this.prisma.userAttempt.count(),
        this.prisma.userAttempt.aggregate({
          _avg: { scorePercent: true },
          where: { status: 'SUBMITTED' },
        }),
      ]);

    const publishedTests = await this.prisma.test.count({
      where: { isPublished: true },
    });

    return {
      totalUsers,
      totalTests,
      publishedTests,
      totalAttempts,
      avgScore: Math.round((scoreAgg._avg.scorePercent ?? 0) * 100) / 100,
    };
  }

  async getUserGrowth() {
    const users = await this.prisma.user.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthly: Record<string, number> = {};
    for (const user of users) {
      const key = user.createdAt.toISOString().slice(0, 7); // YYYY-MM
      monthly[key] = (monthly[key] || 0) + 1;
    }

    let cumulative = 0;
    return Object.entries(monthly).map(([month, count]) => {
      cumulative += count;
      return { label: month, value: cumulative };
    });
  }

  async getTestActivity() {
    const attempts = await this.prisma.userAttempt.findMany({
      select: { startedAt: true },
      orderBy: { startedAt: 'asc' },
    });

    const monthly: Record<string, number> = {};
    for (const attempt of attempts) {
      const key = attempt.startedAt.toISOString().slice(0, 7);
      monthly[key] = (monthly[key] || 0) + 1;
    }

    return Object.entries(monthly).map(([month, count]) => ({
      label: month,
      value: count,
    }));
  }

  async getScoreDistribution() {
    const attempts = await this.prisma.userAttempt.findMany({
      where: { status: 'SUBMITTED', scorePercent: { not: null } },
      select: { scorePercent: true },
    });

    const ranges = [
      { label: '0-20', min: 0, max: 20 },
      { label: '21-40', min: 21, max: 40 },
      { label: '41-60', min: 41, max: 60 },
      { label: '61-80', min: 61, max: 80 },
      { label: '81-100', min: 81, max: 100 },
    ];

    return ranges.map((range) => ({
      label: range.label,
      value: attempts.filter(
        (a) => a.scorePercent! >= range.min && a.scorePercent! <= range.max,
      ).length,
    }));
  }

  async getRecentActivity() {
    const [recentUsers, recentAttempts] = await Promise.all([
      this.prisma.user.findMany({
        select: { id: true, displayName: true, email: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.userAttempt.findMany({
        where: { status: 'SUBMITTED' },
        select: {
          id: true,
          startedAt: true,
          scorePercent: true,
          user: { select: { displayName: true, email: true } },
          test: { select: { title: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
    ]);

    const activities = [
      ...recentUsers.map((u) => ({
        type: 'USER_REGISTERED' as const,
        description: `${u.displayName || u.email} registered`,
        timestamp: u.createdAt.toISOString(),
      })),
      ...recentAttempts.map((a) => ({
        type: 'TEST_SUBMITTED' as const,
        description: `${a.user.displayName || a.user.email} submitted "${a.test.title}" (${Math.round(a.scorePercent ?? 0)}%)`,
        timestamp: a.startedAt.toISOString(),
      })),
    ].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return activities.slice(0, 10);
  }
}
