// opportunity-matches.component.ts
// Renders opportunity cards with match score badge.

import { Component, OnInit } from '@angular/core';
import { MatchingService } from '../../matching.service';

@Component({ selector: 'app-opportunity-matches', templateUrl: './opportunity-matches.component.html', styleUrls: ['./opportunity-matches.component.css'] })
export class OpportunityMatchesComponent implements OnInit {
  opportunities: any[] = []; loading = false;
  constructor(private matchingService: MatchingService) {}
  ngOnInit(): void { this.load(); }
  load(): void { this.loading = true; this.matchingService.getMatchedOpportunities().subscribe({ next: (list) => { this.opportunities = list || []; this.loading = false; }, error: (err) => { console.error(err); this.loading = false; } }); }
  asPercentage(score?: number): number { if (score == null) return 0; if (score > 1) return Math.round(score); return Math.round(score * 100); }
}
