import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { DashboardLayoutComponent } from './layout/dashboard-layout/dashboard-layout.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { ProfileComponent } from './features/profile/profile.component';
import { SchedulePickupComponent } from './features/schedule-pickup/schedule-pickup.component';
import { AssignedPickupsComponent } from './features/assigned-pickups/assigned-pickups.component';
import { OpportunitiesComponent } from './features/opportunities/opportunities.component';
import { MessagesComponent } from './features/messages/messages.component';
import { AdminComponent } from './features/admin/admin.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: '',
    component: DashboardLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'profile', component: ProfileComponent },
      { path: 'schedule-pickup', component: SchedulePickupComponent },
      { path: 'assigned-pickups', component: AssignedPickupsComponent },
      { path: 'opportunities', component: OpportunitiesComponent },
      { path: 'messages', component: MessagesComponent },
      {
        path: 'admin',
        component: AdminComponent,
        canActivate: [roleGuard],
        data: { roles: ['admin'] }
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
