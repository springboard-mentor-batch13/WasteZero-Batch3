export type UserRole = 'volunteer' | 'ngo' | 'admin';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  token: string;
  user: User;
}

export interface ProfileResponse {
  success: boolean;
  user: User;
}