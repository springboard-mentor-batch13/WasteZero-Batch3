export interface UserProfile {
  id: string;
  email: string;
  username: string;
  full_name: string;
  role: 'volunteer' | 'agent' | 'ngo' | 'admin';
  location: string | null;
  bio: string | null;
  skills: string | null;
  dark_mode: boolean;
  is_suspended: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  username: string;
  password: string;
  confirm_password: string;
  role: 'volunteer' | 'agent' | 'ngo' | 'admin';
  location?: string;
}

export interface AuthResponse {
  success: boolean;
  data: {
    user: UserProfile;
    token: string;
  };
  message: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  errors?: string[];
}
