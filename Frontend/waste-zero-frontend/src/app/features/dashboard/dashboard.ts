import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {

  private router = inject(Router);

  logout() {

    localStorage.removeItem('token');

    this.router.navigate(['/login']);

  }

}