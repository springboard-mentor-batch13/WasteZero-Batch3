// ============================================
// OPPORTUNITY MATCHES COMPONENT — WasteZero Milestone 3 (Task 4)
// Card grid of volunteering opportunities with match scores.
// REST-only (HttpClient) via MatchingService.getMatchedOpportunities().
// Volunteer-only feature — backend authorizes GET /api/matches/suggestions
// to the 'volunteer' role only (match.routes.js).
// ============================================

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import { MatchingService } from '../../../../core/services/matching.service';
import { MatchSuggestion } from '../../../../core/services/match.service';

@Component({
  selector: 'app-opportunity-matches',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './opportunity-matches.component.html',
  styleUrl: './opportunity-matches.component.css',
})
export class OpportunityMatchesComponent implements OnInit {

  private matchingService = inject(MatchingService);

  matches       = signal<MatchSuggestion[]>([]);
  loading       = signal(false);
  error         = signal('');
  missingFields = signal<string[]>([]);

  ngOnInit(): void {
    this.loadMatches();
  }

  loadMatches(): void {
    this.loading.set(true);
    this.error.set('');
    this.missingFields.set([]);

    this.matchingService.getMatchedOpportunities(20).subscribe({
      next: (res) => {
        this.matches.set(res.data.matches);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        // Backend returns 400 + missingFields when the volunteer's
        // profile (skills/location) is incomplete rather than an empty list.
        if (err.status === 400 && err.error?.missingFields) {
          this.missingFields.set(err.error.missingFields);
        } else {
          this.error.set(err.error?.message || 'Failed to load matched opportunities.');
        }
      }
    });
  }

  // matchScore from the backend is (matchedSkillCount + locationMatchBonus),
  // not inherently a percentage. This derives a genuine 0–100% figure from
  // it: matched skills + location bonus, divided by the maximum possible
  // (required_skills.length + 1 for the location bonus).
  matchPercent(m: MatchSuggestion): number {
    const maxPossible = m.required_skills.length + 1;
    if (maxPossible <= 0) return 0;
    const pct = (m.matchScore / maxPossible) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  // ngo_id isn't populated by the backend (see match.service.ts note) —
  // falls back to a generic label instead of showing a raw ObjectId.
  organizationLabel(m: MatchSuggestion): string {
    return m.ngo_id ? 'NGO Partner' : 'Unknown Organization';
  }

  trackById(_index: number, m: MatchSuggestion): string {
    return m._id;
  }
}
