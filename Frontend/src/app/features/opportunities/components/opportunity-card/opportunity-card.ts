// ============================================
// OPPORTUNITY CARD COMPONENT — WasteZero M2
// Reusable card for opportunity grid/list views
// Angular 21 zoneless: signal inputs + computed
// ============================================

import { Component, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Opportunity, NgoRef } from '../../../../core/models/opportunity.model';

@Component({
  selector: 'app-opportunity-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './opportunity-card.html',
  styleUrl: './opportunity-card.css'
})
export class OpportunityCard {

  private router = inject(Router);

  // ── Signal inputs — properly reactive in Angular 21 zoneless ─────────
  // Angular's reactive graph tracks these. When the parent's signal array
  // changes, the parent re-renders and passes new Input values. Using
  // input() ensures Angular propagates changes inside the reactive graph,
  // preventing NG0100 from @Input() setter racing with the verify pass.
  opportunity  = input.required<Opportunity>();
  showActions  = input(false);

  // ── Outputs ──────────────────────────────────────────────────────────
  editClicked   = output<Opportunity>();
  deleteClicked = output<Opportunity>();

  // ── Computed signals — stable between check and verify passes ─────────
  // computed() caches the result and only re-runs when opportunity()
  // changes. Angular's reactive graph guarantees computed values are
  // stable within a single CD cycle — no NG0100 possible.
  readonly statusClass = computed(() => {
    const map: Record<string, string> = {
      'open':        'status-open',
      'in-progress': 'status-in-progress',
      'closed':      'status-closed'
    };
    return map[this.opportunity().status] ?? 'status-open';
  });

  readonly statusLabel = computed(() => {
    const map: Record<string, string> = {
      'open':        'Open',
      'in-progress': 'In Progress',
      'closed':      'Closed'
    };
    return map[this.opportunity().status] ?? this.opportunity().status;
  });

  readonly hasImage = computed(() => !!this.opportunity().image);

  readonly formattedDate = computed(() => {
    const opp = this.opportunity();
    if (!opp.createdAt) return '—';
    return new Date(opp.createdAt).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  });

  /** Formatted event date (the scheduled opportunity date, NOT createdAt) */
  readonly formattedEventDate = computed(() => {
    const opp = this.opportunity();
    if (!opp.date) return null;
    return new Date(opp.date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  });

  // M3: Extract NGO username from populated ngo_id object
  readonly ngoUsername = computed(() => {
    const ngo = this.opportunity().ngo_id;
    if (typeof ngo === 'object' && ngo !== null && 'username' in ngo) {
      return (ngo as NgoRef).username ?? null;
    }
    return null;
  });

  readonly ngoName = computed(() => {
    const ngo = this.opportunity().ngo_id;
    if (typeof ngo === 'object' && ngo !== null && 'name' in ngo) {
      return (ngo as NgoRef).name;
    }
    return null;
  });

  // ── Handlers ──────────────────────────────────────────────────────────

  onEdit(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.editClicked.emit(this.opportunity());
  }

  onDelete(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.deleteClicked.emit(this.opportunity());
  }

}
