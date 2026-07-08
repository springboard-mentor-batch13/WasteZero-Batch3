import { Component, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet
} from '@angular/router';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-layout',
  standalone: true,
   imports: [
  RouterOutlet,
  RouterLink,
  RouterLinkActive,
  TitleCasePipe
],
  templateUrl: './layout.html',
  styleUrl: './layout.css'
})
export class Layout {

  private router = inject(Router);

  // Make this public so HTML can use it
  public authService = inject(AuthService);

  logout(): void {

    this.authService.logout();

    this.router.navigate(['/login']);

  }

}