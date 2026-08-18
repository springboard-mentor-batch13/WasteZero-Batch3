// ============================================
// GUEST GUARD — WasteZero
// Restricts login, register, and password reset routes to unauthenticated guests only.
// If an authenticated user attempts to access these routes (or hits browser Back/Forward),
// they are cleanly redirected to /dashboard.
// ============================================

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn() && authService.getToken()) {
    return router.createUrlTree(['/dashboard']);
  }

  return true;
};
