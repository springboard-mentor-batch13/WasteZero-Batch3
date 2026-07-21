import { Routes } from '@angular/router';

import { Login } from './features/auth/login/login';
import { Register } from './features/auth/register/register';

import { Dashboard } from './features/dashboard/dashboard';
import { Profile } from './features/profile/profile';
import { ChangePassword } from './features/change-password/change-password';
import { Layout } from './features/layout/layout';
import { VerifyOtp } from './features/auth/verify-otp/verify-otp';
import { ForgotPassword } from './features/auth/forgot-password/forgot-password';
import { ResetPassword } from './features/auth/reset-password/reset-password';

import { authGuard } from './core/guards/auth.guard';
import { opportunityRoutes } from './features/opportunities/opportunities.routes';
import { applicationRoutes } from './features/applications/applications.routes';

export const routes: Routes = [

  // Redirect to Login
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  // Authentication Routes
  {
    path: 'login',
    component: Login
  },

  {
    path: 'register',
    component: Register
  },

  {
    path: 'verify-otp',
    component: VerifyOtp
  },

  {
    path: 'forgot-password',
    component: ForgotPassword
  },

  {
    path: 'reset-password',
    component: ResetPassword
  },

  // Protected Routes — all children share the Layout shell
  {
    path: '',
    component: Layout,
    canActivate: [authGuard],
    children: [

      // ── Milestone 1 routes ──────────────────────────────────────
      {
        path: 'dashboard',
        component: Dashboard
      },

      {
        path: 'profile',
        component: Profile
      },

      {
        path: 'change-password',
        component: ChangePassword
      },

      // ── Milestone 2: Opportunities feature ──────────────────────
      {
        path: 'opportunities',
        children: opportunityRoutes
      },

      // ── Milestone 2: Applications feature ───────────────────────
      {
        path: 'applications',
        children: applicationRoutes
      }

    ]
  },

  // Wildcard Route
  {
    path: '**',
    redirectTo: 'login'
  }

];