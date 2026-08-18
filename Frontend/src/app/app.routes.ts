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
import { AdminPanel } from './features/admin/admin-panel';
import { ReportsPage } from './features/reports/reports-page';
import { FaqPage } from './features/faq/faq';
import { SettingsPage } from './features/settings/settings';

import { authGuard }  from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { guestGuard } from './core/guards/guest.guard';
import { opportunityRoutes } from './features/opportunities/opportunities.routes';
import { applicationRoutes } from './features/applications/applications.routes';
import { messageRoutes } from './features/messages/messages.routes';
import { pickupRoutes } from './features/pickups/pickup.routes';


export const routes: Routes = [

  // Redirect to Login
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },

  // Authentication Routes (Guest Only)
  {
    path: 'login',
    component: Login,
    canActivate: [guestGuard]
  },

  {
    path: 'register',
    component: Register,
    canActivate: [guestGuard]
  },

  {
    path: 'verify-otp',
    component: VerifyOtp,
    canActivate: [guestGuard]
  },

  {
    path: 'forgot-password',
    component: ForgotPassword,
    canActivate: [guestGuard]
  },

  {
    path: 'reset-password',
    component: ResetPassword,
    canActivate: [guestGuard]
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
      },

      // ── Milestone 3: Messages feature ───────────────────────────
      {
        path: 'messages',
        children: messageRoutes
      },

      // ── Milestone 3: Pickup feature ─────────────────────────────
      {
        path: 'pickups',
        children: pickupRoutes
      },

      // ── Milestone 4: Admin Panel ──────────────────────────────────────────────
      {
        path: 'admin',
        component: AdminPanel,
        canActivate: [authGuard, adminGuard]
      },

      // ── Milestone 4: Reports (all roles) ─────────────────────────────────────
      {
        path: 'reports',
        component: ReportsPage,
        canActivate: [authGuard]
      },

      // ── Settings & FAQ ───────────────────────────────────────────────────────
      {
        path: 'settings',
        component: SettingsPage,
        canActivate: [authGuard]
      },

      {
        path: 'faq',
        component: FaqPage,
        canActivate: [authGuard]
      }

    ]
  },

  // Wildcard Route
  {
    path: '**',
    redirectTo: 'login'
  }

];