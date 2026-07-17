// ============================================
// NGO-ADMIN GUARD — WasteZero Milestone 2
// Restricts create/edit/delete routes to NGO and Admin roles
// ============================================

import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const ngoAdminGuard: CanActivateFn = () => {

  const authService = inject(AuthService);
  const router = inject(Router);

  const user = authService.getCurrentUser();

  if (user && (user.role === 'ngo' || user.role === 'admin')) {
    return true;
  }

  // Redirect non-NGO/Admin users back to opportunities list
  return router.createUrlTree(['/opportunities']);

};
