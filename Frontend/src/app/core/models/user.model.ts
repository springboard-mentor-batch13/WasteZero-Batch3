export type UserRole = 'volunteer' | 'ngo' | 'admin';

// Nested location structure — mirrors Backend/models/users.model.js
export interface UserLocation {
  city?: string;
  state?: string;
}

export interface UserLocations {
  primary?: UserLocation;
  secondary?: UserLocation[];
}

export interface User {

  id?: string;
  _id?: string;

  name: string;
  username: string;
  email: string;

  role: UserRole;

  // Nested location — maps to locations.primary.city / locations.primary.state on the backend.
  // Used by the volunteer-opportunity matching engine and pickup module.
  locations?: UserLocations;

  // NGO-only: accepted waste categories for pickup matching.
  wasteTypes?: string[];

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