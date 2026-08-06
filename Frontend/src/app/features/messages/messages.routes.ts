// ============================================
// MESSAGES FEATURE ROUTES — WasteZero Milestone 3
// Protected under Layout (authGuard at parent level in app.routes.ts)
// Admin is blocked from Messages per M3 spec.
// ============================================

import { Routes } from '@angular/router';
import { MessagesPage } from './pages/messages-page/messages-page';
import { volunteerNgoGuard } from '../../core/guards/volunteer-ngo.guard';

export const messageRoutes: Routes = [
  {
    path: '',
    component: MessagesPage,
    canActivate: [volunteerNgoGuard],  // Admin blocked
  },
];
