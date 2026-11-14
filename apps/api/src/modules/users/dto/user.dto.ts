import { Role, User, UserStatus } from '@prisma/client';

export class UserDto {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  marketingOptIn: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}

export function toUserDto(u: User): UserDto {
  return {
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    role: u.role,
    status: u.status,
    marketingOptIn: u.marketingOptIn,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}
