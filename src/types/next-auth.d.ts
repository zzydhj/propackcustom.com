import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'CUSTOMER' | 'WHOLESALE' | 'ADMIN';
      locale: string;
    } & DefaultSession['user'];
  }

  interface User {
    role: 'CUSTOMER' | 'WHOLESALE' | 'ADMIN';
    locale: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: 'CUSTOMER' | 'WHOLESALE' | 'ADMIN';
    locale: string;
  }
}
