export interface DevAccount {
  email: string;
  role: 'ADMIN' | 'STUDENT';
  label: string;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { email: 'admin@example.com', role: 'ADMIN', label: 'Admin' },
  { email: 'student1@example.com', role: 'STUDENT', label: 'Student One' },
];

export const DEV_COOKIE_NAME = 'dev-user-email';
