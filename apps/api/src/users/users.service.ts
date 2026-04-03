import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  private readonly logger = new Logger('UsersService');

  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByCognitoSub(cognitoSub: string) {
    return this.prisma.user.findUnique({ where: { cognitoSub } });
  }

  async linkCognitoSub(userId: string, cognitoSub: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { cognitoSub },
    });
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

  /**
   * Atomically find-or-create a user by cognitoSub + email.
   * Prevents duplicate DB users from concurrent logins.
   */
  async findOrCreateByCognitoSub(
    cognitoSub: string,
    email: string,
    role: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Re-check by sub inside the transaction
      let user = await tx.user.findUnique({ where: { cognitoSub } });
      if (user) return user;

      // Check by email — link sub to existing user
      user = await tx.user.findUnique({ where: { email } });
      if (user) {
        if (user.cognitoSub && user.cognitoSub !== cognitoSub) {
          // Already linked to a different Cognito identity — safety-net log
          this.logger.warn(
            `User ${email} already linked to ${user.cognitoSub}, ignoring new sub ${cognitoSub}`,
          );
          return user;
        }
        this.logger.log(
          `Backend safety-net: linking Cognito sub ${cognitoSub} to ${user.id} (${email})`,
        );
        return tx.user.update({
          where: { id: user.id },
          data: { cognitoSub },
        });
      }

      // Create new user
      return tx.user.create({
        data: {
          email,
          cognitoSub,
          displayName: email.split('@')[0],
          role: role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
        },
      });
    });
  }

  async create(data: {
    email: string;
    passwordHash?: string;
    cognitoSub?: string;
    displayName?: string;
    role?: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        cognitoSub: data.cognitoSub,
        displayName: data.displayName,
        role: data.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
      },
    });
  }
}
