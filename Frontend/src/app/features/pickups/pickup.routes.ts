// ============================================
// PICKUP FEATURE ROUTES — WasteZero Milestone 3
// Three role-scoped sub-routes:
//   /pickups/schedule  → Volunteer only
//   /pickups/manage    → NGO only
//   /pickups/monitor   → Admin only
// Parent auth is already enforced by app.routes.ts (authGuard)
// ============================================

import { Routes } from '@angular/router';
import { volunteerGuard } from '../../core/guards/volunteer.guard';
import { ngoGuard } from '../../core/guards/ngo.guard';
import { adminGuard } from '../../core/guards/admin.guard';

export const pickupRoutes: Routes = [
  {
    // Volunteer: schedule + view pickup history
    path: 'schedule',
    loadComponent: () =>
      import('./pages/schedule-pickup/schedule-pickup').then(m => m.SchedulePickup),
    canActivate: [volunteerGuard],
  },
  {
    // NGO: view available + manage assigned pickups
    path: 'manage',
    loadComponent: () =>
      import('./pages/ngo-pickup-management/ngo-pickup-management').then(m => m.NgoPickupManagement),
    canActivate: [ngoGuard],
  },
  {
    // Admin: read-only monitor all pickups
    path: 'monitor',
    loadComponent: () =>
      import('./pages/admin-pickup-monitor/admin-pickup-monitor').then(m => m.AdminPickupMonitor),
    canActivate: [adminGuard],
  },
];
