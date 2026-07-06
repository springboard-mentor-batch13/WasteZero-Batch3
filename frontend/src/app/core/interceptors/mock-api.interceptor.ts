import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { UserProfile } from '../models/user.model';

const MOCK_USER: UserProfile = {
  id: 'mock-uuid-001',
  email: 'dhruv@wastezero.dev',
  username: 'dhruv',
  full_name: 'Dhruv Dev',
  role: 'volunteer',
  location: 'Mumbai, India',
  bio: 'Passionate about sustainable waste management and community recycling initiatives.',
  skills: 'Angular,TypeScript,Recycling,Community Outreach',
  dark_mode: false,
  is_suspended: false,
  created_at: '2026-01-15T10:00:00Z',
  updated_at: '2026-07-06T05:00:00Z'
};

let currentMockUser = { ...MOCK_USER };

export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const url = req.url;

  if (url.endsWith('/auth/login') && req.method === 'POST') {
    const body = req.body as any;
    if (body?.username && body?.password) {
      return of(new HttpResponse({
        status: 200,
        body: {
          success: true,
          data: {
            user: { ...currentMockUser, username: body.username },
            token: 'mock-jwt-token-' + Date.now()
          },
          message: 'Login successful'
        }
      }));
    }
    return of(new HttpResponse({
      status: 401,
      body: {
        success: false,
        data: null,
        message: 'Invalid username or password'
      }
    }));
  }

  if (url.endsWith('/auth/register') && req.method === 'POST') {
    const body = req.body as any;
    const newUser: UserProfile = {
      ...MOCK_USER,
      id: 'mock-uuid-' + Date.now(),
      email: body.email || MOCK_USER.email,
      username: body.username || MOCK_USER.username,
      full_name: body.full_name || MOCK_USER.full_name,
      role: body.role || 'volunteer',
      location: body.location || null
    };
    currentMockUser = { ...newUser };
    return of(new HttpResponse({
      status: 201,
      body: {
        success: true,
        data: {
          user: newUser,
          token: 'mock-jwt-token-' + Date.now()
        },
        message: 'Registration successful'
      }
    }));
  }

  if (url.endsWith('/users/me') && req.method === 'GET') {
    return of(new HttpResponse({
      status: 200,
      body: {
        success: true,
        data: { ...currentMockUser },
        message: 'Profile fetched'
      }
    }));
  }

  if (url.endsWith('/users/me') && req.method === 'PATCH') {
    const body = req.body as Partial<UserProfile>;
    currentMockUser = { ...currentMockUser, ...body, updated_at: new Date().toISOString() };
    return of(new HttpResponse({
      status: 200,
      body: {
        success: true,
        data: { ...currentMockUser },
        message: 'Profile updated successfully'
      }
    }));
  }

  return next(req);
};
