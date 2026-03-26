import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MAX_DEPTH = 2;

@Injectable()
export class CommentsService {
  constructor(private prisma: PrismaService) {}

  async findByTest(
    testId: string,
    page = 1,
    limit = 20,
    sort: 'newest' | 'oldest' = 'newest',
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const orderBy = sort === 'newest' ? 'desc' : 'asc';

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          testId,
          parentId: null,
          // Include soft-deleted root comments that still have replies
          OR: [
            { deletedAt: null },
            { replyCount: { gt: 0 } },
          ],
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          replies: {
            where: {
              OR: [
                { deletedAt: null },
                { replyCount: { gt: 0 } },
              ],
            },
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
              replies: {
                where: {
                  OR: [
                    { deletedAt: null },
                    { replyCount: { gt: 0 } },
                  ],
                },
                include: {
                  user: { select: { id: true, displayName: true, avatarUrl: true } },
                },
                orderBy: { createdAt: 'asc' },
                take: 3,
              },
            },
            orderBy: { createdAt: 'asc' },
            take: 3,
          },
        },
        orderBy: { createdAt: orderBy as any },
        skip,
        take: limit,
      }),
      this.prisma.comment.count({
        where: {
          testId,
          parentId: null,
          OR: [
            { deletedAt: null },
            { replyCount: { gt: 0 } },
          ],
        },
      }),
    ]);

    // Collect all comment IDs to batch-query likes
    const allIds = this.collectCommentIds(comments);
    const likedSet = userId
      ? await this.getLikedSet(userId, allIds)
      : new Set<string>();

    const data = comments.map((c) => this.mapComment(c, likedSet));

    return { data, total, page, limit };
  }

  async findReplies(
    commentId: string,
    page = 1,
    limit = 10,
    userId?: string,
  ) {
    const parent = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!parent) throw new NotFoundException('Comment not found');

    const skip = (page - 1) * limit;

    const [replies, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          parentId: commentId,
          OR: [
            { deletedAt: null },
            { replyCount: { gt: 0 } },
          ],
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          replies: {
            where: {
              OR: [
                { deletedAt: null },
                { replyCount: { gt: 0 } },
              ],
            },
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
            take: 3,
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.comment.count({
        where: {
          parentId: commentId,
          OR: [
            { deletedAt: null },
            { replyCount: { gt: 0 } },
          ],
        },
      }),
    ]);

    const allIds = this.collectCommentIds(replies);
    const likedSet = userId
      ? await this.getLikedSet(userId, allIds)
      : new Set<string>();

    const data = replies.map((r) => this.mapComment(r, likedSet));

    return { data, total, page, limit };
  }

  async create(
    userId: string,
    testId: string,
    body: string,
    parentId?: string,
  ) {
    let depth = 0;
    let actualParentId = parentId || null;

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({
        where: { id: parentId },
      });
      if (!parent || parent.testId !== testId) {
        throw new NotFoundException('Parent comment not found');
      }

      depth = parent.depth + 1;

      // Flatten deep replies: if replying to a depth-1+ comment,
      // attach to depth-1 parent so we don't exceed max depth
      if (depth > MAX_DEPTH) {
        // Find the depth-1 ancestor
        if (parent.depth >= 1 && parent.parentId) {
          actualParentId = parent.parentId;
          depth = parent.depth; // same depth as parent (stays at depth 1 or 2)
          // Recalculate: attach to the level-1 parent
          const grandParent = await this.prisma.comment.findUnique({
            where: { id: parent.parentId },
          });
          if (grandParent) {
            depth = grandParent.depth + 1;
            actualParentId = grandParent.id;
          }
        }

        if (depth > MAX_DEPTH) {
          throw new BadRequestException(
            `Maximum reply depth of ${MAX_DEPTH} exceeded`,
          );
        }
      }
    }

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          userId,
          testId,
          body,
          parentId: actualParentId,
          depth,
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      // Increment parent's replyCount
      if (actualParentId) {
        await tx.comment.update({
          where: { id: actualParentId },
          data: { replyCount: { increment: 1 } },
        });
      }

      // Increment test's commentCount
      await tx.test.update({
        where: { id: testId },
        data: { commentCount: { increment: 1 } },
      });

      return created;
    });

    return {
      ...comment,
      isDeleted: false,
      likedByMe: false,
      replies: [],
    };
  }

  async update(commentId: string, userId: string, body: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ForbiddenException("Cannot edit another user's comment");
    }
    if (comment.deletedAt) {
      throw new BadRequestException('Cannot edit a deleted comment');
    }

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return {
      ...updated,
      isDeleted: false,
      likedByMe: false, // caller can re-check
    };
  }

  async delete(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) {
      throw new ForbiddenException("Cannot delete another user's comment");
    }
    if (comment.deletedAt) {
      throw new BadRequestException('Comment already deleted');
    }

    if (comment.replyCount === 0) {
      // Hard delete — no replies to preserve
      await this.prisma.$transaction(async (tx) => {
        // Delete associated likes
        await tx.commentLike.deleteMany({ where: { commentId } });

        await tx.comment.delete({ where: { id: commentId } });

        // Decrement parent's replyCount
        if (comment.parentId) {
          await tx.comment.update({
            where: { id: comment.parentId },
            data: { replyCount: { decrement: 1 } },
          });
        }

        await tx.test.update({
          where: { id: comment.testId },
          data: { commentCount: { decrement: 1 } },
        });
      });
    } else {
      // Soft delete — preserve thread
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date() },
      });
    }
  }

  async like(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.deletedAt) {
      throw new BadRequestException('Cannot like a deleted comment');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.create({
          data: { userId, commentId },
        });
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
        });
      });
    } catch {
      throw new ConflictException('Already liked');
    }
  }

  async unlike(commentId: string, userId: string) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.delete({
          where: { userId_commentId: { userId, commentId } },
        });
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
        });
      });
    } catch {
      throw new NotFoundException('Like not found');
    }
  }

  // ─── Helpers ────────────────────────────────────────────

  private collectCommentIds(comments: any[]): string[] {
    const ids: string[] = [];
    for (const c of comments) {
      ids.push(c.id);
      if (c.replies) {
        ids.push(...this.collectCommentIds(c.replies));
      }
    }
    return ids;
  }

  private async getLikedSet(
    userId: string,
    commentIds: string[],
  ): Promise<Set<string>> {
    if (commentIds.length === 0) return new Set();

    const likes = await this.prisma.commentLike.findMany({
      where: { userId, commentId: { in: commentIds } },
      select: { commentId: true },
    });

    return new Set(likes.map((l) => l.commentId));
  }

  private mapComment(comment: any, likedSet: Set<string>): any {
    const isDeleted = !!comment.deletedAt;

    return {
      id: comment.id,
      testId: comment.testId,
      parentId: comment.parentId,
      body: isDeleted ? 'This comment has been deleted.' : comment.body,
      likeCount: isDeleted ? 0 : comment.likeCount,
      replyCount: comment.replyCount,
      depth: comment.depth,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isDeleted,
      user: isDeleted
        ? { id: comment.userId, displayName: null, avatarUrl: null }
        : comment.user,
      likedByMe: likedSet.has(comment.id),
      replies: comment.replies
        ? comment.replies.map((r: any) => this.mapComment(r, likedSet))
        : [],
    };
  }
}
