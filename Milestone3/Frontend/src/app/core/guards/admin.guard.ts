// ============================================
// ADMIN GUARD — WasteZero Milestone 3
// Restricts Admin Pickup Monitor to Admin role only.
// Volunteer and NGO are redirected to /dashboard.
// ============================================

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (user && user.role === 'admin') {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
