import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Local-only escape hatch for when Cognito is unreachable (e.g. AWS account
 * terminated). Set AUTH_BYPASS=true and optionally AUTH_BYPASS_EMAIL in
 * apps/api/.env to log in as a seeded user without going through Cognito.
 */
export async function attachDevBypassUser(
  context: ExecutionContext,
  prisma: PrismaService,
): Promise<boolean> {
  if (process.env.AUTH_BYPASS !== 'true') return false;

  const email = process.env.AUTH_BYPASS_EMAIL || 'admin@example.com';
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return false;

  const req = context.switchToHttp().getRequest();
  req.user = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  };
  return true;
}
