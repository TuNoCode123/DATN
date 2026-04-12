import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from './moderation.service';
import { CommentStatus } from '@prisma/client';

const MAX_DEPTH = 2;

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private moderation: ModerationService,
  ) {}

  async findByTest(
    testId: string,
    page = 1,
    limit = 20,
    sort: 'newest' | 'oldest' = 'newest',
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const orderBy = sort === 'newest' ? 'desc' : 'asc';

    const visibleFilter = this.visibleFilter(userId);

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          testId,
          parentId: null,
          ...visibleFilter,
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          replies: {
            where: visibleFilter,
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true } },
              replies: {
                where: visibleFilter,
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
          ...visibleFilter,
        },
      }),
    ]);

    const allIds = this.collectCommentIds(comments);
    const likedSet = userId
      ? await this.getLikedSet(userId, allIds)
      : new Set<string>();

    const data = comments.map((c) => this.mapComment(c, likedSet, userId));

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
    const visibleFilter = this.visibleFilter(userId);

    const [replies, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          parentId: commentId,
          ...visibleFilter,
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          replies: {
            where: visibleFilter,
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
          ...visibleFilter,
        },
      }),
    ]);

    const allIds = this.collectCommentIds(replies);
    const likedSet = userId
      ? await this.getLikedSet(userId, allIds)
      : new Set<string>();

    const data = replies.map((r) => this.mapComment(r, likedSet, userId));

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

      if (depth > MAX_DEPTH) {
        if (parent.depth >= 1 && parent.parentId) {
          actualParentId = parent.parentId;
          depth = parent.depth;
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

    const { status, reason } = await this.moderation.moderate(userId, body);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          userId,
          testId,
          body,
          parentId: actualParentId,
          depth,
          status,
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });

      if (actualParentId) {
        await tx.comment.update({
          where: { id: actualParentId },
          data: { replyCount: { increment: 1 } },
        });
      }

      if (status === CommentStatus.PUBLISHED) {
        await tx.test.update({
          where: { id: testId },
          data: { commentCount: { increment: 1 } },
        });
      }

      return created;
    });

    if (status === CommentStatus.PUBLISHED) {
      this.moderation.incrementTrust(userId).catch(() => {});
    }

    return {
      ...comment,
      status: comment.status,
      isDeleted: false,
      likedByMe: false,
      replies: [],
      moderationReason: status !== CommentStatus.PUBLISHED ? reason : undefined,
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
    if (comment.deletedAt || comment.status === CommentStatus.DELETED) {
      throw new BadRequestException('Cannot edit a deleted comment');
    }

    const spamCheck = this.moderation.checkSpam(body);
    const blacklistCheck = this.moderation.checkBlacklist(body);
    const newStatus = (spamCheck || blacklistCheck)
      ? CommentStatus.PENDING
      : comment.status;

    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body, status: newStatus },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return {
      ...updated,
      isDeleted: false,
      likedByMe: false,
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
    if (comment.deletedAt || comment.status === CommentStatus.DELETED) {
      throw new BadRequestException('Comment already deleted');
    }

    if (comment.replyCount === 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.deleteMany({ where: { commentId } });
        await tx.commentReport.deleteMany({ where: { commentId } });
        await tx.comment.delete({ where: { id: commentId } });

        if (comment.parentId) {
          await tx.comment.update({
            where: { id: comment.parentId },
            data: { replyCount: { decrement: 1 } },
          });
        }

        if (comment.status === CommentStatus.PUBLISHED) {
          await tx.test.update({
            where: { id: comment.testId },
            data: { commentCount: { decrement: 1 } },
          });
        }
      });
    } else {
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { deletedAt: new Date(), status: CommentStatus.DELETED },
      });
    }
  }

  async report(commentId: string, userId: string, reason: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId === userId) {
      throw new BadRequestException('Cannot report your own comment');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentReport.create({
          data: { commentId, userId, reason },
        });
        await tx.comment.update({
          where: { id: commentId },
          data: { reportCount: { increment: 1 } },
        });
      });
    } catch {
      throw new ConflictException('Already reported this comment');
    }

    await this.moderation.handleReport(commentId);
  }

  async like(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.deletedAt || comment.status !== CommentStatus.PUBLISHED) {
      throw new BadRequestException('Cannot like this comment');
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

  // ─── Admin Methods ─────────────────────────────────────

  async findPendingQueue(page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where: {
          status: { in: [CommentStatus.PENDING, CommentStatus.HIDDEN] },
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
          reports: {
            include: {
              user: { select: { id: true, displayName: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [
          { reportCount: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.comment.count({
        where: {
          status: { in: [CommentStatus.PENDING, CommentStatus.HIDDEN] },
        },
      }),
    ]);

    return { data: comments, total, page, limit };
  }

  async adminApprove(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.update({
        where: { id: commentId },
        data: { status: CommentStatus.PUBLISHED },
      });

      if (comment.status !== CommentStatus.PUBLISHED) {
        await tx.test.update({
          where: { id: comment.testId },
          data: { commentCount: { increment: 1 } },
        });
      }
    });

    this.moderation.incrementTrust(comment.userId, 2).catch(() => {});
  }

  async adminReject(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    await this.prisma.comment.update({
      where: { id: commentId },
      data: { status: CommentStatus.HIDDEN },
    });

    this.moderation.decrementTrust(comment.userId, 2).catch(() => {});
  }

  async adminDelete(commentId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const wasPublished = comment.status === CommentStatus.PUBLISHED;

    if (comment.replyCount === 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.deleteMany({ where: { commentId } });
        await tx.commentReport.deleteMany({ where: { commentId } });
        await tx.comment.delete({ where: { id: commentId } });

        if (comment.parentId) {
          await tx.comment.update({
            where: { id: comment.parentId },
            data: { replyCount: { decrement: 1 } },
          });
        }

        if (wasPublished) {
          await tx.test.update({
            where: { id: comment.testId },
            data: { commentCount: { decrement: 1 } },
          });
        }
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        await tx.comment.update({
          where: { id: commentId },
          data: { deletedAt: new Date(), status: CommentStatus.DELETED },
        });

        if (wasPublished) {
          await tx.test.update({
            where: { id: comment.testId },
            data: { commentCount: { decrement: 1 } },
          });
        }
      });
    }

    this.moderation.decrementTrust(comment.userId, 3).catch(() => {});
  }

  // ─── Helpers ────────────────────────────────────────────

  private visibleFilter(userId?: string) {
    if (userId) {
      return {
        OR: [
          { status: CommentStatus.PUBLISHED, deletedAt: null },
          { status: CommentStatus.PUBLISHED, replyCount: { gt: 0 } },
          { userId, status: CommentStatus.PENDING, deletedAt: null },
        ],
      };
    }
    return {
      OR: [
        { status: CommentStatus.PUBLISHED, deletedAt: null },
        { status: CommentStatus.PUBLISHED, replyCount: { gt: 0 } },
      ],
    };
  }

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

  private mapComment(comment: any, likedSet: Set<string>, userId?: string): any {
    const isDeleted = !!comment.deletedAt || comment.status === CommentStatus.DELETED;
    const isPending = comment.status === CommentStatus.PENDING;
    const isOwn = userId && comment.userId === userId;

    return {
      id: comment.id,
      testId: comment.testId,
      parentId: comment.parentId,
      body: isDeleted ? 'This comment has been deleted.' : comment.body,
      status: comment.status,
      likeCount: isDeleted ? 0 : comment.likeCount,
      replyCount: comment.replyCount,
      depth: comment.depth,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isDeleted,
      isPending: isPending && isOwn,
      user: isDeleted
        ? { id: comment.userId, displayName: null, avatarUrl: null }
        : comment.user,
      likedByMe: likedSet.has(comment.id),
      replies: comment.replies
        ? comment.replies.map((r: any) => this.mapComment(r, likedSet, userId))
        : [],
    };
  }
}
