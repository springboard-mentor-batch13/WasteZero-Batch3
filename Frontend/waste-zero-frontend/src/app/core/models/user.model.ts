export type UserRole = 'volunteer' | 'ngo' | 'admin';

export interface User {
  id?: string;
  _id?: string;

  name: string;
  username: string;
  email: string;
  role: UserRole;

  location?: string;
  skills?: string[];
  bio?: string;

  createdAt?: string;
  updatedAt?: string;
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