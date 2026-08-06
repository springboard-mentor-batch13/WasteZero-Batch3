import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { MatchService, MatchSuggestion } from '../../core/services/match.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit {

  private router      = inject(Router);
  private authService = inject(AuthService);
  private matchService = inject(MatchService);

  userName = '';
  userRole = '';

  // ── Volunteer match suggestions signals ──────────────────────────────
  matches           = signal<MatchSuggestion[]>([]);
  loadingMatches    = signal(false);
  matchError        = signal('');
  missingFields     = signal<string[]>([]);

  constructor() {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.userName = user.name;
      this.userRole = user.role;
    }
  }

  ngOnInit(): void {
    // Load match suggestions only for volunteers
    if (this.userRole === 'volunteer') {
      this.loadMatches();
    }
  }

  loadMatches(): void {
    this.loadingMatches.set(true);
    this.matchError.set('');
    this.missingFields.set([]);

    this.matchService.getSuggestions(5).subscribe({
      next: (res) => {
        this.matches.set(res.data.matches);
        this.loadingMatches.set(false);
      },
      error: (err) => {
        this.loadingMatches.set(false);
        if (err.status === 400 && err.error?.missingFields) {
          this.missingFields.set(err.error.missingFields);
        } else {
          this.matchError.set(err.error?.message || 'Failed to load suggestions.');
        }
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}