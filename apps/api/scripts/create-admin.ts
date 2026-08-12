import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const PROJECT_ID = process.env.GCP_PROJECT_ID;

async function main() {
  const email = process.argv.find((a) => a.startsWith('email='))?.split('=')[1];
  const pass = process.argv.find((a) => a.startsWith('pass='))?.split('=')[1];

  if (!email || !pass) {
    console.error('Usage: pnpm create:admin email=user@example.com pass=YourPassword1');
    process.exit(1);
  }

  if (!PROJECT_ID) {
    console.error('Missing GCP_PROJECT_ID in .env');
    process.exit(1);
  }

  const app = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
  const auth = admin.auth(app);
  const prisma = new PrismaClient();

  try {
    // 1. Create (or fetch, if already present) the Identity Platform user
    let user: admin.auth.UserRecord;
    try {
      console.log(`Creating Identity Platform user: ${email}...`);
      user = await auth.createUser({
        email,
        emailVerified: true,
        password: pass,
      });
    } catch (err: any) {
      if (err.code === 'auth/email-already-exists') {
        console.log(`User ${email} already exists — updating password instead.`);
        user = await auth.getUserByEmail(email);
        await auth.updateUser(user.uid, { password: pass });
      } else {
        throw err;
      }
    }

    // 2. Set the `role` custom claim — this is what FirebaseAuthService
    // reads on every request (see apps/api/src/auth/firebase-auth.service.ts).
    // Any session already signed in won't see this until its ID token
    // refreshes (Firebase caches tokens for ~1h client-side).
    console.log('Setting ADMIN custom claim...');
    await auth.setCustomUserClaims(user.uid, { role: 'ADMIN' });

    // 3. Create/link in database
    console.log('Syncing to database...');
    await prisma.user.upsert({
      where: { email },
      update: { firebaseUid: user.uid, role: 'ADMIN' },
      create: {
        email,
        firebaseUid: user.uid,
        role: 'ADMIN',
        displayName: email.split('@')[0],
      },
    });

    console.log(`\nAdmin user created successfully!`);
    console.log(`  Email: ${email}`);
    console.log(`  Firebase UID: ${user.uid}`);
    console.log(`  DB Role: ADMIN`);
  } catch (err: any) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
