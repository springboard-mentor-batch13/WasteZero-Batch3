import { Routes } from '@angular/router';

import { adminGuard } from '../../core/guards/admin.guard';

import { AdminUsers } from './users/admin-users';
import { AdminLogs } from './logs/admin-logs';
import { AdminReports } from './reports/admin-reports';

export const adminRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'users',
  },
  {
    path: 'users',
    component: AdminUsers,
    canActivate: [adminGuard],
  },
  {
    path: 'logs',
    component: AdminLogs,
    canActivate: [adminGuard],
  },
  {
    path: 'reports',
    component: AdminReports,
    canActivate: [adminGuard],
  },
];
