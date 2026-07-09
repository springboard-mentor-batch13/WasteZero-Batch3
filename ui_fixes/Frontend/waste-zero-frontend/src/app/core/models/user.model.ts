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

  isVerified?: boolean;

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
  message: string;
  user: User;
}

export interface ApiResponse {

  success: boolean;
  message: string;

}