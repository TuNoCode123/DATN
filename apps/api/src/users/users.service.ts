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

  async findByFirebaseUid(firebaseUid: string) {
    return this.prisma.user.findUnique({ where: { firebaseUid } });
  }

  async linkFirebaseUid(userId: string, firebaseUid: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { firebaseUid },
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
   * Atomically find-or-create a user by firebaseUid + email.
   * Prevents duplicate DB users from concurrent logins.
   */
  async findOrCreateByFirebaseUid(
    firebaseUid: string,
    email: string,
    role: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Re-check by uid inside the transaction
      let user = await tx.user.findUnique({ where: { firebaseUid } });
      if (user) return user;

      // Check by email — link uid to existing user
      user = await tx.user.findUnique({ where: { email } });
      if (user) {
        if (user.firebaseUid && user.firebaseUid !== firebaseUid) {
          // Already linked to a different Identity Platform identity — safety-net log
          this.logger.warn(
            `User ${email} already linked to ${user.firebaseUid}, ignoring new uid ${firebaseUid}`,
          );
          return user;
        }
        this.logger.log(
          `Backend safety-net: linking Firebase UID ${firebaseUid} to ${user.id} (${email})`,
        );
        return tx.user.update({
          where: { id: user.id },
          data: { firebaseUid },
        });
      }

      // Create new user
      return tx.user.create({
        data: {
          email,
          firebaseUid,
          displayName: email.split('@')[0],
          role: role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
        },
      });
    });
  }

  async create(data: {
    email: string;
    passwordHash?: string;
    firebaseUid?: string;
    displayName?: string;
    role?: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firebaseUid: data.firebaseUid,
        displayName: data.displayName,
        role: data.role === 'ADMIN' ? 'ADMIN' : 'STUDENT',
      },
    });
  }
}
