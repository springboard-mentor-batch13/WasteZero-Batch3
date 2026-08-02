// ============================================
// APPLICATIONS FEATURE ROUTES
// Protected under Layout (authGuard at parent)
// ============================================

import { Routes } from '@angular/router';
import { ngoAdminGuard } from '../../core/guards/ngo-admin.guard';
import { MyApplications } from './pages/my-applications/my-applications';
import { ApplicationReview } from './pages/application-review/application-review';

export const applicationRoutes: Routes = [

  // My Applications — Volunteer only
  // (role enforcement done inside component via redirect)
  {
    path: 'my-applications',
    component: MyApplications
  },

  // Application Review — NGO/Admin only
  {
    path: 'review',
    component: ApplicationReview,
    canActivate: [ngoAdminGuard]
  }

];
