import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router,RouterLink,RouterLinkActive} from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    RouterLinkActive
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {

  private router = inject(Router);
  private authService = inject(AuthService);

  userName = '';
  userRole = '';

  constructor() {

    const user = this.authService.getCurrentUser();

    if (user) {
      this.userName = user.name;
      this.userRole = user.role;
    }

  }

  logout(): void {

    this.authService.logout();
    this.router.navigate(['/login']);

  }

}