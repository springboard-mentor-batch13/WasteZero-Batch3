// ============================================
// OPPORTUNITIES FEATURE ROUTES
// All protected under Layout (authGuard applied at parent level)
// ============================================

import { Routes } from '@angular/router';
import { ngoAdminGuard } from '../../core/guards/ngo-admin.guard';

import { OpportunityList } from './pages/opportunity-list/opportunity-list';
import { OpportunityDetail } from './pages/opportunity-detail/opportunity-detail';
import { OpportunityForm } from './pages/opportunity-form/opportunity-form';
import { MyOpportunities } from './pages/my-opportunities/my-opportunities';

export const opportunityRoutes: Routes = [

  // List of all opportunities — any role
  {
    path: '',
    component: OpportunityList
  },

  // My Opportunities (NGO/Admin) — must come before :id to avoid clash
  {
    path: 'my-opportunities',
    component: MyOpportunities,
    canActivate: [ngoAdminGuard]
  },

  // Create new opportunity — NGO/Admin only
  {
    path: 'create',
    component: OpportunityForm,
    canActivate: [ngoAdminGuard],
    data: { mode: 'create' }
  },

  // Edit existing opportunity — NGO/Admin only
  {
    path: ':id/edit',
    component: OpportunityForm,
    canActivate: [ngoAdminGuard],
    data: { mode: 'edit' }
  },

  // Detail page — any role
  {
    path: ':id',
    component: OpportunityDetail
  }

];
