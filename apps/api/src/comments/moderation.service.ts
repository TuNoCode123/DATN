import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommentStatus } from '@prisma/client';

const RATE_LIMIT_SECONDS = 15;
const DUPLICATE_WINDOW_SECONDS = 300;
const TRUST_THRESHOLD = 5;
const REPORT_AUTO_HIDE_THRESHOLD = 3;
const MAX_LINK_COUNT = 3;
const MIN_BODY_LENGTH = 2;

const BLACKLIST_WORDS = [
  // Spam / scam
  'spam', 'scam', 'viagra', 'casino', 'lottery',
  'buy now', 'click here', 'free money', 'make money fast',
  'earn money', 'work from home', 'congratulations you won',

  // English profanity
  'fuck', 'shit', 'asshole', 'bitch', 'bastard',
  'dick', 'pussy', 'cunt', 'nigger', 'nigga',
  'faggot', 'retard', 'whore', 'slut', 'cock',
  'motherfucker', 'bullshit', 'dumbass', 'jackass',
  'damn', 'stfu', 'wtf', 'lmao die', 'kys',
  'kill yourself', 'go die',

  // Vietnamese profanity
  'đụ', 'địt', 'đù', 'đéo', 'đ\u1ECBt mẹ', 'đụ má',
  'đồ chó', 'con chó', 'thằng chó', 'con điếm',
  'đĩ', 'cave', 'lồn', 'buồi', 'cặc', 'cu',
  'mẹ mày', 'bố mày', 'ngu', 'óc chó', 'ngu vl',
  'vãi', 'vkl', 'vcl', 'vl', 'cc', 'clgt',
  'dmm', 'đmm', 'dkm', 'đkm', 'dcm', 'đcm',
  'chết đi', 'biến đi', 'cút đi',
  'thằng ngu', 'con ngu', 'đồ ngu',
  'khốn nạn', 'mất dạy', 'vô học',
  'thằng khốn', 'con khốn', 'đồ khốn',
];

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService) {}

  async moderate(
    userId: string,
    body: string,
  ): Promise<{ status: CommentStatus; reason?: string }> {
    const spamCheck = this.checkSpam(body);
    if (spamCheck) return { status: CommentStatus.HIDDEN, reason: spamCheck };

    const blacklistHit = this.checkBlacklist(body);
    if (blacklistHit) return { status: CommentStatus.HIDDEN, reason: blacklistHit };

    const rateLimit = await this.checkRateLimit(userId);
    if (rateLimit) return { status: CommentStatus.PUBLISHED, reason: rateLimit };

    const duplicate = await this.checkDuplicate(userId, body);
    if (duplicate) return { status: CommentStatus.PUBLISHED, reason: duplicate };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { trustScore: true, createdAt: true },
    });

    if (!user) return { status: CommentStatus.PUBLISHED, reason: 'user_not_found' };

    if (user.trustScore < TRUST_THRESHOLD) {
      return { status: CommentStatus.PENDING, reason: user.trustScore < 0 ? 'flagged_user' : 'new_user' };
    }

    return { status: CommentStatus.PUBLISHED };
  }

  checkSpam(body: string): string | null {
    if (body.trim().length < MIN_BODY_LENGTH) return 'too_short';

    // Repeated characters (e.g. "aaaaaaaaa")
    if (/(.)\1{7,}/i.test(body)) return 'repeated_chars';

    // Excessive caps (>70% uppercase in messages longer than 10 chars)
    if (body.length > 10) {
      const upper = body.replace(/[^A-Z]/g, '').length;
      if (upper / body.length > 0.7) return 'excessive_caps';
    }

    // Excessive links
    const linkCount = (body.match(/https?:\/\//gi) || []).length;
    if (linkCount > MAX_LINK_COUNT) return 'too_many_links';

    // Gibberish: no vowels in a long word
    const words = body.split(/\s+/);
    const longGibberish = words.filter(
      (w) => w.length > 8 && !/[aeiouAEIOU]/.test(w),
    );
    if (longGibberish.length > 2) return 'gibberish';

    return null;
  }

  checkBlacklist(body: string): string | null {
    const lower = body.toLowerCase();
    for (const word of BLACKLIST_WORDS) {
      if (lower.includes(word)) return 'blacklisted_word';
    }
    return null;
  }

  async checkRateLimit(userId: string): Promise<string | null> {
    const cutoff = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000);
    const recent = await this.prisma.comment.count({
      where: {
        userId,
        createdAt: { gte: cutoff },
      },
    });
    return recent > 0 ? 'rate_limited' : null;
  }

  async checkDuplicate(userId: string, body: string): Promise<string | null> {
    const cutoff = new Date(Date.now() - DUPLICATE_WINDOW_SECONDS * 1000);
    const dup = await this.prisma.comment.findFirst({
      where: {
        userId,
        body,
        createdAt: { gte: cutoff },
      },
    });
    return dup ? 'duplicate' : null;
  }

  async handleReport(commentId: string): Promise<boolean> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { reportCount: true, status: true },
    });
    if (!comment) return false;

    if (comment.reportCount >= REPORT_AUTO_HIDE_THRESHOLD &&
        comment.status === CommentStatus.PUBLISHED) {
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: CommentStatus.HIDDEN },
      });
      return true;
    }
    return false;
  }

  async incrementTrust(userId: string, amount = 1) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { trustScore: { increment: amount } },
    });
  }

  async decrementTrust(userId: string, amount = 1) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { trustScore: { decrement: amount } },
    });
  }
}
