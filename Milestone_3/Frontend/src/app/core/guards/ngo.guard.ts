// ============================================
// NGO GUARD — WasteZero Milestone 3
// Restricts Pickup Management to NGO role only.
// Volunteer and Admin are redirected to /dashboard.
// ============================================

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const ngoGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (user && user.role === 'ngo') {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
