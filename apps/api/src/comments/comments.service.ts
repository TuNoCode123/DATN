import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async findByTest(
    testId: string,
    page = 1,
    limit = 20,
  ) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: { testId, parentId: null },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          replies: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.comment.count({ where: { testId, parentId: null } }),
    ]);

    return { data: comments, total, page, limit };
  }

  async create(userId: string, testId: string, body: string, parentId?: string) {
    if (parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.testId !== testId) {
        throw new NotFoundException('Parent comment not found');
      }
    }

    const comment = await this.prisma.comment.create({
      data: { userId, testId, body, parentId: parentId || null },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    await this.prisma.test.update({
      where: { id: testId },
      data: { commentCount: { increment: 1 } },
    });

    return comment;
  }

  async delete(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ConflictException('Cannot delete another user\'s comment');
    }

    await this.prisma.comment.delete({ where: { id: commentId } });

    await this.prisma.test.update({
      where: { id: comment.testId },
      data: { commentCount: { decrement: 1 } },
    });
  }

  async like(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    try {
      await this.prisma.commentLike.create({
        data: { userId, commentId },
      });
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { increment: 1 } },
      });
    } catch {
      throw new ConflictException('Already liked');
    }
  }

  async unlike(commentId: string, userId: string) {
    try {
      await this.prisma.commentLike.delete({
        where: { userId_commentId: { userId, commentId } },
      });
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
      });
    } catch {
      throw new NotFoundException('Like not found');
    }
  }
}
