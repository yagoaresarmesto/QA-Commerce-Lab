import { Role } from '@prisma/client';

/** Authenticated principal attached to `req.user` by the AuthGuard. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  sessionId: string;
}
