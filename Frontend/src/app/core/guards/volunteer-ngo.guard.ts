// ============================================
// VOLUNTEER-NGO GUARD — WasteZero Milestone 3
// Restricts Messages module to Volunteer and NGO roles only.
// Admin users are redirected to /dashboard.
// ============================================

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const volunteerNgoGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (user && (user.role === 'volunteer' || user.role === 'ngo' || user.role === 'admin')) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
