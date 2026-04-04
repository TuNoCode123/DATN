import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const REGION = process.env.AWS_REGION || 'ap-southeast-2';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

async function main() {
  const email = process.argv.find((a) => a.startsWith('email='))?.split('=')[1];
  const pass = process.argv.find((a) => a.startsWith('pass='))?.split('=')[1];

  if (!email || !pass) {
    console.error('Usage: pnpm create:admin email=user@example.com pass=YourPassword1');
    process.exit(1);
  }

  if (!USER_POOL_ID) {
    console.error('Missing COGNITO_USER_POOL_ID in .env');
    process.exit(1);
  }

  const cognito = new CognitoIdentityProviderClient({ region: REGION });
  const prisma = new PrismaClient();

  try {
    // 1. Create user in Cognito
    console.log(`Creating Cognito user: ${email}...`);
    const createRes = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS', // skip welcome email
      }),
    );

    const cognitoSub = createRes.User?.Attributes?.find(
      (a) => a.Name === 'sub',
    )?.Value;

    if (!cognitoSub) throw new Error('Failed to get Cognito sub');

    // 2. Set permanent password (skip force-change)
    console.log('Setting permanent password...');
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        Password: pass,
        Permanent: true,
      }),
    );

    // 3. Add to Admin group
    console.log('Adding to Admin group...');
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: 'Admin',
      }),
    );

    // 4. Create/link in database
    console.log('Syncing to database...');
    await prisma.user.upsert({
      where: { email },
      update: { cognitoSub, role: 'ADMIN' },
      create: {
        email,
        cognitoSub,
        role: 'ADMIN',
        displayName: email.split('@')[0],
      },
    });

    console.log(`\nAdmin user created successfully!`);
    console.log(`  Email: ${email}`);
    console.log(`  Cognito Sub: ${cognitoSub}`);
    console.log(`  Group: Admin`);
    console.log(`  DB Role: ADMIN`);
  } catch (err: any) {
    if (err.name === 'UsernameExistsException') {
      console.error(`User ${email} already exists in Cognito.`);
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
